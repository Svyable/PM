/* PM project dashboard smoke tests — no network or real Chrome account. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','extension','project-panel.js'),'utf8');
const project='g-p-example';
function environment(route){
  const nodes=[],intervals=[];
  function element(tag){
    const attrs={},handlers={};
    const list=new Set();
    return {tag,style:{},className:'',textContent:'',id:'',src:'',children:[],isConnected:false,
      classList:{add(c){list.add(c);},remove(c){list.delete(c);},toggle(c,on){if(on)list.add(c);else list.delete(c);},contains(c){return list.has(c);}},
      setAttribute(k,v){attrs[k]=String(v);},getAttribute(k){return attrs[k];},
      append(...children){for(const node of children){this.children.push(node);node.isConnected=true;}},
      remove(){this.isConnected=false;},
      attachShadow(){const shadow=element('shadow');this.shadowRoot=shadow;return shadow;},
      addEventListener(name,fn){handlers[name]=fn;},click(){handlers.click?.();}
    };
  }
  const root=element('html'),head=element('head');
  root.append=(child)=>{nodes.push(child);child.isConnected=true;};
  const document={head,documentElement:root,createElement:element};
  const location={pathname:route};
  const chrome={runtime:{
    async sendMessage(){return{ok:true,tabId:37,projectId:project};},
    getURL(name){return'chrome-extension://pm/'+name;}
  }};
  const window={addEventListener(){},location};
  const context={document,location,chrome,window,console,
    setInterval(fn){intervals.push(fn);return 1;},globalThis:{}};
  vm.runInNewContext(code,context,{filename:'project-panel.js'});
  return{nodes,intervals,root,location};
}
(async()=>{
  const visible=environment('/g/'+project+'/project');
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(visible.nodes.length,1);
  const host=visible.nodes[0];
  assert.equal(host.id,'pm-project-command-center');
  assert.ok(visible.root.classList.contains('pm-command-center-docked'));
  const shell=host.shadowRoot.children.find(x=>x.className==='shell');
  assert.ok(shell);
  const frame=shell.children.find(x=>x.tag==='iframe');
  assert.ok(frame.src.includes('panel.html?pmTabId=37'));
  const button=shell.children.find(x=>x.tag==='button');
  button.click();
  assert.ok(shell.classList.contains('closed'),'panel should collapse');
  assert.ok(!visible.root.classList.contains('pm-command-center-docked'),'restores ChatGPT page width');
  button.click();
  assert.ok(!shell.classList.contains('closed'),'panel should expand again');
  visible.location.pathname='/g/'+project+'/c/some-chat';
  visible.intervals[0]();
  assert.equal(host.isConnected,false,'panel should be removed outside project overview');
  const chat=environment('/g/'+project+'/c/some-chat');
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(chat.nodes.length,0,'never inject dashboard on chat pages');
  console.log('PM project panel tests passed: persistent mount, collapse, expand and route cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
