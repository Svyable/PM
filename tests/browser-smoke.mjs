/**
 * PM real-Chromium smoke, with a synthetic ChatGPT-compatible DOM.
 * NO real ChatGPT login or network calls. Run under xvfb with an unpacked
 * MV3 extension to exercise browser content scripts + worker + actual clicks.
 */
import assert from 'node:assert/strict';
import {mkdtemp,rm,cp,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const projectId='g-p-browserfixture';
let projectUrl;
const existingId='thread-one';
let existingUrl;
const fixtureHtml=String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>PM ChatGPT fixture</title>
<style>
body{font-family:system-ui;background:#101218;color:#eee;padding:32px}
main{max-width:800px;margin:auto}
form{background:#252832;border-radius:20px;padding:20px}
[contenteditable]{background:#1b1d23;min-height:64px;border:1px solid #4b536b;outline:0;padding:12px}
button{border-radius:8px;padding:10px;cursor:pointer}
li{padding:10px}
</style></head>
<body><main><h1>PM Browser Project</h1>
<form id="composer-form">
<div contenteditable="true" class="ProseMirror" role="textbox"
 data-composer-markdown="" aria-label="Ask ChatGPT"><p></p></div>
<button type="button" id="effort-trigger" data-selected-reasoning-effort="Medium">
<span class="ModelPickerTriggerModelGroup">Medium</span></button>
<div id="effort-menu" hidden>
<button type="button" role="menuitem" data-effort="Instant">Instant</button>
<button type="button" role="menuitem" data-effort="Medium">Medium</button>
<button type="button" role="menuitem" data-effort="High">High</button>
<button type="button" role="menuitem" data-effort="Extra High">Extra High</button>
</div>
<button type="submit" data-testid="send-button" aria-label="Send prompt">Send</button>
</form>
<div id="messages"></div>
<ul id="project-conversations">
<li class="group/project-chat"><a href="/g/g-p-browserfixture/c/thread-one">
<span class="font-medium">Existing fixture conversation</span></a></li>
</ul></main>
<script>
const form=document.getElementById('composer-form');
const editor=form.querySelector('[contenteditable]');
window.__pmFixture={submissions:0};
const effortTrigger=document.getElementById('effort-trigger');
const effortMenu=document.getElementById('effort-menu');
effortTrigger.addEventListener('click',()=>{effortMenu.hidden=!effortMenu.hidden;});
effortMenu.addEventListener('click',event=>{
  const option=event.target.closest('[data-effort]');
  if(!option)return;
  effortTrigger.setAttribute('data-selected-reasoning-effort',option.dataset.effort);
  effortTrigger.querySelector('.ModelPickerTriggerModelGroup').textContent=option.dataset.effort;
  effortMenu.hidden=true;
});
form.addEventListener('submit',event=>{
  event.preventDefault();
  const prompt=editor.innerText.trim();
  if(!prompt)return;
  window.__pmFixture.submissions++;
  if(location.pathname.endsWith('/project')){
    history.pushState({},'', '/g/g-p-browserfixture/c/seeded-fixture-'+window.__pmFixture.submissions);
  }
  const turn=document.createElement('div');
  turn.setAttribute('data-message-author-role','user');
  turn.setAttribute('data-message-id','fixture-'+window.__pmFixture.submissions);
  turn.className='user-turn';turn.textContent=prompt;
  document.getElementById('messages').append(turn);
  editor.replaceChildren(document.createElement('p'));
});
</script></body></html>`;

// Chromium's extension-created background tabs can bypass Playwright route
// interception. Serve the fixture from 127.0.0.1 and rewrite ONLY the
// origin in a temporary test copy; production extension files are untouched.
const root=resolve('extension');
const profile=await mkdtemp(resolve(tmpdir(),'pm-browser-smoke-'));
const server=createServer((req,res)=>{
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  res.end(fixtureHtml);
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const port=server.address().port,origin='http://127.0.0.1:'+port;
projectUrl=origin+'/g/'+projectId+'/project';
existingUrl=origin+'/g/'+projectId+'/c/'+existingId;
const unpacked=resolve(profile,'test-extension');
await cp(root,unpacked,{recursive:true});
const regexFrom=String.raw`https:\/\/chatgpt\.com`;
const regexTo=String.raw`http:\/\/127\.0\.0\.1:`+port;
for(const file of ['background.js','content.js','project-panel.js','popup.js','panel.js']){
  const full=resolve(unpacked,file);
  let code=await readFile(full,'utf8');
  code=code.replaceAll('https://chatgpt.com/*','http://127.0.0.1/*')
    .replaceAll('https://chatgpt.com',origin)
    .replaceAll(regexFrom,regexTo);
  await writeFile(full,code);
}
const manifestFile=resolve(unpacked,'manifest.json');
const manifest=JSON.parse(await readFile(manifestFile,'utf8'));
assert.equal(manifest.version,'0.13.0','browser smoke must test the versioned Project OS installer source');
manifest.host_permissions=['http://127.0.0.1/*'];
for(const script of manifest.content_scripts)script.matches=['http://127.0.0.1/*'];
await writeFile(manifestFile,JSON.stringify(manifest));
let context;
try{
  context=await chromium.launchPersistentContext(profile,{
    headless:false,viewport:{width:1320,height:920},
    args:['--no-sandbox','--disable-extensions-except='+unpacked,'--load-extension='+unpacked]
  });
  let worker=context.serviceWorkers()[0];
  if(!worker)worker=await context.waitForEvent('serviceworker',{timeout:20000});
  const extensionId=new URL(worker.url()).hostname;
  assert.ok(extensionId,'Extension service worker must be registered');

  context.on('page',p=>{
    p.on('pageerror',e=>console.error('Page script error:',p.url(),String(e)));
  });
  worker.on('console',m=>{if(m.type()==='error')console.error('Extension worker error:',m.text());});
  const projectPage=await context.newPage();
  await projectPage.goto(projectUrl,{waitUntil:'domcontentloaded'});
  const extensionPage=await context.newPage();
  await extensionPage.goto('chrome-extension://'+extensionId+'/panel.html',{waitUntil:'domcontentloaded'});
  const projectTabId=await extensionPage.evaluate(async(url)=>{
    const tabs=await chrome.tabs.query({});
    return tabs.find(t=>t.url===url)?.id??null;
  },projectUrl);
  assert.ok(Number.isInteger(projectTabId),'Chrome extension sees Project overview tab');

  async function send(type,payload={}){
    return extensionPage.evaluate(async({type,payload})=>{
      return await chrome.runtime.sendMessage({type,...payload});
    },{type,payload});
  }
  async function waitDone(label,timeout=30000){
    const start=Date.now();
    while(Date.now()-start<timeout){
      const state=await send('PM_GET_JOB');
      if(state.job?.status==='done')return state.job;
      if(['error','paused','stopped'].includes(state.job?.status))
        throw Error(label+' halted: '+JSON.stringify({
          status:state.job.status,error:state.job.error,pauseReason:state.job.pauseReason,
          current:state.job.current,results:state.job.results
        }));
      await new Promise(r=>setTimeout(r,220));
    }
    const state=await send('PM_GET_JOB');
    console.error('PM browser smoke timeout:',label,JSON.stringify({
      status:state.job?.status,current:state.job?.current,found:state.job?.found,
      total:state.job?.total,scanComplete:state.job?.scanComplete,
      results:state.job?.results,error:state.job?.error,
      pauseReason:state.job?.pauseReason
    }));
    console.error('Tabs:',JSON.stringify(await extensionPage.evaluate(async()=>{
      return (await chrome.tabs.query({})).map(t=>({id:t.id,url:t.url,status:t.status,discarded:t.discarded}));
    })));
    for(const page of context.pages()){
      console.error('Page:',page.url(),JSON.stringify(await page.evaluate(()=>{
        const composer=document.querySelector('.ProseMirror');
        return{prompt:composer?.innerText,sendDisabled:document.querySelector('[data-testid="send-button"]')?.disabled,
          messages:[...document.querySelectorAll('[data-message-author-role="user"]')].map(x=>x.innerText)};
      }).catch(e=>String(e))));
    }
    throw Error('Timed out waiting for '+label);
  }

  const health=await send('PM_GET_HEALTH',{tabId:projectTabId});
  assert.equal(health.composerReady,true,'real browser recognizes Project composer');
  assert.equal(health.effort,'Medium','live effort picker is observed before dispatch');

  // Exercise Project OS through the real side-panel DOM, not only worker calls.
  await extensionPage.locator('#pmMission:not([disabled])').waitFor({timeout:15000});
  await extensionPage.locator('#pmMission').fill('Investigate reproducible project execution.');
  await extensionPage.locator('#pmObjective').fill('Publish a checked implementation.');
  await extensionPage.locator('#pmNextAction').fill('Review launch blocker tests.');
  await extensionPage.locator('#pmBriefForm button[type="submit"]').click();
  await extensionPage.waitForFunction(()=>
    document.getElementById('pmBriefStatus')?.textContent==='Saved',{timeout:12000});
  const brief=await send('PM_BOARD_GET',{tabId:projectTabId});
  assert.equal(brief.board.mission,'Investigate reproducible project execution.');
  assert.equal(brief.board.objective,'Publish a checked implementation.');
  await extensionPage.locator('#pmTaskTitle').fill('Approve Project OS release');
  await extensionPage.locator('#pmTaskNotes').fill('Verify roles and changed files.');
  await extensionPage.locator('#pmTaskPriority').selectOption('high');
  await extensionPage.locator('#pmIsMilestone').check();
  await extensionPage.locator('#pmTaskChat').selectOption('thread-one');
  await extensionPage.locator('#pmTaskForm button[type="submit"]').click();
  await extensionPage.waitForFunction(()=>document.querySelectorAll('.pmWorkCard').length===0||
    document.querySelectorAll('.pmWorkCard').length>=1);
  const withTask=await send('PM_BOARD_GET',{tabId:projectTabId});
  assert.equal(withTask.board.tasks.length,1,'UI persists a milestone task');
  assert.equal(withTask.board.tasks[0].chatId,'thread-one');
  assert.equal(withTask.board.tasks[0].milestone,true);
  await extensionPage.locator('#pmSelectVisible').click();
  await extensionPage.locator('#pmBulkStatus').selectOption('working');
  await extensionPage.locator('#pmApplyBulkStatus').click();
  await extensionPage.waitForFunction(()=>document.getElementById('pmBoardNotice')?.textContent?.includes('Saved locally'));
  const annotated=await send('PM_BOARD_GET',{tabId:projectTabId});
  assert.equal(annotated.board.threads[existingId].status,'working');

  const existing=await send('PM_START',{tabId:projectTabId,config:{
    mode:'existing',target:1,newCount:0,prompt:'PM browser smoke: continue existing.',
    effort:'High',delaySeconds:2,loadTimeoutSeconds:30,keepTabs:true
  }});
  assert.equal(existing.ok,true,JSON.stringify(existing));
  const continued=await waitDone('existing chat send');
  assert.equal(continued.completed,1);
  assert.equal(continued.results.length,1);
  assert.equal(continued.results[0].ok,true);
  assert.equal(continued.results[0].id,existingId);
  const existingPages=context.pages().filter(p=>p.url()===existingUrl);
  assert.ok(existingPages.length>0,'existing conversation opened in browser');
  const sent=await existingPages.at(-1).locator('[data-message-author-role="user"]').allTextContents();
  assert.deepEqual(sent,['PM browser smoke: continue existing.']);
  assert.equal(await existingPages.at(-1).locator('#effort-trigger').getAttribute('data-selected-reasoning-effort'),
    'High','PM actually selects High in the live Chromium picker');

  const seeded=await send('PM_START',{tabId:projectTabId,config:{
    mode:'fleet-start',target:1,newCount:1,fleetTemplate:'brainswarm',
    mission:'Research a safe and reproducible browser extension quality process.',
    prompt:'proceed methodically',effort:'High',delaySeconds:2,
    loadTimeoutSeconds:30,keepTabs:true
  }});
  assert.equal(seeded.ok,true,JSON.stringify(seeded));
  const fleet=await waitDone('fleet new chat send');
  assert.equal(fleet.completed,1);
  assert.equal(fleet.results[0].ok,true);
  assert.equal(fleet.results[0].kind,'new');
  assert.equal(fleet.results[0].id,'seeded-fixture-1');
  const fleetInfo=await send('PM_GET_FLEET',{tabId:projectTabId});
  assert.equal(fleetInfo.fleet.threads.length,1);
  assert.equal(fleetInfo.fleet.threads[0].roleName,'Systems Architect');

  // Convert the verified specialist fleet into human-review tasks, without
  // inventing conversation IDs or reading sibling thread content.
  await extensionPage.locator('#pmSeedFleetTasks:enabled').waitFor({timeout:25000});
  extensionPage.once('dialog',dialog=>dialog.accept());
  await extensionPage.locator('#pmSeedFleetTasks').click();
  await extensionPage.waitForFunction(()=>
    !![...document.querySelectorAll('.pmWorkCard')].find(el=>
      el.textContent.includes('Review Systems Architect findings')),null,{timeout:10000});
  const planned=await send('PM_BOARD_GET',{tabId:projectTabId});
  assert.equal(planned.board.tasks.length,2);
  assert.equal(planned.board.tasks.filter(t=>t.chatId==='seeded-fixture-1').length,1);
  assert.equal(planned.board.mission,'Investigate reproducible project execution.',
    'fleet plan does not overwrite an existing Project brief');

  // Dispatch only the selected existing chat from the Project OS control.
  await extensionPage.locator('#pmDispatchSelected').click();
  await extensionPage.locator('#prompt').fill('PM browser smoke: selected project workstream.');
  await extensionPage.locator('#launch').click();
  // A previous fleet run can still be the current completed job while the
  // PM panel asynchronously starts the selected-run request.
  await extensionPage.waitForFunction(async()=>{
    const state=await chrome.runtime.sendMessage({type:'PM_GET_JOB'});
    return state.job?.config?.mode==='selected';
  },null,{timeout:12000});
  const targeted=await waitDone('Project OS selective dispatch');
  assert.equal(targeted.completed,1);
  assert.equal(targeted.config.mode,'selected');
  assert.equal(targeted.results[0].queueId,existingId);
  const selectedChat=context.pages().find(p=>p.url()===existingUrl&&p!==existingPages.at(-1));
  assert.ok(selectedChat,'selected workstream was opened separately');
  assert.equal((await selectedChat.locator('[data-message-author-role="user"]').allTextContents())[0],
    'PM browser smoke: selected project workstream.');
  const historyData=await send('PM_HISTORY_GET',{tabId:projectTabId});
  assert.ok(historyData.runs.length>=3,'Project OS records completed runs locally');

  console.log('PM Chromium smoke PASSED: Project OS mission, milestone, workstream status and targeted dispatch.');
  console.log('PM Chromium smoke PASSED: Project health, High picker, ProseMirror edit, exactly one Send click,');
  console.log('verified existing thread + new role-specific Project chat + locally saved fleet ledger.');
}finally{
  await context?.close();
  await new Promise(done=>server.close(done));
  await rm(profile,{recursive:true,force:true});
}
