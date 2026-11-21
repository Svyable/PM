/* PM — Proceed Methodically 0.11 | ChatGPT UI adapter
 * Operates only on visible browser UI. No private endpoints or remote telemetry.
 */
(() => {
  'use strict';
  const VERSION='0.11.1';
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
    // Prefer the visible current-effort control. A generic reasoning/model
    // navigation button can open a completely different picker.
    const precise=[
      'button:has([class*="ModelPickerTriggerModelGroup"])',
      'button[data-selected-reasoning-effort]',
      'button[data-testid="model-switcher-dropdown-button"]'
    ];
    const generic=[
      'button[data-composer-navigation-target="reasoning"]',
      'button[aria-label*="model" i][aria-haspopup]'
    ];
    for(const sel of [...precise,...generic]){
      let el=form?.querySelector(sel);if(shown(el))return el;
      el=[...document.querySelectorAll(sel)].find(shown);if(el)return el;
    }
    return [...document.querySelectorAll('button')].find(el=>
      shown(el)&&/^(Instant|Medium|High|Extra High|Very High)$/i.test(norm(el.textContent)))||null;
  }
  function selectedEffort(btn){
    if(!btn)return null;
    const current=btn.querySelector?.('[class*="ModelPickerTriggerModelGroup"]');
    const text=norm(btn.getAttribute('data-selected-reasoning-effort')||current?.textContent||btn.textContent);
    const match=text.match(/(?:^|\b)(Extra[ _-]?High|Very High|Instant|Medium|High)(?:\b|$)/i);
    if(!match)return null;
    return /extra|very/i.test(match[1])?'Extra High':match[1][0].toUpperCase()+match[1].slice(1).toLowerCase();
  }
  function optionLabel(el){
    const aria=norm(el.getAttribute?.('aria-label'));
    const lines=String(el.innerText||el.textContent||'').split(/\r?\n/).map(norm).filter(Boolean);
    const title=norm(el.querySelector?.('[class*="font-medium"],[class*="font-semibold"],[data-testid*="effort-label"]')?.textContent);
    return{aria,first:lines[0]||'',title};
  }
  function effortChoiceMatches(el,requested){
    const labels=optionLabel(el),wanted=requested.toLowerCase();
    return Object.values(labels).some(s=>s.toLowerCase()===wanted||
      (wanted==='extra high'&&s.toLowerCase()==='very high'));
  }
  function effortOptions(){
    // Only inspect actual option controls. Scanning every button on the page
    // could select an unrelated "High" button outside the effort menu.
    return [...document.querySelectorAll('[role="menuitem"],[role="menuitemradio"],[role="option"],[role="radio"],[data-radix-collection-item]')].filter(shown);
  }
  async function setEffort(box,requested){
    if(requested==='Keep current')return;
    let btn=effortButton(box);
    if(!btn)throw Object.assign(Error('Effort control not found. Use Keep current temporarily, or inspect the ChatGPT effort picker.'),{reasonCode:'effort'});
    if(selectedEffort(btn)===requested)return;
    btn.click();
    let choice=null,available=[];
    // Background tabs can take longer to render portals/menus; do not
    // conclude High is unavailable after an arbitrary 440 ms.
    for(let i=0;i<28;i++){
      await sleep(250);
      if(selectedEffort(btn)===requested)return;
      const options=effortOptions();
      choice=options.find(el=>effortChoiceMatches(el,requested))||null;
      if(choice)break;
      if(options.length)available=[...new Set(options.map(el=>optionLabel(el).first).filter(Boolean))].slice(0,8);
    }
    if(!choice){
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      const detail=available.length?' Visible choices: '+available.join(', ')+'.':' No matching menu options appeared.';
      throw Object.assign(Error('Could not find '+requested+' in ChatGPT’s effort menu.'+detail+' Nothing was sent.'),{reasonCode:'effort'});
    }
    choice.click();
    for(let i=0;i<14;i++){
      await sleep(200);
      btn=effortButton(box);
      if(selectedEffort(btn)===requested)return;
    }
    throw Object.assign(Error('Selected '+requested+' but could not verify the resulting effort setting. Nothing was sent.'),{reasonCode:'effort'});
  }
  function draftPresent(el){
    const text=norm(el.innerText||el.textContent);
    return text.length>0 && !/^(Ask ChatGPT|Message ChatGPT)$/.test(text);
  }
  function isBusy(){
    return [...document.querySelectorAll('button')].some(b=>shown(b)&&(/stop generating|stop response/i.test(b.getAttribute('aria-label')||'')||/stop-button/i.test(b.getAttribute('data-testid')||'')));
  }
  function composerSurface(box){
    // Restrict click targets to the composer that owns the text editor.
    // The page can contain other "Send" controls or old hidden editors.
    return box?.closest?.('form')||
      box?.closest?.('[data-testid*="composer"],[class*="composer-parent"]')||
      box?.parentElement?.parentElement||null;
  }
  function isSendCandidate(b){
    if(!shown(b))return false;
    const id=norm(b.getAttribute?.('data-testid')).toLowerCase();
    const aria=norm(b.getAttribute?.('aria-label')).toLowerCase();
    const title=norm(b.getAttribute?.('title')).toLowerCase();
    const text=norm(b.textContent).toLowerCase();
    if(/stop|cancel|record|voice|dictat|microphone/.test([id,aria,title].join(' ')))return false;
    return /\b(send|submit)\b/.test([id,aria,title].join(' '))||
      /^send( message| prompt)?$/.test(text)||
      b.getAttribute?.('type')==='submit';
  }
  function sendAvailable(b){
    return !!(b&&shown(b)&&!b.disabled&&
      b.getAttribute?.('aria-disabled')!=='true'&&
      b.getAttribute?.('data-disabled')!=='true');
  }
  function sendButton(box){
    const near=composerSurface(box);
    const selectors=[
      'button[data-testid="send-button"]',
      'button[data-testid="composer-send-button"]',
      'button[data-testid="composer-submit-button"]',
      'button[data-testid*="send" i]',
      'button[data-testid*="submit" i]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send message"]',
      'button[aria-label="Send"]',
      'button[type="submit"]'
    ];
    // Prefer an ENABLED control among multiple candidates. The old code
    // returned the first disabled Send icon, even when a second live Send
    // control was rendered in the same composer.
    for(const root of [near,near?null:document].filter(Boolean)){
      const candidates=[];
      for(const selector of selectors){
        for(const b of root.querySelectorAll?.(selector)||[]){
          if(isSendCandidate(b)&&!candidates.includes(b))candidates.push(b);
        }
      }
      for(const b of root.querySelectorAll?.('button')||[]){
        if(isSendCandidate(b)&&!candidates.includes(b))candidates.push(b);
      }
      if(candidates.length)return candidates.find(sendAvailable)||candidates[0];
    }
    return null;
  }
  function sendDiagnostic(box){
    const near=composerSurface(box);
    const buttons=[...(near?.querySelectorAll?.('button')||document.querySelectorAll('button'))]
      .filter(shown).slice(0,18);
    return buttons.map(b=>norm([
      b.getAttribute?.('data-testid'),b.getAttribute?.('aria-label'),
      b.getAttribute?.('type'),b.disabled?'disabled':''
    ].filter(Boolean).join(' / '))).filter(Boolean).slice(0,10).join('; ').slice(0,480);
  }
  function submitPlan(box,button){
    if(sendAvailable(button))return{method:'button',target:button};
    if(button)return null; // Never bypass a disabled Send with Enter or form submit.
    const form=box?.closest?.('form');
    if(form&&typeof form.requestSubmit==='function')
      return{method:'form',target:form};
    return{method:'enter',target:box};
  }
  function userMessages(){
    // Background tabs may render conversation turns without visible boxes.
    // A connected user-turn node is sufficient when it is NEW and exact.
    return [...document.querySelectorAll('[data-message-author-role="user"],[data-testid="user-message"]')]
      .filter(el=>el.isConnected);
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
  async function apply({jobId,pid,cid,prompt,effort,attemptToken,kind='existing'}){
    stopApply=false;
    const creating=kind==='new',current=chatId();
    const correct=creating?projectId()===pid&&!current:current?.projectId===pid&&current?.chatId===cid;
    const routeMatches=()=>{
      const live=chatId();
      return creating?projectId()===pid&&!live:live?.projectId===pid&&live?.chatId===cid;
    };
    if(!correct){
      await report('PM_RESULT',{jobId,chatId:cid,attemptToken,
        ...fail('wrong-chat',creating?'Project overview changed before new-chat submission.':'Chat page did not match the queued conversation.')});
      return;
    }
    if(activeApply!==null){await report('PM_RESULT',{jobId,chatId:cid,attemptToken,...fail('busy','PM is already handling this tab.')});return;}
    activeApply=jobId;let clicked=false,submitMethod=null;
    const stage=(phase,detail='')=>report('PM_STAGE',{jobId,chatId:cid,attemptToken,phase,detail});
    try{
      let box=null;
      for(let i=0;i<90;i++){if(stopApply)throw Error('Aborted');box=composer();if(box)break;await sleep(300);}
      if(!box)throw Object.assign(Error('Chat composer not found.'),{reasonCode:'composer'});
      if(draftPresent(box))throw Object.assign(Error('Existing draft preserved. Chat skipped.'),{reasonCode:'draft'});
      if(isBusy())throw Object.assign(Error('This chat is already generating.'),{reasonCode:'busy'});
      await setEffort(box,effort);
      if(stopApply)throw Error('Aborted before send.');
      // ChatGPT may navigate while its effort picker opens. Re-check before
      // typing so a late route change never populates the wrong conversation.
      if(!routeMatches())throw Object.assign(Error('Chat changed during effort selection; no prompt was inserted or sent.'),{reasonCode:'wrong-chat'});
      await stage('preparing','Composer is ready; inserting prompt.');
      box.focus();
      // Never mutate .textContent as a fallback: it can display text without
      // updating ProseMirror's internal state, leaving Send permanently disabled.
      const inserted=document.execCommand('insertText',false,prompt);
      if(!inserted||norm(box.innerText||box.textContent)!==norm(prompt))
        throw Object.assign(Error('The editor did not accept a proper text input transaction. Nothing was sent.'),{reasonCode:'composer'});
      await stage('injected','Prompt entered; waiting for an enabled Send control.');
      let send=null,plan=null;
      for(let i=0;i<32;i++){
        if(stopApply)throw Error('Aborted before Send.');
        if(!routeMatches())throw Object.assign(Error('Chat changed after injection. No Send occurred.'),{reasonCode:'wrong-chat'});
        const currentBox=composer();
        if(!currentBox||!currentBox.isConnected){
          await sleep(200);continue;
        }
        if(currentBox!==box){
          // Rerenders can replace the entire ProseMirror editor. Do not
          // blindly submit text from an unrelated or empty composer.
          if(norm(currentBox.innerText||currentBox.textContent)!==norm(prompt))
            throw Object.assign(Error('Composer was replaced after insertion. No Send occurred; inspect the draft.'),{reasonCode:'composer-replaced'});
          box=currentBox;
        }
        send=sendButton(box);
        if(sendAvailable(send)){plan=submitPlan(box,send);break;}
        await sleep(200);
      }
      if(!plan)plan=submitPlan(box,send);
      if(!plan){
        throw Object.assign(Error('Send remained disabled after editor input. No submit attempted. Visible controls: '+sendDiagnostic(box)),{reasonCode:'send-disabled'});
      }
      if(norm(box.innerText||box.textContent)!==norm(prompt))
        throw Object.assign(Error('Composer contents changed before Send. No submit attempted.'),{reasonCode:'composer-changed'});
      if(stopApply)throw Error('Aborted before send.');
      if(!routeMatches()){
        // Leave the PM draft untouched rather than rewriting ProseMirror
        // state on the wrong page. No submission has occurred.
        throw Object.assign(Error('ChatGPT changed conversation before Send. Nothing was submitted; inspect the draft.'),{reasonCode:'wrong-chat'});
      }
      const beforeMessages=userMessages();
      const beforeCount=beforeMessages.length;
      const beforeMatching=beforeMessages.filter(el=>userMessageMatches(el,prompt)).length;
      // Count exact matching turns, not DOM-node identity alone. React can
      // remount an OLD user message after submission; that must never count as
      // a new verified Send for a repeated prompt.
      const knownBefore=creating?new Set(findChats(pid).map(row=>row.id)):new Set();
      // Commit exactly ONE submission gesture. Form.requestSubmit is a more
      // meaningful fallback than a synthetic Enter when the form is available.
      // Synthetic Enter may be ignored by ChatGPT; we never assume success.
      clicked=true;submitMethod=plan.method;
      await stage('submitting','Attempting one '+plan.method+' submission.');
      if(plan.method==='button')plan.target.click();
      else if(plan.method==='form')plan.target.requestSubmit();
      else{
        box.focus();
        const ev={key:'Enter',code:'Enter',which:13,keyCode:13,bubbles:true,cancelable:true,
          ctrlKey:false,metaKey:false,shiftKey:false};
        box.dispatchEvent(new KeyboardEvent('keydown',ev));
        box.dispatchEvent(new KeyboardEvent('keyup',ev));
      }
      await stage('verifying','One '+submitMethod+' attempt made; checking the exact new user turn.');
      let confirmed=false;
      for(let i=0;i<60;i++){
        await sleep(320);
        // A matching new user message is required; editor clearing is insufficient.
        const currentMessages=userMessages();
        const matchingCount=currentMessages.filter(el=>userMessageMatches(el,prompt)).length;
        // Require a genuinely increased count, so remounting an identical
        // old user turn cannot satisfy the verification gate.
        if(currentMessages.length>beforeCount&&matchingCount>beforeMatching){
          if(!creating){confirmed=true;break;}
          const next=chatId();
          if(next?.projectId===pid&&!knownBefore.has(next.chatId)){confirmed=true;break;}
        }
        if(stopApply)break; // even on stop, a clicked send can have been accepted
      }
      if(!confirmed)throw Object.assign(Error('Submission attempted but no new matching user message appeared. Inspect this conversation before trying again; it may have sent.'),{reasonCode:'unconfirmed'});
      const created=creating?chatId():null;
      await report('PM_RESULT',{jobId,chatId:cid,attemptToken,ok:true,reasonCode:'sent',submitMethod,
        ...(creating?{createdChatId:created.chatId,createdUrl:location.origin+'/g/'+pid+'/c/'+created.chatId}:{})});
    }catch(e){
      await report('PM_RESULT',{jobId,chatId:cid,attemptToken,submitMethod,...fail(e.reasonCode||'error',String(e.message||e),clicked)});
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
    if(message.type==='PM_NEW_READY'){
      const correct=projectId()===message.pid&&!chatId();
      sendResponse({ok:true,ready:correct&&!!composer(),projectId:projectId()});
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
      const valid=message.kind==='new'
        ?projectId()===message.pid&&!chatId()
        :chatId()?.projectId===message.pid&&chatId()?.chatId===message.cid;
      if(!valid||activeApply!==null){sendResponse({accepted:false,reason:'Target project/chat unavailable or busy.'});return;}
      void apply(message);sendResponse({accepted:true});return;
    }
    if(message.type==='PM_APPLY_ABORT'){stopApply=true;sendResponse({ok:true});}
  };
  globalThis.__PM_LISTENER__=listener;
  globalThis.__PM_CONTENT_VERSION__=VERSION;
  chrome.runtime.onMessage.addListener(listener);
})();