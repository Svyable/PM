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
  let listener,onUpdated,onRemoved,nextTabId=1,injections=0;
  const chrome={
    runtime:{onMessage:{addListener(fn){listener=fn;}},onStartup:{addListener(){}},onInstalled:{addListener(){}}},
    tabs:{
      async get(id){if(!tabs.has(id))throw Error('Tab not found');return tabs.get(id);},
      async create(opts){
        const id=++nextTabId;
        const expected=opts.url.split('/').at(-1);
        const isFirst=expected==='chat-one';
        const delayed=(options.slowFirst||options.permanentMismatch)&&isFirst;
        const tab={id,url:delayed?'https://chatgpt.com/':opts.url,status:delayed?'loading':'complete',
          route:delayed?null:expected,ready:!delayed};
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
          if(id===1)return{ok:true,version:'0.6.0',projectId:project,chat:null};
          return{ok:true,version:'0.6.0',projectId:null,chat:{projectId:project,chatId:tab.route}};
        }
        if(msg.type==='PM_CONTEXT')return{ok:true,projectId:project,count:2};
        if(msg.type==='PM_READY'){
          return{ok:true,ready:tab.ready&&tab.route===msg.cid,
            chat:{projectId:project,chatId:tab.route}};
        }
        if(msg.type==='PM_SCAN'){
          setTimeout(()=>void request('PM_SCANNED',{jobId:msg.jobId,found:2,chats},1),15);
          return{accepted:true};
        }
        if(msg.type==='PM_APPLY'){
          if(!tab.ready||tab.route!==msg.cid)throw Error('Wrong chat was targeted');
          attempts.push({tabId:id,chatId:msg.cid,prompt:msg.prompt,token:msg.attemptToken});
          const uncertain=options.uncertainFirst&&msg.cid==='chat-one';
          setTimeout(()=>void request('PM_RESULT',{
            jobId:msg.jobId,chatId:msg.cid,attemptToken:msg.attemptToken,
            ok:!uncertain,uncertain,reasonCode:uncertain?'unconfirmed':'sent',
            error:uncertain?'No matching rendered user message':null
          },id),20);
          return{accepted:true};
        }
        return{ok:true};
      },
      onUpdated:{addListener(fn){onUpdated=fn;}},
      onRemoved:{addListener(fn){onRemoved=fn;}}
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
  return{request,prefs,storage,attempts,opened,tabs,get injections(){return injections;}};
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
  console.log('PM v0.6 coordinator tests passed: delayed first tab, stale ID, timeout pause, same-tab retry, queue isolation, circuit breaker.');
})().catch(e=>{console.error(e);process.exitCode=1;});
