/* PM 0.6 — popup controls and status. No external dependencies. */
'use strict';
const $=id=>document.getElementById(id);
const setup=$('setup'),run=$('run'),notice=$('notice'),launchButton=$('launch');
let projectTabId=null,latestJob=null,showingRun=false,working=false,manualNew=false;
async function message(type,extras={}){
  try{const r=await chrome.runtime.sendMessage({type,...extras});if(r?.ok===false)throw Error(r.error||'PM request failed.');return r;}
  catch(e){throw Error(String(e.message||e));}
}
function inform(s){
  notice.hidden=!s;
  if(s)notice.textContent=s;
}
function statusConnection(ok,desc){
  $('connectionDot').className='signal '+(ok?'good':'bad');
  $('connectionMessage').textContent=desc;
  launchButton.disabled=!ok;
}
async function inspect(){
  statusConnection(false,'Connecting to ChatGPT Project…');
  try{
    const tabs=await chrome.tabs.query({active:true,currentWindow:true});
    const tab=tabs[0];
    if(!tab?.url||!/^https:\/\/chatgpt\.com\/g\/g-p-[a-zA-Z0-9-]+\/project\/?(?:[?#].*)?$/.test(tab.url)){
      projectTabId=null;
      statusConnection(false,'Open a ChatGPT Project overview');
      return;
    }
    const r=await message('PM_INSPECT_CONTEXT',{tabId:tab.id});
    if(!r.context?.projectId)throw Error('Not a project overview.');
    projectTabId=tab.id;
    statusConnection(true,'ChatGPT Project detected');
    inform('');
  }catch(e){projectTabId=null;statusConnection(false,'Connection failed — click Reconnect');inform(String(e.message||e));}
}
function showRunMode(value){
  showingRun=value;setup.hidden=value;run.hidden=!value;
}
function setField(id,v){if(v!==undefined&&v!==null)$(id).value=v;}
async function preferences(){
  try{
    const r=await message('PM_GET_PREFS');
    const p=r.prefs||{};
    setField('target',p.target||10);setField('prompt',p.prompt||'proceed methodically');
    setField('effort',p.effort||'High');setField('delay',p.delaySeconds||4);setField('loadTimeout',p.loadTimeoutSeconds||180);
    $('keepTabs').checked=p.keepTabs!==false;markPreset();
  }catch(e){inform(String(e.message||e));}
}
function markPreset(){
  document.querySelectorAll('[data-count]').forEach(b=>b.classList.toggle('chosen',Number(b.dataset.count)===Number($('target').value)));
}
function resultLabel(job){
  if(job.status==='scanning')return 'Scanning project';
  if(job.status==='running')return 'Dispatching prompts';
  if(job.status==='paused')return 'Paused — attention needed';
  if(job.status==='done')return 'Dispatch completed';
  if(job.status==='stopped')return 'Run stopped';
  return 'Run error';
}
function renderJob(job){
  latestJob=job;
  if(!job)return;
  const processed=job.completed+job.failed,total=job.total||job.target||0,ratio=job.total?processed/job.total:0;
  $('progress').textContent=processed;
  $('progressTotal').textContent='/ '+total;
  $('percentage').textContent=Math.floor(100*ratio)+'%';
  $('progressBar').style.width=(100*ratio)+'%';
  $('state').textContent=resultLabel(job);
  $('state').className='state '+(['done'].includes(job.status)?'done':['error','stopped'].includes(job.status)?'error':'');
  $('sent').textContent=job.completed||0;
  $('failed').textContent=job.failed||0;
  $('found').textContent=job.found||0;
  const current=job.current?.title?' · '+job.current.title:'';
  const pageWaiting=job.status==='running'&&job.current?.phase==='waiting';
  const elapsed=pageWaiting?Math.max(0,Math.floor((Date.now()-job.current.startedAt)/1000)):0;
  const msg=job.error||job.pauseReason||
    (job.status==='scanning'?'Discovered '+(job.found||0)+' conversations so far…':
    pageWaiting?'Waiting for '+(job.current.title||'conversation')+' to load ('+elapsed+'s / '+(job.config.loadTimeoutSeconds||180)+'s). No prompt has been sent yet.':
    job.status==='running'?'Working on chat '+Math.min((job.index||0)+1,job.total)+' of '+job.total+current:
    job.status==='done'?'Finished. Review the results before launching another run.':
    job.status==='stopped'?'Remaining conversations were not launched.':'Review recent activity.');
  $('runMessage').textContent=msg;
  $('pause').hidden=job.status!=='running';
  $('resume').hidden=job.status!=='paused';
  $('stop').hidden=!['scanning','running','paused'].includes(job.status);
  $('newRun').hidden=!['done','stopped','error'].includes(job.status);
  const activity=$('activity');activity.replaceChildren();
  const rows=(job.results||[]).slice(-18).reverse();
  if(!rows.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=job.status==='scanning'?'Discovering project conversations…':'No completed chat attempts yet.';activity.append(empty);}
  for(const row of rows){
    const wrapper=document.createElement('div');wrapper.className='activityRow';
    const line=document.createElement('div');line.className='rowtop';
    const title=document.createElement('span');title.className='title';title.textContent=row.title||'Conversation';
    const status=document.createElement('span');status.className='status'+(row.uncertain?' uncertain':row.ok?'':' failed');
    status.textContent=row.ok?'SENT':row.uncertain?'UNCONFIRMED':'SKIPPED / FAILED';
    line.append(title);
    if(/^https:\/\/chatgpt\.com\/g\/g-p-[a-zA-Z0-9-]+\/c\/[a-zA-Z0-9-]+\/?$/.test(row.url||'')){
      const open=document.createElement('a');
      open.className='openchat';open.href=row.url;
      open.target='_blank';open.rel='noopener noreferrer';open.textContent='Open ↗';
      open.title='Inspect this conversation in ChatGPT';
      line.append(open);
    }
    line.append(status);wrapper.append(line);
    if(row.error){const reason=document.createElement('div');reason.className='reason';reason.textContent=row.error;wrapper.append(reason);}
    activity.append(wrapper);
  }
}
async function refresh(){
  if(working)return;
  try{
    const r=await message('PM_GET_JOB');
    if(r.job&&!manualNew&&(!showingRun||['running','scanning','paused'].includes(r.job.status)))showRunMode(true);
    if(r.job&&showingRun)renderJob(r.job);
  }catch(e){if(showingRun)inform(String(e.message||e));}
}
async function change(type){
  working=true;
  try{await message(type);inform('');await refreshJobNow();}
  catch(e){inform(String(e.message||e));}
  finally{working=false;}
}
async function refreshJobNow(){
  const r=await message('PM_GET_JOB');if(r.job){showRunMode(true);renderJob(r.job);}
}
$('launchForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!projectTabId||working)return;
  const config={
    target:Number($('target').value),prompt:$('prompt').value.trim(),effort:$('effort').value,
    delaySeconds:Number($('delay').value),loadTimeoutSeconds:Number($('loadTimeout').value),keepTabs:$('keepTabs').checked
  };
  if(!Number.isInteger(config.target)||config.target<1||config.target>1000){inform('Choose 1–1,000 conversations.');return;}
  if(!config.prompt||config.prompt.length>16000){inform('Enter a prompt of 1–16,000 characters.');return;}
  working=true;launchButton.disabled=true;inform('');
  try{await message('PM_START',{tabId:projectTabId,config});manualNew=false;showRunMode(true);await refreshJobNow();}
  catch(err){inform(String(err.message||err));await refreshJobNow().catch(()=>{});}
  finally{working=false;launchButton.disabled=projectTabId===null;}
});
$('reconnect').addEventListener('click',()=>void inspect());
$('pause').addEventListener('click',()=>void change('PM_PAUSE'));
$('resume').addEventListener('click',()=>void change('PM_RESUME'));
$('stop').addEventListener('click',()=>void change('PM_STOP'));
$('newRun').addEventListener('click',()=>{manualNew=true;showRunMode(false);inform('');});
$('target').addEventListener('input',markPreset);
document.querySelectorAll('[data-count]').forEach(b=>b.addEventListener('click',()=>{$('target').value=b.dataset.count;markPreset();}));
$('export').addEventListener('click',()=>{
  if(!latestJob)return;
  const json=JSON.stringify({exportedAt:new Date().toISOString(),...latestJob},null,2);
  const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='PM-run-'+(latestJob.id||'results')+'.json';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
});
void(async()=>{await Promise.all([preferences(),inspect()]);await refresh();})();
setInterval(()=>void refresh(),1200);
