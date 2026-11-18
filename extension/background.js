/* PM — Proceed Methodically 0.6 | Chrome MV3 coordinator
 * Single bounded queue; never retries an uncertain send.
 */
'use strict';
const VERSION='0.6.0', KEY='pmJob', PREF='pmPrefs', ALARM='pm-watchdog';
const PROJECT=/^https:\/\/chatgpt\.com\/g\/(g-p-[a-zA-Z0-9-]+)\/project\/?(?:[?#].*)?$/;
const CHAT=/^https:\/\/chatgpt\.com\/g\/(g-p-[a-zA-Z0-9-]+)\/c\/([a-zA-Z0-9-]+)\/?$/;
const DEFAULTS={target:10,prompt:'proceed methodically',effort:'High',delaySeconds:4,loadTimeoutSeconds:180,keepTabs:true};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
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
  if(!Number.isInteger(target)||target<1||target>1000)throw Error('Choose 1 to 1,000 conversations.');
  if(!prompt||prompt.length>16000)throw Error('The prompt must contain 1 to 16,000 characters.');
  if(!['Instant','Medium','High','Extra High','Keep current'].includes(effort))throw Error('Unsupported effort.');
  const loadTimeoutSeconds=Number(raw?.loadTimeoutSeconds??180);
  if(!Number.isFinite(loadTimeoutSeconds)||loadTimeoutSeconds<30||loadTimeoutSeconds>600)throw Error('Page readiness timeout must be 30–600 seconds.');
  if(!Number.isFinite(delaySeconds)||delaySeconds<2||delaySeconds>60)throw Error('Spacing must be between 2 and 60 seconds.');
  return{target,prompt,effort,delaySeconds,loadTimeoutSeconds,keepTabs:raw.keepTabs!==false};
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
async function inspect(tabId){
  const a=await adapter(tabId);
  if(!a.projectId)throw Error('Open a ChatGPT Project overview page.');
  const status=await chrome.tabs.sendMessage(tabId,{type:'PM_CONTEXT'});
  return{ok:true,context:status};
}
async function begin(message,sender){
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
    startedAt:Date.now(),found:0,total:0,index:0,completed:0,failed:0,
    current:null,queue:[],results:[],error:null,pauseReason:null,consecutiveFailures:0,nextAt:0
  };
  await chrome.storage.local.set({[PREF]:cfg});await save(job);await watchdog();
  try{
    const ans=await chrome.tabs.sendMessage(tab.id,{type:'PM_SCAN',jobId:job.id,pid:job.projectId,target:cfg.target});
    if(!ans?.accepted)throw Error(ans?.reason||'Could not start project scan.');
  }catch(e){
    job.status='error';job.error='Project scan unavailable: '+error(e);
    await save(job);await clearWatchdog();throw Error(job.error);
  }
  return{ok:true,jobId:job.id};
}
let launchBusy=false;
const dispatchingTabs=new Set();
let finishSequence=Promise.resolve();
function runnable(j){return j?.status==='running'&&!j.current&&j.index<j.queue.length;}
async function launch(){
  if(launchBusy)return;launchBusy=true;
  try{
    const job=await load();if(!runnable(job))return;
    if(job.nextAt>Date.now()){
      setTimeout(()=>void launch(),Math.min(60000,job.nextAt-Date.now()+30));
      return;
    }
    const item=job.queue[job.index],match=item?.url?.match(CHAT);
    if(!match||match[1]!==job.projectId||match[2]!==item.id){
      await finish(null,{ok:false,error:'Invalid conversation link.',reasonCode:'invalid'},item);return;
    }
    let tab;
    try{tab=await chrome.tabs.create({url:item.url,active:false});}
    catch(e){await finish(null,{ok:false,error:'Failed opening tab: '+error(e),reasonCode:'tab'},item);return;}
    job.current={tabId:tab.id,chatId:item.id,title:item.title,phase:'waiting',startedAt:Date.now(),attemptToken:job.id+':'+job.index+':'+tab.id};
    job.nextAt=0;await save(job);
    // Start readiness polling immediately, even while the browser reports
    // "loading". Waiting for "complete" delayed slow ChatGPT pages unnecessarily.
    void dispatch(tab.id);
  }finally{launchBusy=false;}
}
function currentOwned(j,tabId,token,cid){
  return j?.current?.tabId===tabId && j.current.attemptToken===token && j.current.chatId===cid;
}
async function pauseReadiness(tabId,token,cid,details){
  const j=await load();
  if(!currentOwned(j,tabId,token,cid)||j.status!=='running'||j.current.phase!=='waiting')return;
  j.status='paused';
  j.pauseReason='Chat did not become ready in '+j.config.loadTimeoutSeconds+' seconds: '+details+'. This conversation is still queued and has NOT been sent. Resume to retry this same tab.';
  j.current.waitError=details;
  await save(j);
}
async function dispatch(tabId){
  // One readiness poller for each opened tab; no queue advancement until a
  // real acknowledgement from this exact conversation or an explicit failure.
  if(dispatchingTabs.has(tabId))return;
  dispatchingTabs.add(tabId);
  try{
    let job=await load();
    if(job?.status!=='running'||job.current?.tabId!==tabId||job.current.phase!=='waiting')return;
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
          if(adapterInfo.chat?.projectId!==pid||adapterInfo.chat?.chatId!==cid){
            lastReason='ChatGPT is still routing to the intended conversation';
          }else{
            const r=await chrome.tabs.sendMessage(tabId,{type:'PM_READY',pid,cid});
            if(r?.ready===true)break;
            lastReason='the conversation composer is not available yet';
          }
        }catch(e){lastReason='the ChatGPT content script is still loading ('+error(e)+')';}
      }
      await sleep(650);
    }

    // Re-read after waiting: a pause, stop, navigation or timeout may have
    // changed ownership. Never dispatch from a stale tab-load event.
    job=await load();
    if(job?.id!==jobId||job.status!=='running'||!currentOwned(job,tabId,token,cid)||job.current.phase!=='waiting')return;
    job.current.phase='sending';
    job.current.dispatchedAt=Date.now();
    await save(job);
    let delivered=false;
    try{
      const live=await load();
      if(live?.id!==jobId || !currentOwned(live,tabId,token,cid) || !['running','paused'].includes(live.status))return;
      // It is now safe to send ONLY to the matching content script.
      delivered=true;
      const ack=await chrome.tabs.sendMessage(tabId,{
        type:'PM_APPLY',jobId,pid,cid,attemptToken:token,
        prompt:job.config.prompt,effort:job.config.effort
      });
      if(ack?.accepted===false){delivered=false;throw Error(ack.reason||'Chat was not ready for the prompt.');}
      if(!ack?.accepted)throw Error('Could not confirm that the chat adapter accepted this dispatch.');
    }catch(e){
      await finish(tabId,{ok:false,uncertain:delivered,reasonCode:'dispatch',error:'Dispatch failed: '+error(e)});
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
    const j=await load();
    if(!j||!['running','paused','stopped'].includes(j.status))return;
    if(tabId!==null&&j.current?.tabId!==tabId)return;
    if(tabId===null&&j.current)return;
    const item=explicit||j.queue[j.index];if(!item)return;
    if(tabId!==null&&j.current?.chatId!==item.id){
      j.status='paused';j.pauseReason='Queue identity changed while processing a tab. No further chats will launch.';
      await save(j);return;
    }
    const row={id:item.id,title:item.title,url:item.url,ok:result.ok===true,
      uncertain:result.uncertain===true&&!result.ok,reasonCode:result.reasonCode||'other',
      error:result.ok?null:error(result.error),at:Date.now()};
    j.results.push(row);
    if(j.results.length>1000)j.results.shift();
    if(row.ok){j.completed++;j.consecutiveFailures=0;}
    else{
      j.failed++;
      if(!['draft','busy'].includes(row.reasonCode))j.consecutiveFailures++;
    }
    j.index++;
    const opened=j.current?.tabId;j.current=null;
    if(j.index>=j.queue.length&&j.status!=='stopped'){j.status='done';j.pauseReason=null;}
    else if(j.status==='running'){
      if(row.uncertain){j.status='paused';j.pauseReason='A send was unconfirmed. Inspect '+row.title+' before resuming.';}
      else if(j.consecutiveFailures>=3){j.status='paused';j.pauseReason='Three consecutive failures. Inspect Recent activity before resuming.';}
      else j.nextAt=Date.now()+j.config.delaySeconds*1000;
    }
    await save(j);
    if(opened&&!j.config.keepTabs){try{await chrome.tabs.remove(opened);}catch{}}
    if(j.status==='done'||j.status==='stopped')await clearWatchdog();
    if(runnable(j))setTimeout(()=>void launch(),Math.max(0,j.nextAt-Date.now()));
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
    j.status=j.index>=j.queue.length&&!j.current?'done':'running';
    j.pauseReason=null;j.consecutiveFailures=0;
    if(j.current?.phase==='waiting')j.current.startedAt=Date.now();
    await save(j);await watchdog();
    if(j.current?.phase==='waiting')void dispatch(j.current.tabId);
    else if(runnable(j))await launch();return{ok:true};
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
  if(m.type==='PM_GET_JOB')return reply(load().then(job=>({ok:true,job})));
  if(m.type==='PM_GET_PREFS')return reply(chrome.storage.local.get(PREF).then(r=>({ok:true,prefs:r[PREF]||DEFAULTS})));
  if(m.type==='PM_INSPECT_CONTEXT')return reply(popup?inspect(m.tabId):Promise.reject(Error('Popup only.')));
  if(m.type==='PM_START')return reply(begin(m,s));
  if(['PM_PAUSE','PM_RESUME','PM_STOP'].includes(m.type))return reply(popup?control(m.type):Promise.reject(Error('Popup only.')));
  if(m.type==='PM_SCAN_PROGRESS')return reply((async()=>{
    const j=await load();
    if(j?.id===m.jobId&&j.status==='scanning'&&s.tab?.id===j.projectTabId){
      j.found=Math.max(j.found,Number(m.found)||0);await save(j);
    }return{ok:true};
  })());
  if(m.type==='PM_SCANNED')return reply((async()=>{
    const j=await load();
    if(j?.id!==m.jobId||j?.status!=='scanning'||s.tab?.id!==j.projectTabId)return{ok:false};
    if(m.error){j.status='error';j.error=error(m.error);await save(j);await clearWatchdog();return{ok:true};}
    const seen=new Set();
    j.queue=(Array.isArray(m.chats)?m.chats:[]).filter(it=>{
      const a=String(it?.url||'').match(CHAT);if(!a||a[1]!==j.projectId||seen.has(a[2]))return false;
      seen.add(a[2]);return true;
    }).slice(0,j.target).map(it=>({id:String(it.id),title:String(it.title||'Untitled chat').slice(0,180),url:String(it.url)}));
    j.total=j.queue.length;j.found=Math.max(j.found,Number(m.found)||0,j.total);
    j.status=j.total?'running':'error';
    if(!j.total)j.error='No conversations found in this project.';
    await save(j);if(j.total)void launch();else await clearWatchdog();return{ok:true};
  })());
  if(m.type==='PM_RESULT')return reply((async()=>{
    const j=await load();
    if(j?.id!==m.jobId||j.current?.tabId!==s.tab?.id||j.current.chatId!==m.chatId||j.current.attemptToken!==m.attemptToken||j.current.phase!=='sending')return{ok:false};
    await finish(s.tab.id,{ok:m.ok===true,uncertain:m.uncertain===true,reasonCode:m.reasonCode,error:m.error});
    return{ok:true};
  })());
});
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.status==='complete'||typeof change.url==='string')void dispatch(id);});
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
chrome.runtime.onStartup.addListener(()=>void watchdog());
chrome.runtime.onInstalled.addListener(()=>void watchdog());
