/* PM v0.7 — Persistent project dashboard shell (no composer changes). */
(() => {
  'use strict';
  if(globalThis.__PM_PROJECT_PANEL__)return;
  globalThis.__PM_PROJECT_PANEL__=true;
  const PROJECT=/^\/g\/(g-p-[a-zA-Z0-9-]+)\/project\/?$/;
  const HOST_ID='pm-project-command-center';
  let host=null,globalStyle=null,mounting=false,collapsed=false,lastPid=null;
  function matches(){return location.pathname.match(PROJECT)?.[1]||null;}
  function detach(){
    host?.remove();host=null;
    document.documentElement.classList.remove('pm-command-center-docked');
    globalStyle?.remove();globalStyle=null;lastPid=null;
  }
  function reserveSpace(){
    if(globalStyle)return;
    globalStyle=document.createElement('style');
    globalStyle.textContent='@media (min-width:1320px){html.pm-command-center-docked body {width:calc(100% - 354px)!important;max-width:calc(100% - 354px)!important;box-sizing:border-box!important}}';
    (document.head||document.documentElement).append(globalStyle);
    document.documentElement.classList.add('pm-command-center-docked');
  }
  async function mount(pid){
    if(host?.isConnected&&lastPid===pid)return;
    if(mounting)return;
    mounting=true;
    try{
      const response=await chrome.runtime.sendMessage({type:'PM_HOST_CONTEXT'});
      if(!response?.ok||response.projectId!==pid||!matches())return;
      detach();
      host=document.createElement('div');
      host.id=HOST_ID;
      host.setAttribute('data-pm-extension','project-dashboard');
      const shadow=host.attachShadow({mode:'open'});
      const style=document.createElement('style');
      style.textContent=[
        ':host{all:initial;position:fixed;z-index:2147483000;top:82px;right:10px;bottom:12px;width:344px;max-height:calc(100vh - 94px);pointer-events:none;font-family:Inter,system-ui,-apple-system,sans-serif}',
        '.shell{height:100%;width:100%;display:flex;position:relative;pointer-events:auto;background:#090c15;border:1px solid #3a4261;border-radius:16px;box-shadow:0 24px 80px #0009,0 0 0 1px #909aff14;overflow:visible}',
        'iframe{width:100%;height:100%;border:0;border-radius:16px;background:#090c15;color-scheme:dark;display:block}',
        '.toggle{position:absolute;z-index:3;top:14px;left:-32px;width:32px;height:56px;border:1px solid #545c83;border-right:0;color:#d5deff;background:#151b2d;border-radius:10px 0 0 10px;font-size:12px;font-weight:800;cursor:pointer;box-shadow:-5px 8px 17px #0007}',
        '.toggle:focus-visible{outline:2px solid #b0baff;outline-offset:3px}',
        '.shell.closed{width:0;border:0;background:transparent;box-shadow:none}',
        '.shell.closed iframe{display:none}',
        '.shell.closed .toggle{left:-35px;background:#2a2b5d;color:white}',
        '@media(max-width:1319px){:host{right:8px;width:335px}}',
        '@media(max-width:690px){:host{top:64px;bottom:10px;max-height:calc(100vh - 76px);width:min(340px,calc(100vw - 42px))}}'
      ].join('');
      const shell=document.createElement('div');shell.className='shell';
      const button=document.createElement('button');
      button.type='button';button.className='toggle';
      button.title='Collapse PM command center';
      button.setAttribute('aria-label','Collapse PM command center');
      button.textContent='❯';
      const frame=document.createElement('iframe');
      frame.title='PM — Project Command Center';
      frame.loading='eager';
      frame.src=chrome.runtime.getURL('panel.html')+'?pmTabId='+encodeURIComponent(response.tabId);
      button.addEventListener('click',()=>{
        collapsed=!collapsed;
        shell.classList.toggle('closed',collapsed);
        button.textContent=collapsed?'PM':'❯';
        button.title=collapsed?'Expand PM command center':'Collapse PM command center';
        button.setAttribute('aria-label',button.title);
        if(collapsed)document.documentElement.classList.remove('pm-command-center-docked');
        else document.documentElement.classList.add('pm-command-center-docked');
      });
      shell.append(frame,button);
      shadow.append(style,shell);
      document.documentElement.append(host);
      reserveSpace();
      lastPid=pid;
    }catch(e){console.debug('PM panel could not mount:',e);}
    finally{mounting=false;}
  }
  function check(){
    const pid=matches();
    if(!pid){if(host)detach();return;}
    if(!host?.isConnected||lastPid!==pid)void mount(pid);
  }
  check();
  window.addEventListener('popstate',check);
  window.addEventListener('pageshow',check);
  setInterval(check,1800);
})();