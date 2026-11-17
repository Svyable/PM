/* PM DOM adapter regression smoke tests, no browser network or dependencies. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','extension','content.js'),'utf8');
const project='g-p-demo123';
function environment(mode){
  let handler,clicks=0,messages=[];
  const box={
    isConnected:true,getClientRects:()=>[{}],innerText:mode==='draft'?'existing unsent draft':'',
    textContent:mode==='draft'?'existing unsent draft':'',
    focus(){},closest(){return form;}
  };
  const form={querySelector(sel){return sel==='button[data-selected-reasoning-effort]'?effort:null;}};
  const effort={
    isConnected:true,getClientRects:()=>[{}],textContent:'High',
    getAttribute(k){return k==='data-selected-reasoning-effort'?'high':null;},click(){}
  };
  let messageCount=0;
  const send={
    isConnected:true,getClientRects:()=>[{}],disabled:false,
    getAttribute(k){return k==='aria-label'?'Send prompt':k==='data-testid'?'send-button':null;},
    click(){clicks++;box.innerText='';box.textContent='';messageCount++;}
  };
  const anchors=['First draft','Second thread'].map((name,i)=>({
    textContent:name,parentElement:null,
    getAttribute(k){return k==='href'?'/g/'+project+'/c/chat-'+(i+1):null;},
    querySelector(){return{textContent:name};},
    closest(sel){return sel.includes('project-chat')?{}:null;}
  }));
  const scrolling={scrollTop:0,scrollHeight:500,clientHeight:400,isConnected:true};
  const doc={
    scrollingElement:scrolling,documentElement:scrolling,
    querySelectorAll(selector){
      if(mode==='project'&&selector.includes('a[href*="/c/"]'))return anchors;
      if(selector.startsWith('.ProseMirror'))return[box];
      if(selector==='button')return[effort,send];
      if(selector==='button[data-testid="send-button"]')return[send];
      if(selector.includes('data-message-author-role="user"'))return Array.from({length:messageCount},()=>({isConnected:true,getClientRects:()=>[{}]}));
      if(selector==='button[data-selected-reasoning-effort]')return[effort];
      return [];
    },
    querySelector(selector){
      if(selector.startsWith('li['))return anchors[0]||null;
      return null;
    },
    execCommand(cmd,ui,text){assert.equal(cmd,'insertText');box.innerText=text;box.textContent=text;return true;},
    dispatchEvent(){}
  };
  const chrome={
    runtime:{
      onMessage:{addListener(fn){handler=fn;},hasListener(){return false;},removeListener(){}},
      async sendMessage(msg){messages.push(msg);return{ok:true};}
    }
  };
  const context={chrome,document:doc,location:{pathname:mode==='project'?'/g/'+project+'/project':'/g/'+project+'/c/chat-1',href:'https://chatgpt.com/'},URL,getComputedStyle(){return{overflowY:'auto',visibility:'visible'};},setTimeout,clearTimeout,InputEvent:class InputEvent{constructor(){}},KeyboardEvent:class KeyboardEvent{constructor(){}},console,globalThis:{}};
  vm.runInNewContext(code,context,{filename:'content.js'});
  function receive(m){let response;handler(m,{},v=>response=v);return response;}
  return{receive,messages,get clicks(){return clicks;}};
}
async function until(check,label,ms=2500){
  const started=Date.now();
  while(!check()&&Date.now()-started<ms)await new Promise(r=>setTimeout(r,35));
  assert.ok(check(),'Timed out waiting for '+label);
}
(async()=>{
  const scan=environment('project');
  assert.equal(scan.receive({type:'PM_PING'}).version,'0.4.0');
  assert.equal(scan.receive({type:'PM_SCAN',jobId:'scan1',pid:project,target:2}).accepted,true);
  await until(()=>scan.messages.some(m=>m.type==='PM_SCANNED'),'scan result');
  const found=scan.messages.find(m=>m.type==='PM_SCANNED');
  assert.equal(found.chats.length,2);
  assert.equal(found.chats[0].title,'First draft');

  const draft=environment('draft');
  assert.equal(draft.receive({type:'PM_APPLY',jobId:'job2',pid:project,cid:'chat-1',prompt:'proceed methodically',effort:'High'}).accepted,true);
  await until(()=>draft.messages.some(m=>m.type==='PM_RESULT'),'draft result');
  assert.equal(draft.messages.find(m=>m.type==='PM_RESULT').reasonCode,'draft');
  assert.equal(draft.clicks,0);

  const send=environment('chat');
  assert.equal(send.receive({type:'PM_APPLY',jobId:'job3',pid:project,cid:'chat-1',prompt:'proceed methodically',effort:'High'}).accepted,true);
  await until(()=>send.messages.some(m=>m.type==='PM_RESULT'),'send result');
  assert.equal(send.messages.find(m=>m.type==='PM_RESULT').ok,true);
  assert.equal(send.clicks,1);
  console.log('PM adapter smoke tests passed: project scan, draft preservation, and exactly one Send click.');
})().catch(e=>{console.error(e);process.exitCode=1;});
