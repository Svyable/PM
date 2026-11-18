/* PM worker integration tests: simulated Chrome tabs, service worker events and messages. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','extension','background.js'),'utf8');
const PROJECT='g-p-example';
const projectURL='https://chatgpt.com/g/'+PROJECT+'/project';
const chats=[
  {id:'chat-one',title:'First chat',url:'https://chatgpt.com/g/'+PROJECT+'/c/chat-one'},
  {id:'chat-two',title:'Second chat',url:'https://chatgpt.com/g/'+PROJECT+'/c/chat-two'}
];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(check,label,timeout=6000){
  const start=Date.now();
  while(!check()&&Date.now()-start<timeout)await delay(20);
  assert.ok(check(),'Timed out: '+label);
}
function setup(firstUncertain=false){
  const storage={},tabs=new Map(),injected=new Set(),attempts=[];
  const project={id:1,url:projectURL,status:'complete'};tabs.set(1,project);
  let listener,updated,removed,nextTabId=1,injections=0;
  const chrome={
    runtime:{
      onMessage:{addListener(fn){listener=fn;}},
      onStartup:{addListener(){}},onInstalled:{addListener(){}}
    },
    tabs:{
      async get(id){if(!tabs.has(id))throw Error('Tab not found');return tabs.get(id);},
      async create(opts){
        const t={id:++nextTabId,url:opts.url,status:'complete'};
        tabs.set(t.id,t);
        // Simulate a Chrome load event racing the coordinator's post-create check.
        setTimeout(()=>updated?.(t.id,{status:'complete'}),0);
        return t;
      },
      async remove(id){tabs.delete(id);setTimeout(()=>removed?.(id),0);},
      async sendMessage(id,message){
        if(!injected.has(id))throw Error('Receiving end does not exist');
        if(message.type==='PM_PING'){
          if(id===1)return{ok:true,version:'0.5.0',projectId:PROJECT,chat:null};
          const m=tabs.get(id)?.url.match(/\/c\/([^/?]+)/);
          return{ok:true,version:'0.5.0',projectId:null,chat:{projectId:PROJECT,chatId:m?.[1]}};
        }
        if(message.type==='PM_CONTEXT')return{ok:true,projectId:PROJECT,count:2};
        if(message.type==='PM_SCAN'){
          setTimeout(()=>void request('PM_SCANNED',{jobId:message.jobId,found:2,chats},1),15);
          return{accepted:true};
        }
        if(message.type==='PM_APPLY'){
          attempts.push({tabId:id,chatId:message.cid,prompt:message.prompt});
          const uncertain=firstUncertain&&message.cid==='chat-one';
          setTimeout(()=>void request('PM_RESULT',{jobId:message.jobId,chatId:message.cid,ok:!uncertain,uncertain,reasonCode:uncertain?'unconfirmed':'sent',error:uncertain?'No matching message':'none'},id),20);
          return{accepted:true};
        }
        return{ok:true};
      },
      onUpdated:{addListener(fn){updated=fn;}},
      onRemoved:{addListener(fn){removed=fn;}}
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
  vm.runInNewContext(src,ctx,{filename:'background.js'});
  function request(type,args={},tabId=null){
    const sender=tabId===null?{url:'chrome-extension://pm/popup.html'}:{tab:tabs.get(tabId)};
    return new Promise(resolve=>{
      const handled=listener({type,...args},sender,res=>resolve(res));
      if(!handled)resolve({ok:false,error:'Unhandled request'});
    });
  }
  const prefs={target:2,prompt:'proceed methodically',effort:'High',delaySeconds:2,keepTabs:true};
  return{request,prefs,storage,attempts,get injections(){return injections;}};
}
(async()=>{
  const good=setup(false);
  const start=await good.request('PM_START',{tabId:1,config:good.prefs});
  assert.equal(start.ok,true,'start must succeed');
  await waitFor(()=>good.storage.pmJob?.status==='done','both chats done');
  assert.equal(good.storage.pmJob.completed,2);
  assert.equal(good.storage.pmJob.failed,0);
  assert.equal(good.attempts.length,2,'a load race must not produce duplicate dispatches');
  assert.equal(new Set(good.attempts.map(a=>a.chatId)).size,2);
  assert.ok(good.injections>=3,'old open tabs and new tabs must attach dynamically');

  const unsafe=setup(true);
  await unsafe.request('PM_START',{tabId:1,config:unsafe.prefs});
  await waitFor(()=>unsafe.storage.pmJob?.status==='paused','circuit breaker on uncertain send');
  assert.equal(unsafe.attempts.length,1,'next chat must not launch after unconfirmed send');
  assert.equal(unsafe.storage.pmJob.results[0].uncertain,true);
  const resumed=await unsafe.request('PM_RESUME');
  assert.equal(resumed.ok,true);
  await waitFor(()=>unsafe.storage.pmJob?.status==='done','resume to complete');
  assert.equal(unsafe.attempts.length,2);
  assert.deepEqual(unsafe.attempts.map(a=>a.chatId),['chat-one','chat-two']);
  assert.equal(unsafe.storage.pmJob.failed,1);
  assert.equal(unsafe.storage.pmJob.completed,1);
  console.log('PM coordinator integration passed: dynamic injection, load-event race, exactly one dispatch per chat, pause after uncertainty and safe resume.');
})().catch(e=>{console.error(e);process.exitCode=1;});
