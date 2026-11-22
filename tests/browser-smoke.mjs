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

  const existing=await send('PM_START',{tabId:projectTabId,config:{
    mode:'existing',target:1,newCount:0,prompt:'PM browser smoke: continue existing.',
    effort:'Keep current',delaySeconds:2,loadTimeoutSeconds:30,keepTabs:true
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

  const seeded=await send('PM_START',{tabId:projectTabId,config:{
    mode:'fleet-start',target:1,newCount:1,fleetTemplate:'brainswarm',
    mission:'Research a safe and reproducible browser extension quality process.',
    prompt:'proceed methodically',effort:'Keep current',delaySeconds:2,
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

  console.log('PM Chromium smoke PASSED: Project health, real ProseMirror edit, exactly one Send click,');
  console.log('verified existing thread + new role-specific Project chat + locally saved fleet ledger.');
}finally{
  await context?.close();
  await new Promise(done=>server.close(done));
  await rm(profile,{recursive:true,force:true});
}
