/* PM worker integration tests: Chrome MV3 navigation and queue identity simulations. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','extension','background.js'),'utf8');
const fleetSource=fs.readFileSync(path.join(__dirname,'..','extension','fleets.js'),'utf8');
const project='g-p-example';
const projectURL='https://chatgpt.com/g/'+project+'/project';
const chats=[
  {id:'chat-one',title:'First chat',url:'https://chatgpt.com/g/'+project+'/c/chat-one'},
  {id:'chat-two',title:'Second chat',url:'https://chatgpt.com/g/'+project+'/c/chat-two'}
];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(check,label,timeout=12000){
  const start=Date.now();
  while(!check()&&Date.now()-start<timeout)await delay(20);
  assert.ok(check(),'Timed out waiting for '+label);
}
function setup(options={}){
  const storage={},tabs=new Map(),injected=new Set(),attempts=[],opened=[],discardChanges=[];
  tabs.set(1,{id:1,windowId:42,url:projectURL,status:'complete',route:null,ready:true});
  let listener,onUpdated,onRemoved,onActivated,nextTabId=1,injections=0,sideOpens=0,repairUpdates=0,busyReadyChecks=0,limitReadyChecks=0;
  const chrome={
    runtime:{onMessage:{addListener(fn){listener=fn;}},onStartup:{addListener(){}},onInstalled:{addListener(){}}},
    sidePanel:{async setPanelBehavior(opts){assert.equal(opts.openPanelOnActionClick,true);},async open(opts){assert.equal(opts.windowId,42,'side panel must be window-wide, not tab-specific');assert.equal(opts.tabId,undefined);sideOpens++;}},
    tabs:{
      async query(){return [...tabs.values()];},
      async get(id){if(!tabs.has(id))throw Error('Tab not found');return tabs.get(id);},
      async create(opts){
        const id=++nextTabId;
        const expected=opts.url.split('/').at(-1);
        const isFirst=expected==='chat-one',creating=expected==='project';
        const delayed=(options.slowFirst||options.permanentMismatch)&&isFirst;
        const tab={id,windowId:42,url:delayed?'https://chatgpt.com/':opts.url,status:delayed?'loading':'complete',
          route:delayed||creating?null:expected,ready:!delayed};
        tabs.set(id,tab);opened.push({id,url:opts.url});
        if(delayed){
          setTimeout(()=>{
            tab.url=opts.url;tab.route='chat-two';tab.ready=false;
            onUpdated?.(id,{url:opts.url});
          },35);
          if(!options.permanentMismatch)setTimeout(()=>{
            tab.route=expected;tab.ready=true;tab.status='complete';
            onUpdated?.(id,{status:'complete'});
          },options.delayMs||400);
        }else setTimeout(()=>onUpdated?.(id,{status:'complete'}),0);
        return tab;
      },
      async update(id,opts){
        const tab=tabs.get(id);
        if(!tab)throw Error('Tab not found');
        if(typeof opts.autoDiscardable==='boolean'&&opts.url===undefined){
          tab.autoDiscardable=opts.autoDiscardable;
          discardChanges.push({id,value:opts.autoDiscardable});
          return tab;
        }
        repairUpdates++;
        tab.url=opts.url;
        tab.route=opts.url.split('/').at(-1);
        tab.ready=true;tab.status='complete';
        setTimeout(()=>onUpdated?.(id,{status:'complete',url:opts.url}),0);
        return tab;
      },
      async remove(id){tabs.delete(id);setTimeout(()=>onRemoved?.(id),0);},
      async sendMessage(id,msg){
        if(!injected.has(id))throw Error('Receiving end does not exist');
        const tab=tabs.get(id);if(!tab)throw Error('Tab not found');
        if(msg.type==='PM_PING'){
          if(id===1||tab.url===projectURL)return{ok:true,version:'0.12.0',projectId:project,chat:null};
          return{ok:true,version:'0.12.0',projectId:null,chat:{projectId:project,chatId:tab.route}};
        }
        if(msg.type==='PM_CONTEXT')return{ok:true,projectId:project,count:2,chats,projectTitle:'/demo'};
        if(msg.type==='PM_HEALTH')return{ok:true,projectId:project,composerReady:true,effort:'High',generating:false,draftPresent:false};
        if(msg.type==='PM_VERIFY_ATTEMPT'){
          const matched=tab.confirmedPrompt===msg.prompt;
          return{ok:true,verified:!!matched&&Number.isInteger(msg.beforeCount)&&msg.beforeCount===0&&
            Number.isInteger(msg.beforeMatching)&&msg.beforeMatching===0,
            chatId:tab.route,projectId:project,createdUrl:tab.url};
        }
        if(msg.type==='PM_READY'){
          const busy=!!(options.busyFirstReadies&&msg.cid==='chat-one'&&++busyReadyChecks<=options.busyFirstReadies);
          const blocked=!!(options.limitFirstReadies&&msg.cid==='chat-one'&&++limitReadyChecks<=options.limitFirstReadies);
          return{ok:true,ready:tab.ready&&tab.route===msg.cid&&!busy&&!blocked,busy,
            blocked:blocked?'You have reached your usage limit':null,
            chat:{projectId:project,chatId:tab.route}};
        }
        if(msg.type==='PM_NEW_READY'){
          return{ok:true,ready:tab.ready&&tab.url===projectURL&&msg.pid===project,projectId:project};
        }
        if(msg.type==='PM_SCAN'){
          if(options.streaming){
            setTimeout(()=>void request('PM_SCAN_PROGRESS',{jobId:msg.jobId,found:1,step:0,chats:[chats[0]]},1),10);
            setTimeout(()=>void request('PM_SCANNED',{jobId:msg.jobId,found:2,chats},1),1300);
          }else{
            setTimeout(()=>void request('PM_SCAN_PROGRESS',{jobId:msg.jobId,found:2,step:0,chats},1),10);
            setTimeout(()=>void request('PM_SCANNED',{jobId:msg.jobId,found:2,chats},1),15);
          }
          return{accepted:true};
        }
        if(msg.type==='PM_INVENTORY_SCAN'){
          setTimeout(()=>void request('PM_INVENTORY_DONE',{pid:project,chats,step:1},1),10);
          return{accepted:true};
        }
        if(msg.type==='PM_STATUS')return{ok:true,generating:false};
        if(msg.type==='PM_APPLY'){
          const creating=msg.kind==='new';
          if(!tab.ready||(creating?tab.url!==projectURL:tab.route!==msg.cid))throw Error('Wrong chat was targeted');
          attempts.push({tabId:id,chatId:msg.cid,kind:msg.kind||'existing',prompt:msg.prompt,token:msg.attemptToken});
          const uncertain=(options.uncertainFirst&&msg.cid==='chat-one')||
            (options.uncertainSecond&&msg.cid==='chat-two')||
            (options.uncertainNew&&creating&&msg.cid==='new:0');
          const skipped=options.draftFirst&&msg.cid==='chat-one';
          const wrongRoute=(options.routeChangedBeforeSend||options.routeChangedAfterInsertion)&&
            msg.cid==='chat-one'&&!tab.routeFixedOnce;
          if(wrongRoute){
            tab.routeFixedOnce=true;
            tab.url='https://chatgpt.com/g/'+project+'/c/chat-two';
            tab.route='chat-two';
          }
          const created=creating?'generated-'+id:null;
          if(creating){
            tab.route=created;
            tab.url='https://chatgpt.com/g/'+project+'/c/'+created;
            if(options.lostAckNew)tab.confirmedPrompt=msg.prompt;
            setTimeout(()=>onUpdated?.(id,{url:tab.url}),0);
          }
          if(options.lostAckNew&&creating){
            // Full navigation kills the original adapter before PM_RESULT.
            setTimeout(()=>void request('PM_STAGE',{
              jobId:msg.jobId,chatId:msg.cid,attemptToken:msg.attemptToken,
              phase:'submitting',beforeCount:0,beforeMatching:0
            },id),4);
            return{accepted:true};
          }
          setTimeout(()=>void request('PM_RESULT',{
            jobId:msg.jobId,chatId:msg.cid,attemptToken:msg.attemptToken,
            ok:!uncertain&&!skipped&&!wrongRoute&&
              !(options.rateLimitAfterApply&&msg.cid==='chat-one'),uncertain,
            injected:!!(options.routeChangedAfterInsertion&&wrongRoute)||!!(options.rateLimitAfterApply&&msg.cid==='chat-one'),
            reasonCode:options.rateLimitAfterApply&&msg.cid==='chat-one'?'rate-limit':
              wrongRoute?'wrong-chat':uncertain?'unconfirmed':skipped?'draft':'sent',
            error:options.rateLimitAfterApply&&msg.cid==='chat-one'?'ChatGPT usage limit; nothing was submitted.':
              wrongRoute?'ChatGPT changed conversations before Send. Nothing was submitted.':uncertain?'No matching rendered user message':skipped?'Existing draft preserved':null,
            ...(creating?{createdChatId:created,createdUrl:tab.url}:{})
          },id),options.resultDelayMs||20);
          return{accepted:true};
        }
        return{ok:true};
      },
      onUpdated:{addListener(fn){onUpdated=fn;}},
      onRemoved:{addListener(fn){onRemoved=fn;}},
      onActivated:{addListener(fn){onActivated=fn;}}
    },
    storage:{local:{
      async get(k){return Object.fromEntries((Array.isArray(k)?k:[k]).map(key=>[key,storage[key]]));},
      async set(v){
         if(options.failFleetLedger&&Object.prototype.hasOwnProperty.call(v,'pmProjectFleets'))
           throw Error('Simulated Chrome storage quota error');
         Object.assign(storage,v);
       }
    }},
    scripting:{async executeScript({target}){injected.add(target.tabId);injections++;}},
    alarms:{async create(){},async clear(){},onAlarm:{addListener(){}}},
    action:{async setBadgeText(){},async setBadgeBackgroundColor(){}}
  };
  const ctx={chrome,console,Date,Math,Promise,URL,setTimeout,clearTimeout,
    importScripts(file){if(file!=='fleets.js')throw Error('Unexpected import: '+file);}};
  vm.createContext(ctx);
  vm.runInContext(fleetSource,ctx,{filename:'fleets.js'});
  vm.runInContext(source,ctx,{filename:'background.js'});
  function request(type,args={},tabId=null){
    const sender=tabId===null?{url:'chrome-extension://pm/popup.html'}:{tab:tabs.get(tabId)};
    return new Promise(resolve=>{
      const handled=listener({type,...args},sender,r=>resolve(r));
      if(!handled)resolve({ok:false,error:'Unhandled request'});
    });
  }
  const prefs={target:2,prompt:'proceed methodically',effort:'High',
    delaySeconds:2,loadTimeoutSeconds:180,keepTabs:true};
  return{request,prefs,storage,attempts,opened,tabs,discardChanges,
    updateTab(tabId,change={status:'complete'}){onUpdated?.(tabId,change);},
    activate(tabId){onActivated?.({tabId});},
    get injections(){return injections;},get sideOpens(){return sideOpens;},
    get repairUpdates(){return repairUpdates;},get busyReadyChecks(){return busyReadyChecks;}};
}
(async()=>{
  const normal=setup();
  assert.equal((await normal.request('PM_START',{tabId:1,config:normal.prefs})).ok,true);
  await waitFor(()=>normal.storage.pmJob?.status==='done','normal queue');
  assert.equal(normal.storage.pmJob.completed,2);
  assert.equal(normal.storage.pmJob.failed,0);
  assert.equal(normal.attempts.length,2,'tab update must not double send');
  assert.equal(new Set(normal.attempts.map(a=>a.token)).size,2);
  assert.ok(normal.injections>=3,'dynamic injection should attach to each tab');
  assert.equal(normal.discardChanges.filter(x=>x.value===false).length,2,
    'only active PM-owned tabs should be protected against auto-discard');
  assert.equal(normal.discardChanges.filter(x=>x.value===true).length,2,
    'PM restores auto-discardability after each completed dispatch');

  const busy=setup({busyFirstReadies:2});
  await busy.request('PM_START',{tabId:1,config:busy.prefs});
  await waitFor(()=>busy.storage.pmJob?.status==='done','wait for target generation to stop',12000);
  assert.ok(busy.busyReadyChecks>=3,'worker must poll until generation completes');
  assert.equal(busy.storage.pmJob.completed,2);
  assert.equal(busy.attempts.length,2,'no duplicate send while target is busy');

  // Late and out-of-order status messages cannot regress the current stage
  // or resurrect a completed job after its result has been saved.
  const stageOrder=setup({resultDelayMs:150});
  await stageOrder.request('PM_START',{tabId:1,config:{
    ...stageOrder.prefs,target:1,mode:'new',newCount:1
  }});
  await waitFor(()=>stageOrder.storage.pmJob?.current?.phase==='sending','stage ownership',6000);
  const owned=stageOrder.storage.pmJob.current;
  assert.equal((await stageOrder.request('PM_STAGE',{
    jobId:stageOrder.storage.pmJob.id,chatId:owned.chatId,attemptToken:owned.attemptToken,
    phase:'verifying',detail:'test'
  },owned.tabId)).ok,true);
  assert.equal((await stageOrder.request('PM_STAGE',{
    jobId:stageOrder.storage.pmJob.id,chatId:owned.chatId,attemptToken:owned.attemptToken,
    phase:'preparing',detail:'late'
  },owned.tabId)).ok,false);
  assert.equal(stageOrder.storage.pmJob.current.stage,'verifying');
  await waitFor(()=>stageOrder.storage.pmJob?.status==='done','stage race done',7500);
  assert.equal((await stageOrder.request('PM_STAGE',{
    jobId:stageOrder.storage.pmJob.id,chatId:owned.chatId,attemptToken:owned.attemptToken,
    phase:'injected'
  },owned.tabId)).ok,false,'no late stage write after finish');
  assert.equal(stageOrder.storage.pmJob.current,null);

  const limited=setup({limitFirstReadies:1});
  await limited.request('PM_START',{tabId:1,config:limited.prefs});
  await waitFor(()=>limited.storage.pmJob?.status==='paused','pause on ChatGPT usage limit',6000);
  assert.equal(limited.attempts.length,0,'no Send under account limit');
  assert.match(limited.storage.pmJob.pauseReason,/usage or rate limit/i);
  assert.equal((await limited.request('PM_RESUME')).ok,true);
  await waitFor(()=>limited.storage.pmJob?.status==='done','resume after limit clears',10000);
  assert.equal(limited.storage.pmJob.completed,2);

  const limitedAfterInput=setup({rateLimitAfterApply:true});
  await limitedAfterInput.request('PM_START',{tabId:1,config:limitedAfterInput.prefs});
  await waitFor(()=>limitedAfterInput.storage.pmJob?.status==='paused','late limit pauses',6000);
  assert.equal(limitedAfterInput.storage.pmJob.index,0);
  assert.match(limitedAfterInput.storage.pmJob.pauseReason,/usage or rate limit/i);

  const projectSelection=setup();
  const health=await projectSelection.request('PM_GET_HEALTH',{tabId:1});
  assert.equal(health.ok,true);
  assert.equal(health.composerReady,true);
  assert.equal(health.effort,'High');
  const found=await projectSelection.request('PM_FIND_PROJECT',{});
  assert.equal(found.ok,true);
  assert.equal(found.tabId,1);
  assert.equal(found.projectId,project);
  const openedPanel=await projectSelection.request('PM_OPEN_PANEL',{},1);
  assert.equal(openedPanel.ok,true);
  assert.equal(projectSelection.sideOpens,1,'project button must open native side panel');

  // User-reported 0/2 pause: ChatGPT changes route AFTER the readiness check
  // but BEFORE Send. Adapter explicitly reports no click; PM restores the
  // original tab route and retries this queue item once, never sends wrong.
  const repair=setup({routeChangedBeforeSend:true});
  await repair.request('PM_START',{tabId:1,config:repair.prefs});
  await waitFor(()=>repair.storage.pmJob?.status==='done','pre-send redirect recovery',10000);
  assert.equal(repair.storage.pmJob.completed,2);
  assert.equal(repair.storage.pmJob.failed,0);
  assert.equal(repair.storage.pmJob.results[0].routeRepairs,1);
  assert.equal(repair.repairUpdates,1);
  assert.deepEqual(Array.from(repair.storage.pmJob.results,x=>x.queueId),['chat-one','chat-two']);

  const draftRoute=setup({routeChangedAfterInsertion:true});
  await draftRoute.request('PM_START',{tabId:1,config:draftRoute.prefs});
  await waitFor(()=>draftRoute.storage.pmJob?.status==='paused','draft left after late navigation',6000);
  assert.equal(draftRoute.storage.pmJob.index,0,'do not advance after unsent draft');
  assert.equal(draftRoute.repairUpdates,0,'do not automatically reopen after injection');
  assert.match(draftRoute.storage.pmJob.pauseReason,/unsent draft/i);

  const uncertain=setup({uncertainFirst:true});
  await uncertain.request('PM_START',{tabId:1,config:uncertain.prefs});
  await waitFor(()=>uncertain.storage.pmJob?.status==='paused','uncertain send pause');
  assert.equal(uncertain.attempts.length,1);
  assert.equal(uncertain.storage.pmJob.index,1,'uncertain chat marked once, not retried');
  assert.equal((await uncertain.request('PM_RESUME')).ok,true);
  await waitFor(()=>uncertain.storage.pmJob?.status==='done','uncertain run resume');
  assert.deepEqual(uncertain.attempts.map(a=>a.chatId),['chat-one','chat-two']);

  // New-only mode starts fresh conversations from the project composer:
  // no inventory scan, each send returns a NEW project chat URL and ID.
  const fresh=setup();
  await fresh.request('PM_START',{tabId:1,config:{...fresh.prefs,target:3,mode:'new',newCount:3}});
  await waitFor(()=>fresh.storage.pmJob?.status==='done','three newly created chats',12000);
  assert.equal(fresh.storage.pmJob.found,0,'new-only mode does not scan existing chats');
  assert.equal(fresh.storage.pmJob.completed,3);
  assert.equal(fresh.opened.length,3);
  assert.ok(fresh.opened.every(row=>row.url===projectURL));
  assert.ok(fresh.attempts.every(a=>a.kind==='new'));
  assert.equal(new Set(fresh.storage.pmJob.results.map(r=>r.id)).size,3);
  assert.ok(fresh.storage.pmJob.results.every(r=>r.kind==='new'&&r.url.includes('/g/'+project+'/c/generated-')));

  // Full navigation may terminate the original adapter immediately after Send.
  // Recover proof read-only from the destination without repeating a click.
  const recovered=setup({lostAckNew:true});
  await recovered.request('PM_START',{tabId:1,config:{...recovered.prefs,target:1,mode:'new',newCount:1}});
  await waitFor(()=>recovered.storage.pmJob?.status==='done','destination-page verified new chat',9000);
  assert.equal(recovered.storage.pmJob.completed,1);
  assert.equal(recovered.storage.pmJob.results[0].verificationSource,'destination');
  assert.equal(recovered.storage.pmJob.results[0].submitMethod,'observed');
  assert.equal(recovered.attempts.length,1,'navigation witness must never repeat Send');
  assert.equal(recovered.storage.pmJob.results[0].id,'generated-2');

  // Mixed mode continues the existing two chats then starts one new thread.
  const mixed=setup();
  await mixed.request('PM_START',{tabId:1,config:{...mixed.prefs,target:3,mode:'mixed',newCount:1}});
  await waitFor(()=>mixed.storage.pmJob?.status==='done','mixed existing/new queue',12000);
  assert.deepEqual(mixed.attempts.map(a=>a.kind),['existing','existing','new']);
  assert.equal(mixed.storage.pmJob.completed,3);
  assert.equal(mixed.storage.pmJob.results[2].kind,'new');

  // A new conversation may have been created even when confirmation fails:
  // never click Send again for that same synthetic queue item.
  const uncertainNew=setup({uncertainNew:true});
  await uncertainNew.request('PM_START',{tabId:1,config:{...uncertainNew.prefs,target:2,mode:'new',newCount:2}});
  await waitFor(()=>uncertainNew.storage.pmJob?.status==='paused','new chat uncertain pause',7000);
  assert.equal(uncertainNew.storage.pmJob.index,1);
  assert.equal(uncertainNew.attempts.length,1);
  assert.equal((await uncertainNew.request('PM_RESUME')).ok,true);
  await waitFor(()=>uncertainNew.storage.pmJob?.status==='done','resume remaining new chat',8000);
  assert.deepEqual(uncertainNew.attempts.map(a=>a.chatId),['new:0','new:1']);
  assert.equal(uncertainNew.storage.pmJob.failed,1);

  // Project-level launch: role-specific workstreams with persistent mapping.
  const seeded=setup();
  const seedMission='Build a sustainable independent research business with measurable unit economics.';
  const seedConfig={...seeded.prefs,target:3,mode:'fleet-start',fleetTemplate:'business',mission:seedMission};
  assert.equal((await seeded.request('PM_START',{tabId:1,config:seedConfig})).ok,true);
  await waitFor(()=>seeded.storage.pmJob?.status==='done','seed three distinct role chats',14000);
  assert.equal(seeded.storage.pmJob.completed,3);
  assert.equal(new Set(seeded.attempts.map(a=>a.prompt)).size,3);
  assert.ok(seeded.attempts[0].prompt.includes('Opportunity Architect'));
  assert.ok(seeded.attempts[1].prompt.includes('Customer Investigator'));
  assert.ok(seeded.attempts[2].prompt.includes('Unit Economics Analyst'));
  const ledger=seeded.storage.pmProjectFleets?.[project];
  assert.ok(ledger);
  assert.equal(ledger.templateId,'business');
  assert.equal(ledger.threads.length,3);
  const fleetInfo=await seeded.request('PM_GET_FLEET',{tabId:1});
  assert.equal(fleetInfo.ok,true);
  assert.equal(fleetInfo.fleet.threads.length,3);
  assert.equal((await seeded.request('PM_START',{tabId:1,config:seedConfig})).ok,false,
    'never accidentally reseed an existing Project fleet');
  const lastAttempt=seeded.attempts.length;
  assert.equal((await seeded.request('PM_START',{tabId:1,config:{
    ...seedConfig,target:3,mode:'fleet-continue',newCount:0
  }})).ok,true);
  await waitFor(()=>seeded.storage.pmJob?.status==='done'&&seeded.attempts.length===lastAttempt+3,
    'continue the original mapped conversations',14000);
  assert.equal(seeded.storage.pmJob.completed,3);
  const followups=seeded.attempts.slice(lastAttempt);
  assert.ok(followups.every(a=>a.kind==='existing'));
  assert.ok(followups.every(a=>a.prompt.includes('CONTINUATION 1:')));
  assert.equal(new Set(followups.map(a=>a.prompt)).size,3);
  assert.deepEqual(followups.map(a=>a.chatId),Array.from(ledger.threads,x=>x.id));
  assert.equal(seeded.storage.pmProjectFleets[project].cycle,1);

  // If fleet mapping storage fails AFTER a verified Send, never resend.
  const quota=setup({failFleetLedger:true});
  await quota.request('PM_START',{tabId:1,config:{
    ...quota.prefs,target:1,mode:'fleet-start',fleetTemplate:'brainswarm',mission:'Investigate a test mission.'
  }});
  await waitFor(()=>quota.storage.pmJob?.status==='paused','fleet storage warning',7000);
  assert.equal(quota.storage.pmJob.completed,1);
  assert.equal(quota.storage.pmJob.results[0].ledgerSaved,false);
  assert.match(quota.storage.pmJob.results[0].warning,/could not be saved/i);
  assert.equal(quota.attempts.length,1);
  assert.equal((await quota.request('PM_RESUME')).ok,true);
  await waitFor(()=>quota.storage.pmJob?.status==='done','resume without resending',3000);
  assert.equal(quota.attempts.length,1);

  // Critical v1 gate: a final unconfirmed send must NOT display a green
  // completed run, even when all queued conversations have been attempted.
  const finalUncertain=setup({uncertainSecond:true});
  await finalUncertain.request('PM_START',{tabId:1,config:finalUncertain.prefs});
  await waitFor(()=>finalUncertain.storage.pmJob?.status==='paused'&&finalUncertain.storage.pmJob.index===2,'final unconfirmed attention state',8000);
  assert.equal(finalUncertain.storage.pmJob.completed,1);
  assert.equal(finalUncertain.storage.pmJob.failed,1);
  assert.equal(finalUncertain.storage.pmJob.results[1].uncertain,true);
  assert.equal(finalUncertain.storage.pmJob.status,'paused','final uncertain result must remain attention-needed');
  assert.equal((await finalUncertain.request('PM_RESUME')).ok,true);
  await waitFor(()=>finalUncertain.storage.pmJob?.status==='done','acknowledged final result',2500);
  assert.equal(finalUncertain.attempts.length,2,'acknowledgment must not retry the last send');

  // Pre-send failure reports must advance promptly; do not stall for 90 s.
  const draftSkip=setup({draftFirst:true});
  await draftSkip.request('PM_START',{tabId:1,config:draftSkip.prefs});
  await waitFor(()=>draftSkip.storage.pmJob?.status==='done','draft skip and next chat',7500);
  assert.equal(draftSkip.storage.pmJob.failed,1);
  assert.equal(draftSkip.storage.pmJob.completed,1);
  assert.equal(draftSkip.storage.pmJob.results[0].reasonCode,'draft');

  // The toolbar and project dock may both be used: only one job can start.
  const concurrent=setup();
  const starts=await Promise.all([
    concurrent.request('PM_START',{tabId:1,config:concurrent.prefs}),
    concurrent.request('PM_START',{tabId:1,config:concurrent.prefs})
  ]);
  assert.equal(starts.filter(x=>x.ok===true).length,1);
  assert.equal(starts.filter(x=>x.ok===false).length,1);
  await waitFor(()=>concurrent.storage.pmJob?.status==='done','single concurrent run',7500);
  assert.equal(concurrent.attempts.length,2);

  const delayed=setup({slowFirst:true,delayMs:1100});
  await delayed.request('PM_START',{tabId:1,config:delayed.prefs});
  await waitFor(()=>delayed.storage.pmJob?.current?.phase==='waiting','first tab waiting');
  await delay(250);
  assert.equal(delayed.opened.length,1,'must not open second tab while first route is wrong');
  assert.equal(delayed.attempts.length,0,'must not send while first tab route mismatches');
  await waitFor(()=>delayed.attempts.length>=1,'first tab eventually sends');
  assert.equal(delayed.attempts[0].chatId,'chat-one');
  await waitFor(()=>delayed.storage.pmJob?.status==='done','slow first tab, then second');
  assert.deepEqual(delayed.attempts.map(a=>a.chatId),['chat-one','chat-two']);

  const redirect=setup({permanentMismatch:true});
  await redirect.request('PM_START',{tabId:1,config:{...redirect.prefs,target:2,loadTimeoutSeconds:30}});
  await waitFor(()=>redirect.storage.pmJob?.current?.phase==='waiting','redirect test starts');
  const firstId=redirect.opened[0].id;
  redirect.storage.pmJob.current.startedAt=Date.now()-32000; // simulate expired slow page
  await waitFor(()=>redirect.storage.pmJob?.status==='paused','timeout pauses same item',5000);
  assert.equal(redirect.storage.pmJob.index,0);
  assert.equal(redirect.storage.pmJob.results.length,0,'no chat skipped by slow load');
  assert.equal(redirect.opened.length,1);
  assert.equal(redirect.attempts.length,0);
  const first=redirect.tabs.get(firstId);first.route='chat-one';first.ready=true;first.status='complete';
  assert.equal((await redirect.request('PM_RESUME')).ok,true);
  await waitFor(()=>redirect.attempts.length===1,'resumed original tab',5000);
  assert.equal(redirect.attempts[0].tabId,firstId,'must reuse original tab, not open new first tab');
  await waitFor(()=>redirect.storage.pmJob?.status==='done','resumed first then second');
  assert.deepEqual(redirect.attempts.map(a=>a.chatId),['chat-one','chat-two']);
  // User-reported hang: scan discovers its first chat early, but the full
  // project scan is still running. The first tab must launch immediately.
  const streaming=setup({streaming:true});
  await streaming.request('PM_START',{tabId:1,config:streaming.prefs});
  await waitFor(()=>streaming.attempts.length>=1,'first dispatch before scan complete',1200);
  assert.equal(streaming.storage.pmJob.scanComplete,false,'full scan still pending');
  assert.equal(streaming.attempts[0].chatId,'chat-one');
  await waitFor(()=>streaming.storage.pmJob?.status==='done','streaming two-chat queue',9000);
  assert.deepEqual(streaming.attempts.map(a=>a.chatId),['chat-one','chat-two']);
  const host=await streaming.request('PM_HOST_CONTEXT',{},1);
  assert.equal(host.tabId,1);
  const stats=await streaming.request('PM_GET_OVERVIEW',{tabId:1});
  assert.equal(stats.ok,true);
  assert.equal(stats.known,2);
  assert.equal(stats.openTabs,2);
  assert.equal(stats.generatingObserved,0);
  assert.ok(Array.isArray(stats.chats)&&stats.chats.length===2);
  streaming.activate(streaming.opened[0].id);
  await waitFor(()=>!!streaming.storage.pmVisits?.[project]?.['chat-one'],'PM-tracked visit',1000);
  const visited=await streaming.request('PM_GET_OVERVIEW',{tabId:1});
  assert.equal(visited.trackedSeen,1);
  console.log('PM v0.7 coordinator passed: streaming first dispatch, tab route safety, status inventory, visits, safe resume.');
})().catch(e=>{console.error(e);process.exitCode=1;});
