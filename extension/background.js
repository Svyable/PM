/* PM — Proceed Methodically 0.10 | Chrome MV3 coordinator
 * Single bounded queue; never retries an uncertain send.
 */
'use strict';
const VERSION='0.10.0', KEY='pmJob', PREF='pmPrefs', ALARM='pm-watchdog';
const PROJECT=/^https:\/\/chatgpt\.com\/g\/(g-p-[a-zA-Z0-9-]+)\/project\/?(?:[?#].*)?$/;
const CHAT=/^https:\/\/chatgpt\.com\/g\/(g-p-[a-zA-Z0-9-]+)\/c\/([a-zA-Z0-9-]+)\/?$/;
const DEFAULTS={mode:'existing',newCount:1,target:10,prompt:'proceed methodically',effort:'High',delaySeconds:4,loadTimeoutSeconds:180,keepTabs:true};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

const CATALOG='pmCatalog', VISITS='pmVisits';
const projectFromUrl=url=>String(url||'').match(PROJECT)?.[1]||null;
const chatFromUrl=url=>{
  const match=String(url||'').split(/[?#]/)[0].match(CHAT);
  return match?{projectId:match[1],chatId:match[2]}:null;
};
let catalogSequence=Promise.resolve();
function updateCatalog(projectId,rows,complete=false,info={}){
  if(!projectId||!Array.isArray(rows))return Promise.resolve();
  const work=async()=>{
    const stored=(await chrome.storage.local.get(CATALOG))[CATALOG]||{};
    const old=stored[projectId]||{chats:[],lastUpdated:0,complete:false};
    const byId=new Map(old.chats.map(x=>[x.id,x]));
    for(const row of rows){
      const m=chatFromUrl(row?.url);
      if(!m||m.projectId!==projectId||m.chatId!==row.id)continue;
      byId.set(row.id,{...byId.get(row.id),id:row.id,url:row.url,
        title:String(row.title||'Untitled conversation').slice(0,180),
        description:String(row.description||'').slice(0,280),
        updated:String(row.updated||'').slice(0,100)});
    }
    stored[projectId]={...old,chats:[...byId.values()].slice(0,1000),
      lastUpdated:Date.now(),complete:complete||old.complete,
      scanning:info.scanning??old.scanning??false,
      projectTitle:info.projectTitle||old.projectTitle||'',
      scanStep:info.step??old.scanStep??0};
    await chrome.storage.local.set({[CATALOG]:stored});
  };
  const next=catalogSequence.then(work,work);
  catalogSequence=next.catch(()=>{});
  return next;
}
async function recordVisit(tabId){
  const tab=await chrome.tabs.get(tabId).catch(()=>null);
  const target=chatFromUrl(tab?.url);
  if(!target)return;
  const key=target.projectId;
  const all=(await chrome.storage.local.get(VISITS))[VISITS]||{};
  all[key]=all[key]||{};
  all[key][target.chatId]=Date.now();
  await chrome.storage.local.set({[VISITS]:all});
}
async function overview(tabId){
  const tab=await chrome.tabs.get(tabId);
  const pid=projectFromUrl(tab.url);
  if(!pid)throw Error('Open the project overview page.');
  let live=null;
  try{await adapter(tabId);live=await chrome.tabs.sendMessage(tabId,{type:'PM_CONTEXT'});}
  catch{}
  if(live?.projectId===pid&&Array.isArray(live.chats))
    await updateCatalog(pid,live.chats,false,{projectTitle:live.projectTitle});
  const [saved,visits,tabs,job]=await Promise.all([
    chrome.storage.local.get(CATALOG),chrome.storage.local.get(VISITS),
    chrome.tabs.query({url:'https://chatgpt.com/*'}),load()
  ]);
  const catalog=saved[CATALOG]?.[pid]||{chats:[],complete:false};
  const seen=visits[VISITS]?.[pid]||{};
  const open=tabs.filter(t=>chatFromUrl(t.url)?.projectId===pid);
  const uniqueIds=new Set(open.map(t=>chatFromUrl(t.url)?.chatId));
  const samples=await Promise.allSettled(open.slice(0,24).map(async t=>{
    const r=await chrome.tabs.sendMessage(t.id,{type:'PM_STATUS'});
    return r?.ok?r:null;
  }));
  const measured=samples.filter(x=>x.status==='fulfilled'&&x.value).map(x=>x.value);
  const known=catalog.chats||[];
  const trackedSeen=known.filter(x=>!!seen[x.id]).length;
  return {ok:true,projectId:pid,projectTitle:catalog.projectTitle||live?.projectTitle||'Project',
    known:known.length,visible:live?.count??null,complete:!!catalog.complete,
    scanning:!!catalog.scanning,scanStep:catalog.scanStep||0,
    lastUpdated:catalog.lastUpdated||0,trackedSeen,notYetVisited:Math.max(0,known.length-trackedSeen),
    openTabs:open.length,openConversations:uniqueIds.size,
    generatingObserved:measured.filter(x=>x.generating).length,
    generatingChecked:measured.length,generatingSampleLimit:Math.min(24,open.length),
    chats:known.slice(0,1000).map(row=>({...row,visitedAt:seen[row.id]||null,
      open:uniqueIds.has(row.id)})),
    job:job?.projectId===pid?job:null};
}

const error=e=>String(e?.message||e||'Unknown error').slice(0,320);
async function load(){return(await chrome.storage.local.get(KEY))[KEY]||null;}
async function save(job){
  job.updatedAt=Date.now();await chrome.storage.local.set({[KEY]:job});
  try{
    await chrome.action.setBadgeText({text:job.status==='running'?String(job.completed+job.failed):job.status==='done'?'✓':job.status==='error'?'!':''});
    await chrome.action.setBadgeBackgroundColor({color:'#7889ff'});
  }catch{}
}
async function watchdog(){try{await chrome.alarms.create(ALARM,{periodInMinutes:.5});}catch{}}
async function clearWatchdog(){try{await chrome.alarms.clear(ALARM);}catch{}}
function validate(raw){
  const target=Number(raw?.target),prompt=String(raw?.prompt||'').trim(),effort=String(raw?.effort||'High'),delaySeconds=Number(raw?.delaySeconds);
  const mode=String(raw?.mode||'existing');
  if(!['existing','new','mixed'].includes(mode))throw Error('Choose a valid thread strategy.');
  const newCount=mode==='new'?target:mode==='existing'?0:Number(raw?.newCount);
  if(mode==='mixed'&&(!Number.isInteger(newCount)||newCount<1||newCount>=target))throw Error('Mixed mode needs 1–'+(target-1)+' new threads and at least one existing thread.');
  if(!Number.isInteger(target)||target<1||target>1000)throw Error('Choose 1 to 1,000 conversations.');
  if(!prompt||prompt.length>16000)throw Error('The prompt must contain 1 to 16,000 characters.');
  if(!['Instant','Medium','High','Extra High','Keep current'].includes(effort))throw Error('Unsupported effort.');
  const loadTimeoutSeconds=Number(raw?.loadTimeoutSeconds??180);
  if(!Number.isFinite(loadTimeoutSeconds)||loadTimeoutSeconds<30||loadTimeoutSeconds>600)throw Error('Page readiness timeout must be 30–600 seconds.');
  if(!Number.isFinite(delaySeconds)||delaySeconds<2||delaySeconds>60)throw Error('Spacing must be between 2 and 60 seconds.');
  return{target,mode,newCount,prompt,effort,delaySeconds,loadTimeoutSeconds,keepTabs:raw.keepTabs!==false};
}
// New threads are created only by submitting in the Project overview composer.
// Synthetic IDs are queue identities, never pretend to be real ChatGPT IDs.
function appendNewThreads(job){
  if(job.newItemsAdded)return;
  const count=Number(job.config.newCount)||0;
  const base='https://chatgpt.com/g/'+job.projectId+'/project';
  for(let i=0;i<count;i++){
    job.queue.push({kind:'new',id:'new:'+i,url:base,title:'New conversation #'+(i+1)});
  }
  job.newItemsAdded=true;
  job.total=job.queue.length;
}

const attaching=new Map();
const recentlyInjected=new Map();
async function ping(tabId){try{const r=await chrome.tabs.sendMessage(tabId,{type:'PM_PING'});return r?.ok&&r.version===VERSION?r:null;}catch{return null;}}
async function adapter(tabId){
  const alive=await ping(tabId);if(alive)return alive;
  if(attaching.has(tabId))return attaching.get(tabId);
  const promise=(async()=>{
    const tab=await chrome.tabs.get(tabId);
    if(!tab.url?.startsWith('https://chatgpt.com/'))throw Error('Open ChatGPT first.');
    // Avoid stacking scripts on a slowly navigating tab.
    if(Date.now()-(recentlyInjected.get(tabId)||0)<2200)throw Error('Waiting for ChatGPT content script.');
    recentlyInjected.set(tabId,Date.now());
    try{await chrome.scripting.executeScript({target:{tabId},files:['content.js'],injectImmediately:true});}
    catch(e){throw Error('Could not connect to ChatGPT yet: '+error(e));}
    for(let i=0;i<15;i++){const r=await ping(tabId);if(r)return r;await sleep(200);}
    throw Error('Content adapter did not respond after injection. Reload the ChatGPT tab.');
  })();
  attaching.set(tabId,promise);
  try{return await promise;}finally{attaching.delete(tabId);}
}
// The native side panel is window-scoped and remains open while other tabs
// are used. Discover a Project without making users click Reconnect.
async function findProject(preferredTabId=null){
  const tabs=await chrome.tabs.query({});
  const projects=tabs.filter(t=>projectFromUrl(t.url));
  const active=tabs.find(t=>t.active&&t.lastFocusedWindow);
  const activeProject=active&&projects.find(t=>t.id===active.id);
  const activeChat=chatFromUrl(active?.url);
  const related=activeChat&&projects.find(t=>projectFromUrl(t.url)===activeChat.projectId);
  const preferred=projects.find(t=>t.id===preferredTabId);
  const job=await load();
  const running=job&&['running','scanning','paused'].includes(job.status)
    ?projects.find(t=>t.id===job.projectTabId):null;
  const tab=activeProject||related||preferred||running||projects[0];
  return{ok:true,tabId:tab?.id??null,projectId:projectFromUrl(tab?.url),
    status:tab?'ready':'no-project',
    message:tab?'Project ready':'Open a ChatGPT Project overview to start'};
}
async function inspect(tabId){
  const a=await adapter(tabId);
  if(!a.projectId)throw Error('Open a ChatGPT Project overview page.');
  const status=await chrome.tabs.sendMessage(tabId,{type:'PM_CONTEXT'});
  return{ok:true,context:status};
}
async function begin(message,sender){
  return withJobLock(async()=>{
  if(!sender?.url?.startsWith('chrome-extension://'))throw Error('PM must be launched from its popup.');
  const prior=await load();
  if(prior&&['running','scanning','paused'].includes(prior.status))throw Error('A run is already active. Stop or finish it first.');
  const cfg=validate(message.config),tab=await chrome.tabs.get(message.tabId),match=tab.url?.match(PROJECT);
  if(!match)throw Error('Open a ChatGPT Project overview before launching PM.');
  const a=await adapter(tab.id);
  if(a.projectId!==match[1])throw Error('Wrong project tab; refresh and retry.');
  const job={
    id:'pm-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),version:VERSION,status:'scanning',
    projectId:match[1],projectTabId:tab.id,target:cfg.target,config:cfg,
    startedAt:Date.now(),found:0,total:0,index:0,completed:0,failed:0,scanComplete:cfg.mode==='new',scanStep:0,
    existingTarget:cfg.target-cfg.newCount,newItemsAdded:false,
    current:null,queue:[],results:[],error:null,pauseReason:null,consecutiveFailures:0,nextAt:0
  };
  if(cfg.mode==='new'){
    appendNewThreads(job);
    job.status='running';
  }
  await chrome.storage.local.set({[PREF]:cfg});await save(job);await watchdog();
  if(cfg.mode==='new'){
    // No project chat scan is needed to create new conversations.
    setTimeout(()=>void launch(),0);
  }else{
    try{
      const ans=await chrome.tabs.sendMessage(tab.id,{type:'PM_SCAN',jobId:job.id,pid:job.projectId,target:job.existingTarget});
      if(!ans?.accepted)throw Error(ans?.reason||'Could not start project scan.');
    }catch(e){
      job.status='error';job.error='Project scan unavailable: '+error(e);
      await save(job);await clearWatchdog();throw Error(job.error);
    }
  }
  return{ok:true,jobId:job.id};
  });
}
let launchBusy=false;
let jobLockTail=Promise.resolve();
async function withJobLock(fn){
  let release;
  const turn=new Promise(resolve=>{release=resolve;});
  const previous=jobLockTail;
  jobLockTail=turn;
  await previous;
  try{return await fn();}finally{release();}
}
const dispatchingTabs=new Set();
let finishSequence=Promise.resolve();
function runnable(j){return j?.status==='running'&&!j.current&&j.index<j.queue.length;}
async function launch(){
  if(launchBusy)return;launchBusy=true;
  try{
    return await withJobLock(async()=>{
    const job=await load();if(!runnable(job))return;
    if(job.nextAt>Date.now()){
      setTimeout(()=>void launch(),Math.min(60000,job.nextAt-Date.now()+30));
      return;
    }
    const item=job.queue[job.index],match=item?.url?.match(item?.kind==='new'?PROJECT:CHAT);
    if(!match||match[1]!==job.projectId||(item.kind!=='new'&&match[2]!==item.id)){
      setTimeout(()=>void finish(null,{ok:false,error:'Invalid conversation link.',reasonCode:'invalid'},item),0);return;
    }
    let tab;
    try{tab=await chrome.tabs.create({url:item.url,active:false});}
    catch(e){setTimeout(()=>void finish(null,{ok:false,error:'Failed opening tab: '+error(e),reasonCode:'tab'},item),0);return;}
    job.current={tabId:tab.id,chatId:item.id,title:item.title,phase:'waiting',startedAt:Date.now(),attemptToken:job.id+':'+job.index+':'+tab.id};
    job.nextAt=0;await save(job);
    // Start readiness polling immediately, even while the browser reports
    // "loading". Waiting for "complete" delayed slow ChatGPT pages unnecessarily.
    void dispatch(tab.id);
    });
  }finally{launchBusy=false;}
}
function currentOwned(j,tabId,token,cid){
  return j?.current?.tabId===tabId && j.current.attemptToken===token && j.current.chatId===cid;
}
async function pauseReadiness(tabId,token,cid,details){
  return withJobLock(async()=>{
    const j=await load();
    if(!currentOwned(j,tabId,token,cid)||j.status!=='running'||j.current.phase!=='waiting')return;
    j.status='paused';
    j.pauseReason='Chat did not become ready in '+j.config.loadTimeoutSeconds+' seconds: '+details+'. This conversation is still queued and has NOT been sent. Resume to retry this same tab.';
    j.current.waitError=details;
    await save(j);
  });
}
async function dispatch(tabId){
  // One readiness poller for each opened tab; no queue advancement until a
  // real acknowledgement from this exact conversation or an explicit failure.
  if(dispatchingTabs.has(tabId))return;
  dispatchingTabs.add(tabId);
  try{
    let job=await load();
    if(job?.status!=='running'||job.version!==VERSION||job.current?.tabId!==tabId||job.current.phase!=='waiting')return;
    const token=job.current.attemptToken,cid=job.current.chatId,pid=job.projectId,jobId=job.id;
    const expected=job.queue[job.index]?.url;
    if(!expected || job.queue[job.index]?.id!==cid){
      await pauseReadiness(tabId,token,cid,'Queue identity does not match the selected tab');
      return;
    }
    let lastReason='waiting for ChatGPT to render its composer';
    while(true){
      job=await load();
      if(job?.id!==jobId||job.status!=='running'||!currentOwned(job,tabId,token,cid)||job.current.phase!=='waiting')return;
      if(Date.now()-job.current.startedAt>(job.config.loadTimeoutSeconds||180)*1000){
        await pauseReadiness(tabId,token,cid,lastReason);
        return;
      }
      const tab=await chrome.tabs.get(tabId).catch(()=>null);
      if(!tab){
        await finish(tabId,{ok:false,reasonCode:'tab',error:'Conversation tab was closed before sending.'});
        return;
      }
      // Chrome emits "complete" for intermediate redirects too. The URL,
      // content script route, and composer must ALL match the queued chat.
      const actual=String(tab.url||'').split(/[?#]/)[0].replace(/\/$/,'');
      if(actual!==expected.replace(/\/$/,'')){
        lastReason='browser is at '+(actual||'an unfinished navigation')+' rather than the queued conversation';
      }else{
        try{
          const adapterInfo=await adapter(tabId);
          const newChat=job.queue[job.index]?.kind==='new';
          const correctContext=newChat
            ?adapterInfo.projectId===pid&&!adapterInfo.chat
            :adapterInfo.chat?.projectId===pid&&adapterInfo.chat?.chatId===cid;
          if(!correctContext){
            lastReason=newChat?'ChatGPT is not on this Project overview':'ChatGPT is still routing to the intended conversation';
          }else{
            const r=await chrome.tabs.sendMessage(tabId,newChat
              ?{type:'PM_NEW_READY',pid}
              :{type:'PM_READY',pid,cid});
            if(r?.ready===true)break;
            lastReason=newChat?'the Project new-chat composer is not ready':'the conversation composer is not available yet';
          }
        }catch(e){lastReason='the ChatGPT content script is still loading ('+error(e)+')';}
      }
      await sleep(650);
    }

    // Re-read after waiting: a pause, stop, navigation or timeout may have
    // changed ownership. Never dispatch from a stale tab-load event.
    job=await withJobLock(async()=>{
      const latest=await load();
      if(latest?.id!==jobId||latest.status!=='running'||!currentOwned(latest,tabId,token,cid)||latest.current.phase!=='waiting')return null;
      latest.current.phase='sending';
      latest.current.dispatchedAt=Date.now();
      await save(latest);
      return latest;
    });
    if(!job)return;
    let delivered=false;
    try{
      const live=await load();
      if(live?.id!==jobId || !currentOwned(live,tabId,token,cid) || !['running','paused'].includes(live.status))return;
      // It is now safe to send ONLY to the matching content script.
      delivered=true;
      const ack=await chrome.tabs.sendMessage(tabId,{
        type:'PM_APPLY',jobId,pid,cid,attemptToken:token,
        kind:job.queue[job.index]?.kind==='new'?'new':'existing',
        prompt:job.config.prompt,effort:job.config.effort
      });
      if(ack?.accepted===false){delivered=false;throw Error(ack.reason||'Chat was not ready for the prompt.');}
      if(!ack?.accepted)throw Error('Could not confirm that the chat adapter accepted this dispatch.');
    }catch(e){
      if(!delivered){
        // The content script explicitly declined: no send was accepted.
        // Retain this queue item for an intentional retry after inspection.
        const j=await load();
        if(j?.id===jobId&&currentOwned(j,tabId,token,cid)&&j.status==='running'){
          j.status='paused';
          j.current.phase='waiting';
          j.current.waitError=error(e);
          j.pauseReason='The chat was not ready to accept the instruction: '+error(e)+'. Nothing was submitted; Resume retries this same conversation.';
          await save(j);
        }
      }else{
        await finish(tabId,{ok:false,uncertain:true,reasonCode:'dispatch',error:'Dispatch may have been sent: '+error(e)});
      }
    }
  }finally{dispatchingTabs.delete(tabId);}
}
async function finish(tabId,result,explicit=null){
  // Serialize competing callbacks rather than silently losing the second result.
  let release;
  const turn=new Promise(resolve=>{release=resolve;});
  const previous=finishSequence;
  finishSequence=turn;
  await previous;
  try{
    await withJobLock(async()=>{
    const j=await load();
    if(!j||!['running','paused','stopped'].includes(j.status))return;
    if(tabId!==null&&j.current?.tabId!==tabId)return;
    if(tabId===null&&j.current)return;
    const item=explicit||j.queue[j.index];if(!item)return;
    if(tabId!==null&&j.current?.chatId!==item.id){
      j.status='paused';j.pauseReason='Queue identity changed while processing a tab. No further chats will launch.';
      await save(j);return;
    }
    if(result.reasonCode==='wrong-chat'&&!result.uncertain){
      // The content script rejected a late route change before Send.
      // Never advance the cursor or accidentally send to the next chat.
      j.status='paused';j.current.phase='waiting';j.current.waitError=error(result.error);
      j.pauseReason='ChatGPT navigated to a different conversation before Send. Nothing was submitted. Resume to retry this queued thread.';
      await save(j);return;
    }
    const row={id:result.ok&&result.createdChatId?result.createdChatId:item.id,
      queueId:item.id,kind:item.kind==='new'?'new':'existing',title:item.title,
      url:result.createdUrl||item.url,ok:result.ok===true,
      uncertain:result.uncertain===true&&!result.ok,reasonCode:result.reasonCode||'other',
      error:result.ok?null:error(result.error),at:Date.now(),
      readyWaitMs:j.current?.dispatchedAt?Math.max(0,j.current.dispatchedAt-j.current.startedAt):null,
      confirmationWaitMs:j.current?.dispatchedAt?Math.max(0,Date.now()-j.current.dispatchedAt):null};
    j.results.push(row);
    if(row.ok&&row.kind==='new'){
      void updateCatalog(j.projectId,[{id:row.id,url:row.url,title:row.title}],false);
    }
    if(j.results.length>1000)j.results.shift();
    if(row.ok){j.completed++;j.consecutiveFailures=0;}
    else{
      j.failed++;
      if(!['draft','busy'].includes(row.reasonCode))j.consecutiveFailures++;
    }
    j.index++;
    const opened=j.current?.tabId;j.current=null;
    // A potentially sent message always requires explicit attention,
    // including when it was the LAST item in the queue.
    if(row.uncertain&&j.status!=='stopped'){
      j.status='paused';
      j.pauseReason='Unconfirmed send for '+row.title+'. Inspect that conversation before acknowledging this run; PM will not retry it automatically.';
    }else if(j.index>=j.queue.length&&j.scanComplete&&j.status!=='stopped'){
      j.status='done';j.pauseReason=null;
    }else if(j.status==='running'){
      if(j.consecutiveFailures>=3){j.status='paused';j.pauseReason='Three consecutive failures. Inspect Recent activity before resuming.';}
      else j.nextAt=Date.now()+j.config.delaySeconds*1000;
    }
    await save(j);
    if(opened&&!j.config.keepTabs){try{await chrome.tabs.remove(opened);}catch{}}
    if(j.status==='done'||j.status==='stopped')await clearWatchdog();
    if(runnable(j))setTimeout(()=>void launch(),Math.max(0,j.nextAt-Date.now()));
    });
  }finally{release();}
}
async function control(type){
  const j=await load();if(!j)throw Error('No run found.');
  if(type==='PM_PAUSE'){
    if(j.status!=='running')throw Error('The run is not running.');
    j.status='paused';j.pauseReason='Paused by you. The current chat may finish.';await save(j);return{ok:true};
  }
  if(type==='PM_RESUME'){
    if(j.status!=='paused')throw Error('The run is not paused.');
    if(j.version!==VERSION)throw Error('This run began in an older PM version. Stop it and start a new run.');
    j.status=j.index>=j.queue.length&&!j.current?'done':'running';
    j.pauseReason=null;j.consecutiveFailures=0;
    if(j.current?.phase==='waiting')j.current.startedAt=Date.now();
    await save(j);await watchdog();
    if(j.current?.phase==='waiting'){
      const tabId=j.current.tabId;
      void dispatch(tabId);
      // The previous readiness poller may still be releasing its lock.
      setTimeout(()=>void dispatch(tabId),300);
    }else if(runnable(j))await launch();return{ok:true};
  }
  if(type==='PM_STOP'){
    if(!['running','scanning','paused'].includes(j.status))return{ok:true};
    const scanning=j.status==='scanning';j.status='stopped';j.pauseReason=null;await save(j);
    try{
      if(scanning)await chrome.tabs.sendMessage(j.projectTabId,{type:'PM_SCAN_ABORT'});
      else if(j.current?.tabId && j.current.phase==='sending')await chrome.tabs.sendMessage(j.current.tabId,{type:'PM_APPLY_ABORT'});
    }catch{}
    await clearWatchdog();return{ok:true};
  }
  throw Error('Unknown control.');
}
chrome.runtime.onMessage.addListener((m,s,sendResponse)=>{
  if(!m||typeof m.type!=='string')return;
  const reply=p=>{Promise.resolve(p).then(sendResponse,e=>sendResponse({ok:false,error:error(e)}));return true;};
  const popup=s?.url?.startsWith('chrome-extension://');
  if(m.type==='PM_FIND_PROJECT')return reply(popup?findProject(m.preferredTabId):Promise.reject(Error('Extension panel only.')));
  if(m.type==='PM_OPEN_PANEL'){
    if(!projectFromUrl(s.tab?.url))return reply(Promise.reject(Error('Open a ChatGPT Project overview.')));
    // Called directly from a button click in the page; don't await before open.
    return reply(chrome.sidePanel.open({tabId:s.tab.id}).then(()=>({ok:true})));
  }
  if(m.type==='PM_GET_JOB')return reply(load().then(job=>({ok:true,job})));
  if(m.type==='PM_HOST_CONTEXT')return reply((async()=>{
    const pid=projectFromUrl(s.tab?.url);
    if(!pid)throw Error('Not on a project overview.');
    return{ok:true,tabId:s.tab.id,projectId:pid};
  })());
  if(m.type==='PM_GET_OVERVIEW')return reply(popup?overview(m.tabId):Promise.reject(Error('Extension panel only.')));
  if(m.type==='PM_INVENTORY_REFRESH')return reply((async()=>{
    if(!popup)throw Error('Extension panel only.');
    const tab=await chrome.tabs.get(m.tabId),pid=projectFromUrl(tab.url);
    if(!pid)throw Error('Open a project page before scanning.');
    const job=await load();
    if(job&&['scanning','running'].includes(job.status)&&job.projectId===pid)throw Error('PM is already dispatching. Inventory updates automatically.');
    await adapter(tab.id);
    const ack=await chrome.tabs.sendMessage(tab.id,{type:'PM_INVENTORY_SCAN',pid,target:1000});
    if(!ack?.accepted)throw Error(ack?.reason||'Inventory scan unavailable.');
    await updateCatalog(pid,[],false,{scanning:true,step:0});
    return{ok:true};
  })());
  if(m.type==='PM_GET_PREFS')return reply(chrome.storage.local.get(PREF).then(r=>({ok:true,prefs:r[PREF]||DEFAULTS})));
  if(m.type==='PM_INSPECT_CONTEXT')return reply(popup?inspect(m.tabId):Promise.reject(Error('Popup only.')));
  if(m.type==='PM_START')return reply(begin(m,s));
  if(['PM_PAUSE','PM_RESUME','PM_STOP'].includes(m.type))return reply(popup?control(m.type):Promise.reject(Error('Popup only.')));

  if(m.type==='PM_SCAN_PROGRESS')return reply(withJobLock(async()=>{
    const j=await load();
    if(j?.id!==m.jobId||j.scanComplete||!['scanning','running','paused'].includes(j.status)||s.tab?.id!==j.projectTabId)return{ok:false};
    j.found=Math.max(j.found,Number(m.found)||0);
    j.scanStep=Number(m.step)||0;
    const seen=new Set(j.queue.map(x=>x.id));
    for(const row of (Array.isArray(m.chats)?m.chats:[])){
      const match=chatFromUrl(row.url);
      if(!match||match.projectId!==j.projectId||seen.has(row.id)||j.queue.length>=j.existingTarget)continue;
      seen.add(row.id);
      j.queue.push({id:row.id,url:row.url,title:String(row.title||'Untitled chat').slice(0,180)});
    }
    j.total=j.queue.length;
    if(j.status==='scanning'&&j.total)j.status='running';
    await save(j);
    void updateCatalog(j.projectId,m.chats,false,{scanning:true,step:j.scanStep});
    if(runnable(j))void launch();
    return{ok:true};
  }));
  if(m.type==='PM_SCANNED')return reply(withJobLock(async()=>{
    const j=await load();
    if(j?.id!==m.jobId||!['scanning','running','paused'].includes(j.status)||s.tab?.id!==j.projectTabId)return{ok:false};
    if(m.error){
      if(j.total){j.scanComplete=true;j.scanWarning=error(m.error);}
      else{j.status='error';j.error=error(m.error);}
    }else{
      const seen=new Set(j.queue.map(x=>x.id));
      for(const row of (Array.isArray(m.chats)?m.chats:[])){
        const match=chatFromUrl(row.url);
        if(!match||match.projectId!==j.projectId||seen.has(row.id)||j.queue.length>=j.existingTarget)continue;
        seen.add(row.id);j.queue.push({id:row.id,url:row.url,title:String(row.title||'Untitled chat').slice(0,180)});
      }
      j.scanComplete=true;
    }
    // Mixed mode launches the requested new threads AFTER existing discovery.
    if(j.scanComplete&&j.config.newCount)appendNewThreads(j);
    j.found=Math.max(j.found,Number(m.found)||0,j.queue.filter(item=>item.kind!=='new').length);
    j.total=j.queue.length;
    if(!j.total&&j.status!=='paused'){j.status='error';j.error=j.error||'No conversations were discovered in this project.';}
    else if(j.status==='scanning')j.status='running';
    if(j.scanComplete&&j.index>=j.total&&!j.current&&j.status==='running')j.status='done';
    await save(j);
    void updateCatalog(j.projectId,m.chats||[],!!j.scanComplete,{scanning:false,step:j.scanStep});
    if(j.status==='done'||j.status==='error')await clearWatchdog();
    else if(runnable(j))void launch();
    return{ok:true};
  }));
  if(m.type==='PM_INVENTORY_PROGRESS'||m.type==='PM_INVENTORY_DONE')return reply((async()=>{
    const pid=projectFromUrl(s.tab?.url),rows=Array.isArray(m.chats)?m.chats:[];
    if(!pid||pid!==m.pid)return{ok:false};
    await updateCatalog(pid,rows,m.type==='PM_INVENTORY_DONE'&&!m.error,
      {scanning:m.type!=='PM_INVENTORY_DONE',step:Number(m.step)||0});
    return{ok:true};
  })());
  if(m.type==='PM_RESULT')return reply((async()=>{
    const j=await load();
    if(j?.id!==m.jobId||j.current?.tabId!==s.tab?.id||j.current.chatId!==m.chatId||j.current.attemptToken!==m.attemptToken||j.current.phase!=='sending')return{ok:false};
    const item=j.queue[j.index];
    let verified=m.ok===true,uncertain=m.uncertain===true,reasonCode=m.reasonCode,errorText=m.error;
    if(item?.kind==='new'&&verified){
      const parsed=chatFromUrl(m.createdUrl),actual=m.createdChatId;
      if(!parsed||parsed.projectId!==j.projectId||parsed.chatId!==actual){
        verified=false;uncertain=true;reasonCode='new-chat-unverified';
        errorText='The new conversation URL could not be verified inside this project.';
      }
    }
    await finish(s.tab.id,{ok:verified,uncertain,reasonCode,error:errorText,
      createdChatId:m.createdChatId,createdUrl:m.createdUrl});
    return{ok:true};
  })());
});
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.status==='complete'||typeof change.url==='string')void dispatch(id);});
chrome.tabs.onActivated.addListener(info=>{void recordVisit(info.tabId);});
chrome.tabs.onRemoved.addListener(id=>{void(async()=>{
  const j=await load();
  if(j?.current?.tabId===id)await finish(id,{ok:false,uncertain:j.current.phase==='sending',reasonCode:'closed',error:'Tab closed before confirmation.'});
  else if(j?.status==='scanning'&&j.projectTabId===id){
    j.status='error';j.error='Project tab closed during scan.';await save(j);await clearWatchdog();
  }
})();});
chrome.alarms.onAlarm.addListener(a=>{if(a.name!==ALARM)return;void(async()=>{
  const j=await load();if(!j||!['running','scanning','paused'].includes(j.status)){await clearWatchdog();return;}
  if(j.status==='scanning'&&Date.now()-j.startedAt>240000){
    j.status='error';j.error='Project scan timed out.';await save(j);await clearWatchdog();return;
  }
  if(j.status==='running'&&j.current){
    if(j.current.phase==='waiting'){
      if(Date.now()-j.current.startedAt>(j.config.loadTimeoutSeconds||180)*1000)
        await pauseReadiness(j.current.tabId,j.current.attemptToken,j.current.chatId,'readiness deadline exceeded');
      else void dispatch(j.current.tabId);
    }else if(j.current.phase==='sending'&&Date.now()-j.current.dispatchedAt>90000){
      await finish(j.current.tabId,{ok:false,uncertain:true,reasonCode:'unconfirmed',error:'Timed out waiting for an acknowledged chat send. Inspect before retrying.'});
    }
  }else if(j.status==='running')await launch();
})();});
async function quarantineOldJob(){
  const j=await load();
  if(j&&j.version!==VERSION&&['running','scanning','paused'].includes(j.status)){
    j.status='paused';
    j.pauseReason='A PM update occurred during this run. Stop this older run and start a new one to avoid dispatching with stale queue state.';
    await save(j);
  }
}
function enableSidePanel(){
  // Toolbar icon opens PM's resizable Chrome side panel. No popup/reconnect step.
  try{void chrome.sidePanel?.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});}catch{}
}
enableSidePanel();
chrome.runtime.onStartup.addListener(()=>{enableSidePanel();void watchdog();void quarantineOldJob();});
chrome.runtime.onInstalled.addListener(()=>{enableSidePanel();void watchdog();void quarantineOldJob();});
