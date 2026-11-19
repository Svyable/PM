/* PM — Proceed Methodically 0.7 | ChatGPT UI adapter
 * Operates only on visible browser UI. No private endpoints or remote telemetry.
 */
(() => {
  'use strict';
  const VERSION='0.7.0';
  const old=globalThis.__PM_LISTENER__;
  try {
    if(old&&chrome.runtime.onMessage.hasListener?.(old)){
      if(globalThis.__PM_CONTENT_VERSION__===VERSION)return;
      chrome.runtime.onMessage.removeListener(old);
    }
  } catch {}
  for(const key of ['__PM_CONTENT_LISTENER_V3__','__PM_CONTENT_LISTENER_V2__']){
    try { const fn=globalThis[key]; if(fn && chrome.runtime.onMessage.hasListener?.(fn)) chrome.runtime.onMessage.removeListener(fn); } catch {}
  }
  const PROJECT=/^\/g\/(g-p-[a-zA-Z0-9-]+)\/project\/?$/;
  const CHAT=/^\/g\/(g-p-[a-zA-Z0-9-]+)\/c\/([a-zA-Z0-9-]+)\/?$/;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
  const shown=e=>!!(e&&e.isConnected&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
  const projectId=()=>location.pathname.match(PROJECT)?.[1]||null;
  const chatId=()=>{const m=location.pathname.match(CHAT);return m?{projectId:m[1],chatId:m[2]}:null;};
  let stopScan=false,scanBusy=false,stopApply=false,activeApply=null;
  function findChats(pid){
    const items=[...document.querySelectorAll('a[href*="/c/"]')];
    const preferred=items.filter(a=>a.closest('li[class*="project-chat"]'));
    return (preferred.length?preferred:items).flatMap(a=>{
      let url;try{url=new URL(a.getAttribute('href'),location.href);}catch{return [];}
      const m=url.pathname.match(CHAT);
      if(url.origin!=='https://chatgpt.com'||m?.[1]!==pid)return[];
      const title=norm(a.querySelector('[class*="font-medium"]')?.textContent||a.textContent)||'Untitled chat';
      const listItem=a.closest('li[class*="project-chat"]');
      const description=norm(a.querySelector('[class*="text-secondary"]')?.textContent||'').slice(0,280);
      const updated=norm(a.getAttribute('aria-description')||listItem?.querySelector?.('[aria-hidden="true"]')?.textContent||'').slice(0,100);
      return [{id:m[2],url:url.origin+url.pathname,title:title.slice(0,180),description,updated}];
    });
  }
  function scrollParent(el){
    for(let p=el?.parentElement;p&&p!==document.body;p=p.parentElement){
      const style=getComputedStyle(p);
      if(/(auto|scroll|overlay)/.test(style.overflowY)&&p.scrollHeight>p.clientHeight+3)return p;
    }
    return document.scrollingElement||document.documentElement;
  }
  async function report(type,data){try{await chrome.runtime.sendMessage({type,...data});}catch{}}
  async function scan({jobId,target,pid,inventory=false}){
    scanBusy=true;stopScan=false;
    const progressType=inventory?'PM_INVENTORY_PROGRESS':'PM_SCAN_PROGRESS';
    const finalType=inventory?'PM_INVENTORY_DONE':'PM_SCANNED';
    const seen=new Map(); let scroller=null,startTop=0,stale=0,stuck=0,lastCount=-1;
    const started=Date.now();
    try{
      for(let step=0;step<Math.min(1200,Math.max(80,target*8));step++){
        if(stopScan)throw Error('Scan stopped.');
        if(projectId()!==pid)throw Error('Project page changed during scanning.');
        if(Date.now()-started>220000)break;
        const current=findChats(pid),sizeBefore=seen.size;
        for(const row of current)if(!seen.has(row.id))seen.set(row.id,row);
        if(!scroller&&current.length){
          const a=document.querySelector('li[class*="project-chat"] a[href*="/c/"]')||document.querySelector('a[href*="/c/"]');
          scroller=scrollParent(a); startTop=scroller.scrollTop;
        }
        // Stream discovered rows while the project continues lazy-loading.
        // This lets a 100-chat run begin on the first batch rather than
        // waiting minutes for the entire scan to finish.
        if(seen.size!==lastCount){
          lastCount=seen.size;
          await report(progressType,{jobId,pid,found:seen.size,step,
            chats:[...seen.values()].slice(0,target)});
        }
        if(seen.size>=target)break;
        stale=seen.size===sizeBefore?stale+1:0;
        if(!scroller){if(step>20)break;await sleep(500);continue;}
        const anchor=[...document.querySelectorAll('li[class*="project-chat"] a[href*="/c/"]')].at(-1);
        const parent=anchor?.closest('ul')?.parentElement||scroller;
        const more=[...parent.querySelectorAll('button')].find(b=>shown(b)&&/^(load|show|see|view) (more|older)/i.test(norm(b.textContent)));
        if(more){more.click();await sleep(700);continue;}
        const before=scroller.scrollTop;
        scroller.scrollTop=Math.min(scroller.scrollHeight,scroller.scrollTop+Math.max(180,Math.round(scroller.clientHeight*.68)));
        if(scroller===document.scrollingElement)window.scrollTo(0,scroller.scrollTop);
        if(scroller.scrollTop===before){stuck++;anchor?.scrollIntoView({block:'end',inline:'nearest'});}else stuck=0;
        await sleep(stale>4?800:420);
        if((stale>22&&stuck>10)||stale>40)break;
      }
      await report(finalType,{jobId,pid,found:seen.size,chats:[...seen.values()].slice(0,target)});
    }catch(e){await report(finalType,{jobId,pid,error:String(e.message||e),chats:[...seen.values()].slice(0,target)});}
    finally{scanBusy=false;if(scroller?.isConnected)scroller.scrollTop=startTop;}
  }
  function composer(){
    return ['.ProseMirror[contenteditable="true"][role="textbox"]','[data-composer-markdown][contenteditable="true"]','[contenteditable="true"][aria-label="Ask ChatGPT"]','[contenteditable="true"][role="textbox"]'].map(s=>[...document.querySelectorAll(s)].find(shown)).find(Boolean)||null;
  }
  function effortButton(box){
    const form=box.closest('form')||box.parentElement?.parentElement;
    const selectors=['button[data-composer-navigation-target="reasoning"]','button[data-selected-reasoning-effort]','button[data-testid="model-switcher-dropdown-button"]','button:has([class*="ModelPickerTriggerModelGroup"])','button[aria-label*="model" i][aria-haspopup]'];
    for(const sel of selectors){
      let el=form?.querySelector(sel);if(shown(el))return el;
      el=[...document.querySelectorAll(sel)].find(shown);if(el)return el;
    }
    return [...document.querySelectorAll('button')].find(el=>shown(el)&&/^(Instant|Medium|High|Extra High|Very High)$/i.test(norm(el.textContent)))||null;
  }
  function selectedEffort(btn){
    if(!btn)return null;
    let text=norm(btn.getAttribute('data-selected-reasoning-effort')||btn.textContent);
    const match=text.match(/(?:^|\b)(Extra[ _-]?High|Very High|Instant|Medium|High)(?:\b|$)/i);
    if(!match)return null;
    return /extra|very/i.test(match[1])?'Extra High':match[1][0].toUpperCase()+match[1].slice(1).toLowerCase();
  }
  async function setEffort(box,requested){
    if(requested==='Keep current')return;
    let btn=effortButton(box);
    if(!btn)throw Object.assign(Error('Effort picker not found; try Keep current.'),{reasonCode:'effort'});
    if(selectedEffort(btn)===requested)return;
    btn.click();await sleep(440);
    const options=[...document.querySelectorAll('[role="menuitem"],[role="option"],[role="radio"],[data-radix-collection-item],button')].filter(shown);
    const exact=options.find(el=>{
      const label=norm(el.getAttribute('aria-label')||el.textContent);
      return label.toLowerCase()===requested.toLowerCase() || (requested==='Extra High'&&label.toLowerCase()==='very high');
    });
    if(!exact){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));throw Object.assign(Error('Effort option unavailable: '+requested),{reasonCode:'effort'});}
    exact.click();await sleep(520);
    btn=effortButton(box);
    if(selectedEffort(btn)!==requested)throw Object.assign(Error('Could not verify '+requested+' effort after selection.'),{reasonCode:'effort'});
  }
  function draftPresent(el){
    const text=norm(el.innerText||el.textContent);
    return text.length>0 && !/^(Ask ChatGPT|Message ChatGPT)$/.test(text);
  }
  function isBusy(){
    return [...document.querySelectorAll('button')].some(b=>shown(b)&&(/stop generating|stop response/i.test(b.getAttribute('aria-label')||'')||/stop-button/i.test(b.getAttribute('data-testid')||'')));
  }
  function sendButton(){
    const selectors=['button[data-testid="send-button"]','button[aria-label="Send prompt"]','button[aria-label="Send message"]','button[aria-label="Send"]','button[data-testid*="send" i]'];
    for(const s of selectors){const b=[...document.querySelectorAll(s)].find(shown);if(b)return b;}
    return [...document.querySelectorAll('button')].find(b=>shown(b)&&/^send( message| prompt)?$/i.test(norm(b.getAttribute('aria-label')||b.textContent)))||null;
  }
  function userMessages(){
    return [...document.querySelectorAll('[data-message-author-role="user"],[data-testid="user-message"]')].filter(shown);
  }
  function userMessageMatches(node,prompt){
    // Confirmation must come from a NEW user turn containing this exact prompt.
    // The editor clearing, a loading spinner, or any unrelated new turn is not proof.
    const text=norm(prompt);
    const candidates=[
      node.querySelector?.('[data-message-content]'),
      node.querySelector?.('.whitespace-pre-wrap'),
      node
    ].filter(Boolean);
    return candidates.some(el=>norm(el.innerText||el.textContent)===text);
  }
  function fail(reasonCode,error,uncertain=false){return{ok:false,reasonCode,error,uncertain};}
  async function apply({jobId,pid,cid,prompt,effort,attemptToken}){
    stopApply=false;const current=chatId();
    if(!current||current.projectId!==pid||current.chatId!==cid){await report('PM_RESULT',{jobId,chatId:cid,attemptToken,...fail('wrong-chat','Chat page did not match the queued conversation.')});return;}
    if(activeApply!==null){await report('PM_RESULT',{jobId,chatId:cid,...fail('busy','PM is already handling this tab.')});return;}
    activeApply=jobId;let clicked=false;
    try{
      let box=null;
      for(let i=0;i<90;i++){if(stopApply)throw Error('Aborted');box=composer();if(box)break;await sleep(300);}
      if(!box)throw Object.assign(Error('Chat composer not found.'),{reasonCode:'composer'});
      if(draftPresent(box))throw Object.assign(Error('Existing draft preserved. Chat skipped.'),{reasonCode:'draft'});
      if(isBusy())throw Object.assign(Error('This chat is already generating.'),{reasonCode:'busy'});
      await setEffort(box,effort);
      if(stopApply)throw Error('Aborted before send.');
      box.focus();const inserted=document.execCommand('insertText',false,prompt);
      if(!inserted||norm(box.innerText||box.textContent)!==norm(prompt)){
        if(draftPresent(box)&&norm(box.innerText||box.textContent)!==norm(prompt))throw Object.assign(Error('Composer contained unexpected text; not sending.'),{reasonCode:'composer'});
        box.textContent=prompt;box.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:prompt}));
      }
      await sleep(240);
      if(norm(box.innerText||box.textContent)!==norm(prompt))throw Object.assign(Error('Prompt insertion could not be verified.'),{reasonCode:'composer'});
      let send=null;
      for(let i=0;i<18;i++){send=sendButton();if(send&&!send.disabled&&send.getAttribute('aria-disabled')!=='true')break;await sleep(180);}
      if(!send||send.disabled||send.getAttribute('aria-disabled')==='true')throw Object.assign(Error('Send button not ready. Prompt left in the composer.'),{reasonCode:'send'});
      if(stopApply)throw Error('Aborted before send.');
      const before=new Set(userMessages());
      clicked=true;send.click(); // exactly one click; never automatically repeat it
      let confirmed=false;
      for(let i=0;i<60;i++){
        await sleep(320);
        // A matching new user message is required; editor clearing is insufficient.
        const fresh=userMessages().filter(el=>!before.has(el));
        if(fresh.some(el=>userMessageMatches(el,prompt))){confirmed=true;break;}
        if(stopApply)break; // even on stop, a clicked send can have been accepted
      }
      if(!confirmed)throw Object.assign(Error('Send clicked but no new matching user message appeared. Check the chat before retrying; it may have sent.'),{reasonCode:'unconfirmed'});
      await report('PM_RESULT',{jobId,chatId:cid,attemptToken,ok:true,reasonCode:'sent'});
    }catch(e){
      await report('PM_RESULT',{jobId,chatId:cid,...fail(e.reasonCode||'error',String(e.message||e),clicked)});
    }finally{activeApply=null;}
  }
  const listener=(message,sender,sendResponse)=>{
    if(!message||typeof message.type!=='string')return;
    if(message.type==='PM_PING'){sendResponse({ok:true,version:VERSION,projectId:projectId(),chat:chatId()});return;}
    if(message.type==='PM_CONTEXT'){
      const pid=projectId();const chats=pid?findChats(pid):[];
      sendResponse({ok:true,projectId:pid,count:chats.length,chats:chats.slice(0,1000),
        projectTitle:norm(document.querySelector('main h1, main h2, h1')?.textContent||'').slice(0,100)});
      return;
    }
    if(message.type==='PM_STATUS'){
      const chat=chatId();
      sendResponse({ok:true,chat,generating:!!chat&&isBusy(),composerReady:!!composer()});
      return;
    }
    if(message.type==='PM_READY'){
      const current=chatId();
      sendResponse({ok:true,ready:current?.projectId===message.pid&&current?.chatId===message.cid&&!!composer(),chat:current});
      return;
    }
    if(message.type==='PM_SCAN'){
      if(projectId()!==message.pid||scanBusy){sendResponse({accepted:false,reason:scanBusy?'A project scan is already active.':'Wrong project page.'});return;}
      void scan(message);sendResponse({accepted:true});return;
    }
    if(message.type==='PM_INVENTORY_SCAN'){
      if(projectId()!==message.pid||scanBusy){sendResponse({accepted:false,reason:scanBusy?'A project scan is already active.':'Wrong project page.'});return;}
      void scan({...message,jobId:'inventory-'+Date.now(),inventory:true});sendResponse({accepted:true});return;
    }
    if(message.type==='PM_SCAN_ABORT'){stopScan=true;sendResponse({ok:true});return;}
    if(message.type==='PM_APPLY'){
      if(!chatId()||activeApply!==null){sendResponse({accepted:false,reason:'Chat unavailable or busy.'});return;}
      void apply(message);sendResponse({accepted:true});return;
    }
    if(message.type==='PM_APPLY_ABORT'){stopApply=true;sendResponse({ok:true});}
  };
  globalThis.__PM_LISTENER__=listener;
  globalThis.__PM_CONTENT_VERSION__=VERSION;
  chrome.runtime.onMessage.addListener(listener);
})();