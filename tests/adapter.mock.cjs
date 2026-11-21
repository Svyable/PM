/* PM DOM adapter regression smoke tests, no browser network or dependencies. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','extension','content.js'),'utf8');
const project='g-p-demo123';
function environment(mode){
  let handler,clicks=0,messages=[],menuOpen=false,effortClicks=0,wrongClicks=0,enterKeys=0,formSubmits=0;
  const location={pathname:(mode==='project'||mode.startsWith('new'))?'/g/'+project+'/project':'/g/'+project+'/c/chat-1',href:'https://chatgpt.com/',origin:'https://chatgpt.com'};
  const box={
    isConnected:true,getClientRects:()=>[{}],innerText:(mode==='draft'||mode==='newdraft')?'existing unsent draft':'',
    textContent:mode==='draft'?'existing unsent draft':'',
    focus(){},closest(){return form;},
    dispatchEvent(event){
      if(mode==='sendMissing'&&event.key==='Enter'&&event.type==='keydown'){
        enterKeys++;this.innerText='';this.textContent='';
        messageNodes.push({isConnected:true,getClientRects:()=>[{}],
          innerText:'proceed methodically',querySelector(){return null;}});
      }
      return true;
    }
  };
  const form={
    querySelector(sel){
      if(mode==='misleading'&&sel==='button:has([class*="ModelPickerTriggerModelGroup"])')return effort;
      if(mode==='misleading'&&sel==='button[data-composer-navigation-target="reasoning"]')return wrongNav;
      return sel==='button[data-selected-reasoning-effort]'?effort:null;
    },
    querySelectorAll(selector){
      if(mode==='sendMissing'||mode==='formSubmit')return [];
      const buttons=mode==='competingSend'?[inactiveSend,send]:[send];
      if(selector==='button')return [...buttons,effort];
      if(selector.includes('send')||selector.includes('submit')||selector.includes('Send')||selector==='button[type="submit"]')
        return buttons;
      return [];
    },
    ...(mode==='formSubmit'?{requestSubmit(){
      formSubmits++;box.innerText='';box.textContent='';
      messageNodes.push({isConnected:true,getClientRects:()=>[{}],innerText:'proceed methodically',querySelector(){return null;}});
    }}:{})
  };
  let currentEffort=['picker','pickerRoute'].includes(mode)?'medium':'high';
  const effort={
    isConnected:mode!=='noeffort',getClientRects:()=>[{}],textContent:['picker','pickerRoute'].includes(mode)?'Medium':'High',
    getAttribute(k){return k==='data-selected-reasoning-effort'?currentEffort:null;},
    querySelector(){return null;},
    click(){effortClicks++;if(['picker','pickerRoute'].includes(mode))menuOpen=true;}
  };
  const wrongNav={isConnected:true,getClientRects:()=>[{}],textContent:'Reasoning options',
    getAttribute(){return null;},click(){wrongClicks++;}};
  const stopGenerating={isConnected:true,getClientRects:()=>[{}],textContent:'Stop generating',
    getAttribute(k){return k==='aria-label'?'Stop generating':null;}};
  const highOption={
    isConnected:true,getClientRects:()=>[{}],innerText:'High\nMore reasoning time',textContent:'High\nMore reasoning time',
    getAttribute(){return null;},querySelector(){return null;},
    click(){currentEffort='high';effort.textContent='High';menuOpen=false;if(mode==='pickerRoute')location.pathname='/g/'+project+'/c/chat-2';}
  };
  const messageNodes=['existingmatch','rerenderOld'].includes(mode)?[{isConnected:true,getClientRects:()=>[{}],innerText:'proceed methodically',querySelector(){return null;}}]:[];
  const inactiveSend={
    isConnected:true,getClientRects:()=>[{}],disabled:true,
    getAttribute(k){return k==='aria-label'?'Send prompt':k==='data-testid'?'send-button':null;},
    click(){throw Error('PM clicked an obsolete disabled Send icon.');}
  };
  const send={
    isConnected:true,getClientRects:()=>[{}],disabled:mode==='sendDisabled',
    getAttribute(k){return k==='aria-label'?'Send prompt':k==='data-testid'?'send-button':null;},
    click(){
      clicks++;box.innerText='';box.textContent='';
      if(['chat','picker','misleading','competingSend','wrongturn','newchat','newother','newnochat'].includes(mode)){
        messageNodes.push({isConnected:true,getClientRects:()=>[{}],
          innerText:mode==='wrongturn'?'a different message':'proceed methodically',
          querySelector(){return null;}});
      }
      if(mode==='newchat')location.pathname='/g/'+project+'/c/generated-1';
      if(mode==='newother')location.pathname='/g/g-p-other/c/generated-1';
      if(mode==='rerenderOld')messageNodes.splice(0,messageNodes.length,{
        isConnected:true,getClientRects:()=>[{}],innerText:'proceed methodically',querySelector(){return null;}
      });
    }
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
      if(selector==='button')return mode==='generating'?[effort,send,stopGenerating]:mode==='sendMissing'?[effort]:[effort,send];
      if(selector==='button[data-testid="send-button"]')return mode==='sendMissing'?[]:[send];
      if(selector.includes('data-message-author-role="user"'))return messageNodes;
      if(selector==='button[data-selected-reasoning-effort]')return[effort];
      if(selector.startsWith('[role="menuitem"]'))return menuOpen?[highOption]:[];
      return [];
    },
    querySelector(selector){
      if(selector.startsWith('li['))return anchors[0]||null;
      return null;
    },
    execCommand(cmd,ui,text){
      assert.equal(cmd,'insertText');
      if(mode==='insertReject')return false;
      box.innerText=text;box.textContent=text;return true;
    },
    dispatchEvent(){}
  };
  const chrome={
    runtime:{
      onMessage:{addListener(fn){handler=fn;},hasListener(){return false;},removeListener(){}},
      async sendMessage(msg){messages.push(msg);return{ok:true};}
    }
  };
  const context={chrome,document:doc,location,URL,getComputedStyle(){return{overflowY:'auto',visibility:'visible'};},setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,5)),clearTimeout,InputEvent:class InputEvent{constructor(){}},KeyboardEvent:class KeyboardEvent{constructor(type,options){this.type=type;Object.assign(this,options);}},console,globalThis:{}};
  vm.runInNewContext(code,context,{filename:'content.js'});
  function receive(m){let response;handler(m,{},v=>response=v);return response;}
  return{receive,messages,get clicks(){return clicks;},get effortClicks(){return effortClicks;},get wrongClicks(){return wrongClicks;},get enterKeys(){return enterKeys;},get formSubmits(){return formSubmits;}};
}
async function until(check,label,ms=2500){
  const started=Date.now();
  while(!check()&&Date.now()-started<ms)await new Promise(r=>setTimeout(r,35));
  assert.ok(check(),'Timed out waiting for '+label);
}
(async()=>{
  const scan=environment('project');
  assert.equal(scan.receive({type:'PM_PING'}).version,'0.11.1');
  assert.equal(scan.receive({type:'PM_SCAN',jobId:'scan1',pid:project,target:2}).accepted,true);
  await until(()=>scan.messages.some(m=>m.type==='PM_SCANNED'),'scan result');
  const found=scan.messages.find(m=>m.type==='PM_SCANNED');
  assert.equal(found.chats.length,2);
  assert.equal(found.chats[0].title,'First draft');
  const stream=scan.messages.find(m=>m.type==='PM_SCAN_PROGRESS');
  assert.ok(stream,'discovery must stream before scan finishes');
  assert.equal(stream.chats.length,2);
  assert.equal(stream.pid,project);
  const context=scan.receive({type:'PM_CONTEXT'});
  assert.equal(context.projectId,project);
  assert.equal(context.chats.length,2);
  assert.equal(context.chats[0].id,'chat-1');
  const inventory=environment('project');
  assert.equal(inventory.receive({type:'PM_INVENTORY_SCAN',pid:project,target:2}).accepted,true);
  await until(()=>inventory.messages.some(m=>m.type==='PM_INVENTORY_DONE'),'inventory scan');
  assert.equal(inventory.messages.find(m=>m.type==='PM_INVENTORY_DONE').chats.length,2);

  const generating=environment('generating');
  const readiness=generating.receive({type:'PM_READY',pid:project,cid:'chat-1'});
  assert.equal(readiness.ready,false,'never submit into a still-generating conversation');
  assert.equal(readiness.busy,true);
  assert.equal(generating.receive({type:'PM_STATUS'}).generating,true);

  const draft=environment('draft');
  assert.equal(draft.receive({type:'PM_APPLY',jobId:'job2',pid:project,cid:'chat-1',attemptToken:'draft-token',prompt:'proceed methodically',effort:'High'}).accepted,true);
  await until(()=>draft.messages.some(m=>m.type==='PM_RESULT'),'draft result');
  assert.equal(draft.messages.find(m=>m.type==='PM_RESULT').reasonCode,'draft');
  assert.equal(draft.messages.find(m=>m.type==='PM_RESULT').attemptToken,'draft-token');
  assert.equal(draft.clicks,0);

  for(const mode of ['noeffort','chat']){
    const failed=environment(mode);
    const cid=mode==='chat'?'chat-2':'chat-1';
    const token='failure-'+mode;
    const response=failed.receive({type:'PM_APPLY',jobId:'early-'+mode,pid:project,cid,
      attemptToken:token,prompt:'proceed methodically',effort:'High'});
    if(mode==='chat'){
      // A mismatched chat is rejected BEFORE applying, without even
      // acknowledging a potentially sent prompt.
      assert.equal(response.accepted,false);
      assert.equal(failed.clicks,0);
      continue;
    }
    assert.equal(response.accepted,true);
    await until(()=>failed.messages.some(m=>m.type==='PM_RESULT'),mode+' failure result');
    const result=failed.messages.find(m=>m.type==='PM_RESULT');
    assert.equal(result.attemptToken,token,mode+' error must retain dispatch token');
    assert.equal(result.ok,false);
    assert.equal(result.reasonCode,'effort');
    assert.equal(failed.clicks,0,mode+' error must not send');
  }

  const late=environment('pickerRoute');
  assert.equal(late.receive({type:'PM_APPLY',jobId:'late-navigation',pid:project,cid:'chat-1',
    attemptToken:'late-nav-token',prompt:'proceed methodically',effort:'High'}).accepted,true);
  await until(()=>late.messages.some(m=>m.type==='PM_RESULT'),'late route mismatch');
  const lateResult=late.messages.find(m=>m.type==='PM_RESULT');
  assert.equal(lateResult.ok,false);
  assert.equal(lateResult.uncertain,false);
  assert.equal(lateResult.reasonCode,'wrong-chat');
  assert.equal(late.clicks,0,'never Send after an effort-picker route change');

  for(const mode of ['picker','misleading']){
    const test=environment(mode);
    const token='effort-'+mode;
    assert.equal(test.receive({type:'PM_APPLY',jobId:'job-'+mode,pid:project,
      cid:'chat-1',attemptToken:token,prompt:'proceed methodically',effort:'High'}).accepted,true);
    await until(()=>test.messages.some(m=>m.type==='PM_RESULT'),'effort compatibility '+mode);
    const result=test.messages.find(m=>m.type==='PM_RESULT');
    assert.equal(result.ok,true,mode+' should verify High and send');
    assert.equal(result.attemptToken,token);
    assert.equal(test.clicks,1,'one Send click');
    if(mode==='picker')assert.equal(test.effortClicks,1,'High chosen from menu description');
    if(mode==='misleading')assert.equal(test.wrongClicks,0,'do not click generic reasoning button instead of visible High');
  }

  // Regression for reported stuck drafts: input must be committed as a real
  // editor transaction; raw DOM textContent changes are never considered Send.
  const rejected=environment('insertReject');
  rejected.receive({type:'PM_APPLY',jobId:'input-reject',pid:project,cid:'chat-1',
    attemptToken:'input-token',prompt:'proceed methodically',effort:'High'});
  await until(()=>rejected.messages.some(m=>m.type==='PM_RESULT'),'editor transaction rejection');
  assert.equal(rejected.messages.find(m=>m.type==='PM_RESULT').reasonCode,'composer');
  assert.equal(rejected.clicks,0);

  const disabled=environment('sendDisabled');
  disabled.receive({type:'PM_APPLY',jobId:'send-disabled',pid:project,cid:'chat-1',
    attemptToken:'disabled-token',prompt:'proceed methodically',effort:'High'});
  await until(()=>disabled.messages.some(m=>m.type==='PM_RESULT'),'disabled send diagnosis');
  assert.equal(disabled.messages.find(m=>m.type==='PM_RESULT').reasonCode,'send-disabled');
  assert.equal(disabled.clicks,0);
  assert.equal(disabled.messages.find(m=>m.type==='PM_RESULT').submitMethod,null);
  assert.equal(disabled.enterKeys,0,'must not press Enter when visible Send is disabled');

  const enter=environment('sendMissing');
  enter.receive({type:'PM_APPLY',jobId:'enter-one-shot',pid:project,cid:'chat-1',
    attemptToken:'enter-token',prompt:'proceed methodically',effort:'High'});
  await until(()=>enter.messages.some(m=>m.type==='PM_RESULT'),'one-shot Enter fallback');
  assert.equal(enter.messages.find(m=>m.type==='PM_RESULT').ok,true);
  assert.equal(enter.enterKeys,1,'exactly one Enter fallback');
  assert.equal(enter.messages.find(m=>m.type==='PM_RESULT').submitMethod,'enter');
  assert.equal(enter.clicks,0);
  const stages=enter.messages.filter(m=>m.type==='PM_STAGE').map(m=>m.phase);
  assert.ok(stages.includes('injected')&&stages.includes('submitting')&&stages.includes('verifying'));

  const competing=environment('competingSend');
  competing.receive({type:'PM_APPLY',jobId:'competing-send',pid:project,cid:'chat-1',
    attemptToken:'competing-token',prompt:'proceed methodically',effort:'High'});
  await until(()=>competing.messages.some(m=>m.type==='PM_RESULT'),'enabled send among multiple buttons');
  assert.equal(competing.messages.find(m=>m.type==='PM_RESULT').ok,true);
  assert.equal(competing.clicks,1,'enabled send selected, obsolete disabled icon not clicked');
  assert.equal(competing.messages.find(m=>m.type==='PM_RESULT').submitMethod,'button');

  const formSubmit=environment('formSubmit');
  formSubmit.receive({type:'PM_APPLY',jobId:'native-form',pid:project,cid:'chat-1',
    attemptToken:'form-token',prompt:'proceed methodically',effort:'High'});
  await until(()=>formSubmit.messages.some(m=>m.type==='PM_RESULT'),'form requestSubmit fallback');
  assert.equal(formSubmit.messages.find(m=>m.type==='PM_RESULT').ok,true);
  assert.equal(formSubmit.messages.find(m=>m.type==='PM_RESULT').submitMethod,'form');
  assert.equal(formSubmit.formSubmits,1,'one native form submission');
  assert.equal(formSubmit.clicks,0);
  assert.equal(formSubmit.enterKeys,0);

  const send=environment('chat');
  assert.equal(send.receive({type:'PM_READY',pid:project,cid:'chat-1'}).ready,true);
  assert.equal(send.receive({type:'PM_READY',pid:project,cid:'chat-2'}).ready,false);
  assert.equal(send.receive({type:'PM_APPLY',jobId:'job3',pid:project,cid:'chat-1',attemptToken:'attempt-3',prompt:'proceed methodically',effort:'High'}).accepted,true);
  await until(()=>send.messages.some(m=>m.type==='PM_RESULT'),'send result');
  assert.equal(send.messages.find(m=>m.type==='PM_RESULT').ok,true);
  assert.equal(send.messages.find(m=>m.type==='PM_RESULT').attemptToken,'attempt-3');
  assert.equal(send.clicks,1);

  const newChat=environment('newchat');
  assert.equal(newChat.receive({type:'PM_NEW_READY',pid:project}).ready,true);
  assert.equal(newChat.receive({type:'PM_NEW_READY',pid:'g-p-other'}).ready,false);
  assert.equal(newChat.receive({type:'PM_APPLY',jobId:'create-1',pid:project,cid:'new:0',kind:'new',attemptToken:'new-tok-1',prompt:'proceed methodically',effort:'High'}).accepted,true);
  await until(()=>newChat.messages.some(m=>m.type==='PM_RESULT'),'new project chat result');
  const created=newChat.messages.find(m=>m.type==='PM_RESULT');
  assert.equal(created.ok,true);
  assert.equal(created.chatId,'new:0');
  assert.equal(created.createdChatId,'generated-1');
  assert.equal(created.createdUrl,'https://chatgpt.com/g/'+project+'/c/generated-1');
  assert.equal(created.attemptToken,'new-tok-1');
  assert.equal(newChat.clicks,1,'new chat should submit exactly once');

  const draftNew=environment('newdraft');
  draftNew.receive({type:'PM_APPLY',jobId:'draft-new',pid:project,cid:'new:0',kind:'new',attemptToken:'new-draft',prompt:'proceed methodically',effort:'High'});
  await until(()=>draftNew.messages.some(m=>m.type==='PM_RESULT'),'new chat draft preserved');
  assert.equal(draftNew.messages.find(m=>m.type==='PM_RESULT').reasonCode,'draft');
  assert.equal(draftNew.clicks,0,'must never overwrite a Project overview draft');

  for(const mode of ['newother','newnochat']){
    const environmentCase=environment(mode);
    environmentCase.receive({type:'PM_APPLY',jobId:'new-bad-'+mode,pid:project,cid:'new:0',kind:'new',attemptToken:'token-'+mode,prompt:'proceed methodically',effort:'High'});
    await until(()=>environmentCase.messages.some(m=>m.type==='PM_RESULT'),mode+' unconfirmed');
    const response=environmentCase.messages.find(m=>m.type==='PM_RESULT');
    assert.equal(response.ok,false);
    assert.equal(response.uncertain,true);
    assert.equal(response.attemptToken,'token-'+mode);
    assert.equal(environmentCase.clicks,1,'new chat must not retry an uncertain Send');
  }

  for(const mode of ['cleared','wrongturn','existingmatch','rerenderOld']){
    const unsafe=environment(mode);
    unsafe.receive({type:'PM_APPLY',jobId:'negative-'+mode,pid:project,cid:'chat-1',attemptToken:'negative-'+mode,prompt:'proceed methodically',effort:'High'});
    await until(()=>unsafe.messages.some(m=>m.type==='PM_RESULT'),mode+' unconfirmed result');
    const result=unsafe.messages.find(m=>m.type==='PM_RESULT');
    assert.equal(result.ok,false,mode+' should not be a confirmed send');
    assert.equal(result.uncertain,true,mode+' should warn about possible prior submission');
    assert.equal(result.reasonCode,'unconfirmed');
    assert.equal(result.attemptToken,'negative-'+mode);
    assert.equal(unsafe.clicks,1,mode+' must not retry');
  }
  console.log('PM adapter regression tests passed: scanning, drafts, matching new message, no false confirmations and one click per attempt.');
})().catch(e=>{console.error(e);process.exitCode=1;});
