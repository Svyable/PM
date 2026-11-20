/* PM 0.11 — popup controls and status. No external dependencies. */
'use strict';
const $=id=>document.getElementById(id);
const setup=$('setup'),run=$('run'),notice=$('notice'),launchButton=$('launch');
const panelMode=document.body.dataset.pmMode==='panel';
const hostTabId=panelMode?Number(new URLSearchParams(location.search).get('pmTabId')):null;
let projectTabId=null,activeProjectId=null,latestJob=null,showingRun=false,working=false,manualNew=false;
let fleetDetails=null,lastMode='existing';
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
  launchButton.disabled=!ok || (latestJob&&['scanning','running','paused'].includes(latestJob.status));
}
async function inspect(){
  try{
    const context=await message('PM_FIND_PROJECT',{
      preferredTabId:projectTabId||(Number.isInteger(hostTabId)?hostTabId:null)
    });
    if(!context.tabId||!context.projectId){
      projectTabId=null;activeProjectId=null;
      statusConnection(false,'Open a ChatGPT Project overview');
      return;
    }
    const switched=projectTabId!==context.tabId||activeProjectId!==context.projectId;
    const oldProjectId=activeProjectId;
    projectTabId=context.tabId;activeProjectId=context.projectId;
    statusConnection(true,'Project connected automatically');
    if(switched){
      if(oldProjectId&&oldProjectId!==context.projectId)$('mission').value='';
      fleetDetails=null;inform('');void fetchFleet();
    }
  }catch(e){
    // Project detection is self-healing. Recheck automatically rather than
    // requiring a user-triggered Reconnect to recover from a transient error.
    statusConnection(false,'Looking for a Project…');
  }
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
    setField('fleetTemplate',p.fleetTemplate||'brainswarm');
    // A mission belongs to its Project, not to a global preference. Do not
    // carry a previous Project's mission into the next one automatically.
    setField('mission','');lastMode=p.mode||'existing';
    setField('effort',p.effort||'High');setField('delay',p.delaySeconds||4);setField('loadTimeout',p.loadTimeoutSeconds||180);
    $('keepTabs').checked=p.keepTabs!==false;markPreset();updateMode();
  }catch(e){inform(String(e.message||e));}
}
function markPreset(){
  document.querySelectorAll('[data-count]').forEach(b=>b.classList.toggle('chosen',Number(b.dataset.count)===Number($('target').value)));
}
async function fetchFleet(){
  if(!projectTabId)return;
  try{
    const project=activeProjectId;
    const r=await message('PM_GET_FLEET',{tabId:projectTabId});
    if(project!==activeProjectId)return;
    fleetDetails=r.fleet||null;
    updateMode();
  }catch{fleetDetails=null;updateMode();}
}
function updateFleetPreview(){
  const preview=$('fleetPreview');
  if(!preview)return;
  const choice=$('fleetTemplate').value;
  const template=globalThis.PMFleet?.get(choice);
  preview.replaceChildren();
  if(!template)return;
  const count=Math.max(1,Math.min(Number($('target').value)||6,1000));
  const listed=globalThis.PMFleet.list().find(t=>t.id===choice);
  const names=listed?.roles||[];
  const header=document.createElement('p');
  header.className='smallnote';
  header.textContent=Number($('target').value)>names.length
    ?names.length+' distinct roles across '+Math.ceil(count/names.length)+' independent tracks.'
    :count+' distinct role assignments. Each receives a different prompt.';
  preview.append(header);
  for(let i=0;i<Math.min(count,12);i++){
    const role=names[i%names.length];
    if(!role)break;
    const chip=document.createElement('span');
    chip.className='fleetRole';
    chip.textContent=(i+1)+'. '+role.name+(i>=names.length?' · Track '+(Math.floor(i/names.length)+1):'');
    preview.append(chip);
  }
  if(count>12){
    const more=document.createElement('span');more.className='fleetMore';
    more.textContent='+'+(count-12)+' additional independent tracks';preview.append(more);
  }
}
function updateMode(){
  const mode=$('mode').value,total=Number($('target').value)||1;
  const fleetMode=mode==='fleet-start'||mode==='fleet-continue';
  $('fleetSetup').hidden=!fleetMode;
  $('singlePromptBlock').hidden=fleetMode;
  $('prompt').required=!fleetMode;
  $('mission').required=mode==='fleet-start';
  if(mode==='fleet-continue'&&fleetDetails){
    $('fleetTemplate').value=fleetDetails.templateId;
    if(!$('mission').value.trim())$('mission').value=fleetDetails.mission||'';
  }
  $('fleetTemplate').disabled=mode==='fleet-continue'&&!!fleetDetails;
  $('launch').textContent=mode==='fleet-start'?'✳ Seed project fleet':
    mode==='fleet-continue'?'↻ Continue project fleet':'↗ Launch PM';
  if(fleetMode){
    const status=$('fleetStatus');
    if(mode==='fleet-continue'){
      status.textContent=fleetDetails
        ?'Linked '+fleetDetails.threads.length+' workstreams · '+(fleetDetails.cycle||0)+' continuation cycles. Threads retain their assigned roles.'
        :'No fleet linked to this Project yet. Choose Seed a project fleet first.';
    }else{
      status.textContent=fleetDetails?.threads?.length
        ?'This Project already has a saved fleet. Choose Continue fleet instead.'
        :'Each role receives its own assignment. PM records the resulting chat links for future continuation.';
    }
    updateFleetPreview();
  }
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
    :mode==='fleet-start'?'Describe one mission. PM creates independent, role-specific conversations in the current Project.'
    :mode==='fleet-continue'?'PM returns to the chats created by this template, keeping each original role.'
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
    pageWaiting?(job.current?.waitError?job.current.waitError+' ':'Preparing '+(job.current?.title||'conversation')+'. ')+
      'Waiting '+elapsed+'s / '+(job.config.loadTimeoutSeconds||180)+'s. No prompt sent yet.':
    job.status==='running'&&job.current?.phase==='sending'
      ?(job.current.stage==='injected'?'Prompt injected. Finding the Send control':
        job.current.stage==='preparing'?'Preparing composer':
        job.current.stage==='submitting'?'Submission gesture in progress':
        job.current.stage==='verifying'?'Submission attempted. Verifying new user message':
        'Preparing submission')+current+(job.current.stageDetail?' · '+job.current.stageDetail:'')+'…':
    job.status==='running'&&!job.current?'Discovered '+job.found+' chats. Waiting for more project rows or dispatch spacing…':
    job.status==='running'?'Working on chat '+Math.min((job.index||0)+1,job.target)+' of '+job.target+current:
    job.status==='done'?(job.config.mode==='fleet-start'?'Fleet seeded: '+job.completed+' verified specialist threads. Use Continue fleet next.':
      job.config.mode==='fleet-continue'?'Fleet continuation complete: '+job.completed+' workstreams advanced.':
      'Finished. Review verified sends and uncertain attempts.'):
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
      timing.textContent='Page ready: '+(row.readyWaitMs/1000).toFixed(1)+'s · Verification: '+((row.confirmationWaitMs||0)/1000).toFixed(1)+'s'+
        (row.routeRepairs?' · Recovered route '+row.routeRepairs+'×':'');
      wrapper.append(timing);
    }
    activity.append(wrapper);
  }
}
async function refresh(){
  if(working)return;
  try{
    const r=await message('PM_GET_JOB');
    const relevant=r.job&&r.job.projectId===activeProjectId;
    if(relevant&&!manualNew&&(!showingRun||['running','scanning','paused'].includes(r.job.status)))showRunMode(true);
    if(relevant&&showingRun)renderJob(r.job);
    if(!relevant&&panelMode){showRunMode(false);latestJob=null;}
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
    newCount:Number($('newCount').value),prompt:$('prompt').value.trim(),
    mission:$('mission').value.trim(),fleetTemplate:$('fleetTemplate').value,effort:$('effort').value,
    delaySeconds:Number($('delay').value),loadTimeoutSeconds:Number($('loadTimeout').value),keepTabs:$('keepTabs').checked
  };
  if(!Number.isInteger(config.target)||config.target<1||config.target>1000){inform('Choose 1–1,000 conversations.');return;}
  if(!config.mode.startsWith('fleet-')&&(!config.prompt||config.prompt.length>16000)){inform('Enter a prompt of 1–16,000 characters.');return;}
  if(config.mode==='fleet-start'&&(!config.mission||config.mission.length>4000)){inform('Enter a Project mission (up to 4,000 characters).');return;}
  if(config.mode==='fleet-continue'&&!fleetDetails?.threads?.length){inform('This Project has no saved PM fleet. Seed a fleet first.');return;}
  if(config.mode==='fleet-start'&&fleetDetails?.threads?.length){inform('A fleet already exists here. Choose Continue fleet or create another Project.');return;}
  if(config.mode==='mixed'&&(config.target<2||config.newCount<1||config.newCount>=config.target)){
    inform('Mixed mode needs at least one existing and one new conversation.');return;
  }
  working=true;launchButton.disabled=true;inform('');
  try{await message('PM_START',{tabId:projectTabId,config});manualNew=false;showRunMode(true);await refreshJobNow();}
  catch(err){inform(String(err.message||err));await refreshJobNow().catch(()=>{});}
  finally{working=false;launchButton.disabled=!projectTabId||!!(latestJob&&['scanning','running','paused'].includes(latestJob.status));}
});
// Project detection runs automatically; no Reconnect button or manual ritual.
$('pause').addEventListener('click',()=>void change('PM_PAUSE'));
$('resume').addEventListener('click',()=>void change('PM_RESUME'));
$('stop').addEventListener('click',()=>void change('PM_STOP'));
$('newRun').addEventListener('click',()=>{manualNew=true;showRunMode(false);inform('');});
$('target').addEventListener('input',()=>{markPreset();updateMode();});
$('mode').addEventListener('change',()=>{
  if($('mode').value==='fleet-start'&&!lastMode.startsWith('fleet-'))$('target').value=6;
  if($('mode').value==='fleet-continue'&&fleetDetails?.threads?.length)$('target').value=fleetDetails.threads.length;
  lastMode=$('mode').value;
  updateMode();
  if($('mode').value.startsWith('fleet-'))void fetchFleet();
});
$('fleetTemplate').addEventListener('change',updateMode);
$('mission').addEventListener('input',()=>{if($('mode').value.startsWith('fleet-'))updateFleetPreview();});
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
setInterval(()=>void refresh(),1500);
setInterval(()=>void inspect(),3000);
setInterval(()=>{
  if($('mode').value.startsWith('fleet-')&&projectTabId)void fetchFleet();
},15000);
