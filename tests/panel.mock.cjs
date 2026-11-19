/* PM v0.10 native side-panel launcher tests — no account needed. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','extension','project-panel.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','extension','manifest.json'),'utf8'));
const project='g-p-example';
function environment(route){
  const nodes=[],intervals=[],calls=[];
  function element(tag){
    const attrs={},handlers={};
    return {tag,style:{},className:'',textContent:'',id:'',children:[],isConnected:false,
      setAttribute(k,v){attrs[k]=String(v);},getAttribute(k){return attrs[k];},
      append(...children){for(const node of children){this.children.push(node);node.isConnected=true;}},
      remove(){this.isConnected=false;},
      attachShadow(){const shadow=element('shadow');this.shadowRoot=shadow;return shadow;},
      addEventListener(name,fn){handlers[name]=fn;},click(){handlers.click?.();}
    };
  }
  const root=element('html');
  root.append=(child)=>{nodes.push(child);child.isConnected=true;};
  const document={documentElement:root,createElement:element};
  const location={pathname:route};
  const chrome={runtime:{
    async sendMessage(message){calls.push(message);return{ok:true};}
  }};
  const window={addEventListener(){},location};
  vm.runInNewContext(code,{document,location,chrome,window,console,
    setInterval(fn){intervals.push(fn);return 1;},globalThis:{}},
    {filename:'project-panel.js'});
  return{nodes,intervals,root,location,calls};
}
(async()=>{
  assert.equal(manifest.action.default_popup,undefined,'toolbar must open native side panel, not popup');
  assert.ok(manifest.permissions.includes('sidePanel'));
  assert.equal(manifest.side_panel.default_path,'panel.html');
  const html=fs.readFileSync(path.join(__dirname,'..','extension','panel.html'),'utf8');
  assert.ok(html.indexOf('<section id="setup"')<html.indexOf('<section id="run"'),'launch form must precede run log');
  assert.ok(!html.includes('id="reconnect"'),'manual Reconnect must not exist');
  assert.ok(html.includes('id="mode"')&&html.includes('id="prompt"')&&html.includes('id="effort"'));
  assert.ok(html.includes('id="target"')&&html.includes('id="loadTimeout"'));
  assert.ok(!manifest.web_accessible_resources,'native panel should not require public iframe resources');
  const page=environment('/g/'+project+'/project');
  assert.equal(page.nodes.length,1,'project launcher must be visible');
  const host=page.nodes[0];
  assert.equal(host.id,'pm-project-command-center');
  const button=host.shadowRoot.children.find(x=>x.tag==='button');
  assert.ok(button);
  assert.equal(button.getAttribute('aria-label'),'Open full PM command center in Chrome side panel');
  assert.equal(host.shadowRoot.children.some(x=>x.tag==='iframe'),false,'never inject cramped iframe');
  button.click();
  await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(page.calls.map(x=>x.type),['PM_OPEN_PANEL']);
  page.location.pathname='/g/'+project+'/c/some-chat';
  page.intervals[0]();
  assert.equal(host.isConnected,false,'launcher removed when navigating into a chat');
  const chat=environment('/g/'+project+'/c/some-chat');
  assert.equal(chat.nodes.length,0);
  console.log('PM full side panel tests passed: native manifest, one-click launcher, no iframe, route cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
