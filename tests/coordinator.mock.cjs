/* PM worker integration tests: Chrome MV3 navigation and queue identity simulations. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','extension','background.js'),'utf8');
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
  const storage={},tabs=new Map(),injected=new Set(),attempts=[],opened=[];
  tabs.set(1,{id:1,url:projectURL,status:'complete',route:null,ready:true});
  let listener,onUpdated,onRemoved,onActivated,nextTabId=1,injections=0;
  const chrome={
    runtime:{onMessage:{addListener(fn){listener=fn;}},onStartup:{addListener(){}},onInstalled:{addListener(){}}},
    tabs:{
      async query(){return [...tabs.values()];},
      async get(id){if(!tabs.has(id))throw Error('Tab not found');return tabs.get(id);},
      async create(opts){
        const id=++nextTabId;
        const expected=opts.url.split('/').at(-1);
        const isFirst=expected==='chat-one',creating=expected==='project';
        const delayed=(options.slowFirst||options.permanentMismatch)&&isFirst;
        const tab={id,url:delayed?'https://chatgpt.com/':opts.url,status:delayed?'loading':'complete',
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
      async remove(id){tabs.delete(id);setTimeout(()=>onRemoved?.(id),0);},
      async sendMessage(id,msg){
        if(!injected.has(id))throw Error('Receiving end does not exist');
        const tab=tabs.get(id);if(!tab)throw Error('Tab not found');
        if(msg.type==='PM_PING'){
          if(id===1||tab.url===projectURL)return{ok:true,version:'0.9.0',projectId:project,chat:null};
          return{ok:true,version:'0.9.0',projectId:null,chat:{projectId:project,chatId:tab.route}};
        }
        if(msg.type==='PM_CONTEXT')return{ok:true,projectId:project,count:2,chats,projectTitle:'/demo'};
        if(msg.type==='PM_READY'){
          return{ok:true,ready:tab.ready&&tab.route===msg.cid,
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
          const created=creating?'generated-'+id:null;
          if(creating){
            tab.route=created;
            tab.url='https://chatgpt.com/g/'+project+'/c/'+created;
            setTimeout(()=>onUpdated?.(id,{url:tab.url}),0);
          }
          setTimeout(()=>void request('PM_RESULT',{
            jobId:msg.jobId,chatId:msg.cid,attemptToken:msg.attemptToken,
            ok:!uncertain&&!skipped,uncertain,
            reasonCode:uncertain?'unconfirmed':skipped?'draft':'sent',
            error:uncertain?'No matching rendered user message':skipped?'Existing draft preserved':null,
            ...(creating?{createdChatId:created,createdUrl:tab.url}:{})
          },id),20);
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
      async set(v){Object.assign(storage,v);}
    }},
    scripting:{async executeScript({target}){injected.add(target.tabId);injections++;}},
    alarms:{async create(){},async clear(){},onAlarm:{addListener(){}}},
    action:{async setBadgeText(){},async setBadgeBackgroundColor(){}}
  };
  const ctx={chrome,console,Date,Math,Promise,URL,setTimeout,clearTimeout};
  vm.runInNewContext(source,ctx,{filename:'background.js'});
  function request(type,args={},tabId=null){
    const sender=tabId===null?{url:'chrome-extension://pm/popup.html'}:{tab:tabs.get(tabId)};
    return new Promise(resolve=>{
      const handled=listener({type,...args},sender,r=>resolve(r));
      if(!handled)resolve({ok:false,error:'Unhandled request'});
    });
  }
  const prefs={target:2,prompt:'proceed methodically',effort:'High',
    delaySeconds:2,loadTimeoutSeconds:180,keepTabs:true};
  return{request,prefs,storage,attempts,opened,tabs,activate(tabId){onActivated?.({tabId});},get injections(){return injections;}};
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
