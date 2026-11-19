/* PM — tiny on-page launcher for the native Chrome side panel. */
(() => {
  'use strict';
  if(globalThis.__PM_PROJECT_PANEL__)return;
  globalThis.__PM_PROJECT_PANEL__=true;
  const PROJECT=/^\/g\/(g-p-[a-zA-Z0-9-]+)\/project\/?$/;
  const HOST_ID='pm-project-command-center';
  let host=null,pid=null;
  const onProject=()=>location.pathname.match(PROJECT)?.[1]||null;
  function remove(){host?.remove();host=null;pid=null;}
  function mount(projectId){
    if(host?.isConnected&&pid===projectId)return;
    remove();
    host=document.createElement('div');
    host.id=HOST_ID;
    host.setAttribute('data-pm-extension','launcher');
    const shadow=host.attachShadow({mode:'open'});
    const style=document.createElement('style');
    style.textContent=[
      ':host{all:initial;position:fixed;z-index:2147483000;right:22px;bottom:20px;pointer-events:auto;font-family:Inter,system-ui,-apple-system,sans-serif}',
      'button{display:flex;align-items:center;gap:10px;padding:11px 16px 11px 12px;border:1px solid #7e85dc;border-radius:999px;color:#f5f6ff;cursor:pointer;background:linear-gradient(120deg,#262d54,#10172a);box-shadow:0 12px 36px #000b,0 0 0 2px #929dff19;font-size:12px;font-weight:720}',
      'button:hover{background:linear-gradient(120deg,#383e78,#1b2644)}',
      'button:focus-visible{outline:3px solid #aab5ff;outline-offset:3px}',
      '.mark{display:inline-grid;place-items:center;border-radius:9px;width:30px;height:30px;color:#b8a3ff;background:#0b1030;border:1px solid #404b79;font-size:15px;font-weight:900}',
      '.copy{display:flex;flex-direction:column;text-align:left;gap:1px}',
      '.sub{font-size:10px;font-weight:500;color:#9eaccb}',
      '@media(max-width:700px){:host{right:12px;bottom:12px}}'
    ].join('');
    const button=document.createElement('button');
    button.type='button';
    button.setAttribute('aria-label','Open full PM command center in Chrome side panel');
    const mark=document.createElement('span');mark.className='mark';mark.textContent='PM';
    const copy=document.createElement('span');copy.className='copy';
    const label=document.createElement('span');label.textContent='PM Command Center';
    const sub=document.createElement('span');sub.className='sub';sub.textContent='Open full side panel ↗';
    copy.append(label,sub);button.append(mark,copy);
    button.addEventListener('click',()=>{
      chrome.runtime.sendMessage({type:'PM_OPEN_PANEL'}).then(r=>{
        if(r?.ok===false)sub.textContent='Use the PM toolbar icon to open';
        else sub.textContent='Full panel ready';
      }).catch(()=>{sub.textContent='Use the PM toolbar icon to open';});
    });
    shadow.append(style,button);
    document.documentElement.append(host);
    pid=projectId;
  }
  function check(){
    const projectId=onProject();
    if(!projectId){if(host)remove();return;}
    mount(projectId);
  }
  check();
  window.addEventListener('popstate',check);
  window.addEventListener('pageshow',check);
  setInterval(check,1500);
})();