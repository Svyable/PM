/* PM 0.9 — popup controls and status. No external dependencies. */
'use strict';
const $=id=>document.getElementById(id);
const setup=$('setup'),run=$('run'),notice=$('notice'),launchButton=$('launch');
const panelMode=document.body.dataset.pmMode==='panel';
const hostTabId=panelMode?Number(new URLSearchParams(location.search).get('pmTabId')):null;
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
    const tab=panelMode&&Number.isInteger(hostTabId)&&hostTabId>0
      ?await chrome.tabs.get(hostTabId)
      :(await chrome.tabs.query({active:true,currentWindow:true}))[0];
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
  showingRun=value;setup.hidden=panelMode?false:value;run.hidden=!value;
}
function setField(id,v){if(v!==undefined&&v!==null)$(id).value=v;}
async function preferences(){
  try{
    const r=await message('PM_GET_PREFS');
    const p=r.prefs||{};
    setField('target',p.target||10);setField('prompt',p.prompt||'proceed methodically');
    setField('mode',p.mode||'existing');setField('newCount',p.newCount||1);
    setField('effort',p.effort||'High');setField('delay',p.delaySeconds||4);setField('loadTimeout',p.loadTimeoutSeconds||180);
    $('keepTabs').checked=p.keepTabs!==false;markPreset();updateMode();
  }catch(e){inform(String(e.message||e));}
}
function markPreset(){
  document.querySelectorAll('[data-count]').forEach(b=>b.classList.toggle('chosen',Number(b.dataset.count)===Number($('target').value)));
}
function updateMode(){
  const mode=$('mode').value,total=Number($('target').value)||1;
  const mixed=mode==='mixed';
  $('splitRow').hidden=!mixed;
  $('newCount').required=mixed;
  $('newCount').max=Math.max(1,total-1);
  if(mixed){
    const requested=Number($('newCount').value)||1;
    if(total>=2)$('newCount').value=Math.min(Math.max(1,requested),total-1);
    const news=Number($('newCount').value)||1;
    $('splitSummary').textContent=total<2?'Mixed mode needs 2 or more conversations.':
      (total-news)+' existing + '+news+' new';
  }
  $('modeHelp').textContent=mode==='new'
    ?'Each new conversation starts in this Project with the instruction as its first message.'
    :mixed?'Continue existing chats first, then create the selected number of new Project chats.'
    :'Send the instruction to conversations already in this Project.';
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
  if(panelMode){launchButton.disabled=['scanning','running','paused'].includes(job.status)||!projectTabId;}
  $('state').className='state '+(['done'].includes(job.status)?'done':['error','stopped'].includes(job.status)?'error':'');
  $('sent').textContent=job.completed||0;
  $('failed').textContent=job.failed||0;
  $('found').textContent=job.found||0;
  const current=job.current?.title?' · '+job.current.title:'';
  const pageWaiting=job.status==='running'&&job.current?.phase==='waiting';
  const elapsed=pageWaiting?Math.max(0,Math.floor((Date.now()-job.current.startedAt)/1000)):0;
  const msg=job.error||job.pauseReason||
    (job.status==='scanning'?'Finding '+(job.existingTarget||job.target)+' existing conversations… '+(job.found||0)+' found.':
    pageWaiting?'Preparing '+(job.current?.title||'conversation')+' ('+elapsed+'s / '+(job.config.loadTimeoutSeconds||180)+'s). No prompt sent yet.':
    job.status==='running'&&job.current?.phase==='sending'?'Prompt submitted for verification'+current+'…':
    job.status==='running'&&!job.current?'Discovered '+job.found+' chats. Waiting for more project rows or dispatch spacing…':
    job.status==='running'?'Working on chat '+Math.min((job.index||0)+1,job.target)+' of '+job.target+current:
    job.status==='done'?'Finished. Review verified sends and uncertain attempts.':
    job.status==='stopped'?'Remaining conversations were not launched.':'Review recent activity.');
  $('runMessage').textContent=msg;
  $('pause').hidden=job.status!=='running';
  $('resume').hidden=job.status!=='paused';
  $('stop').hidden=!['scanning','running','paused'].includes(job.status);
  $('newRun').hidden=!['done','stopped','error'].includes(job.status);
  const activity=$('activity');activity.replaceChildren();
  const rows=(job.results||[]).slice(-18).reverse();
  if(!rows.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=job.status==='scanning'?'Scanning the project list…':job.current?.phase==='waiting'?'Waiting for '+(job.current.title||'the first chat')+' to become ready. No Send attempt yet.':job.current?.phase==='sending'?'Verifying the current chat. No result recorded yet.':'No sends recorded yet. See LIVE DISPATCH above for the current stage.';activity.append(empty);}
  for(const row of rows){
    const wrapper=document.createElement('div');wrapper.className='activityRow';
    const line=document.createElement('div');line.className='rowtop';
    const title=document.createElement('span');title.className='title';title.textContent=(row.kind==='new'?'New · ':'Continue · ')+(row.title||'Conversation');
    const status=document.createElement('span');status.className='status'+(row.uncertain?' uncertain':row.ok?'':' failed');
    status.textContent=row.ok?(row.kind==='new'?'CREATED + SENT':'SENT'):row.uncertain?'UNCONFIRMED':'SKIPPED / FAILED';
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
    if(Number.isFinite(row.readyWaitMs)){
      const timing=document.createElement('div');timing.className='reason';
      timing.textContent='Page ready: '+(row.readyWaitMs/1000).toFixed(1)+'s · Verification: '+((row.confirmationWaitMs||0)/1000).toFixed(1)+'s';
      wrapper.append(timing);
    }
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
    target:Number($('target').value),mode:$('mode').value,
    newCount:Number($('newCount').value),prompt:$('prompt').value.trim(),effort:$('effort').value,
    delaySeconds:Number($('delay').value),loadTimeoutSeconds:Number($('loadTimeout').value),keepTabs:$('keepTabs').checked
  };
  if(!Number.isInteger(config.target)||config.target<1||config.target>1000){inform('Choose 1–1,000 conversations.');return;}
  if(!config.prompt||config.prompt.length>16000){inform('Enter a prompt of 1–16,000 characters.');return;}
  if(config.mode==='mixed'&&(config.target<2||config.newCount<1||config.newCount>=config.target)){
    inform('Mixed mode needs at least one existing and one new conversation.');return;
  }
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
$('target').addEventListener('input',()=>{markPreset();updateMode();});
$('mode').addEventListener('change',updateMode);
$('newCount').addEventListener('input',updateMode);
document.querySelectorAll('[data-count]').forEach(b=>b.addEventListener('click',()=>{$('target').value=b.dataset.count;markPreset();updateMode();}));
$('export').addEventListener('click',()=>{
  if(!latestJob)return;
  const json=JSON.stringify({exportedAt:new Date().toISOString(),...latestJob},null,2);
  const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='PM-run-'+(latestJob.id||'results')+'.json';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
});
void(async()=>{await Promise.all([preferences(),inspect()]);await refresh();})();
setInterval(()=>void refresh(),1200);
