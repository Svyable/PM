/* PM 0.7 — Project command center inventory and grounded activity metrics. */
'use strict';
(() => {
  const params=new URLSearchParams(location.search);
  let hostTabId=Number(params.get('pmTabId'))||null;
  const $=id=>document.getElementById(id);
  const entries=$('inventoryList'),filter=$('inventoryFilter');
  let last=null,busy=false;
  const say=(message)=>{const n=$('scanMeta');if(n)n.textContent=message;};
  function text(id,value){const e=$(id);if(e)e.textContent=String(value);}
  const niceTime=timestamp=>{
    if(!timestamp)return'';
    try{return new Date(timestamp).toLocaleDateString(undefined,{month:'short',day:'numeric'});}
    catch{return'';}
  };
  function renderRows(){
    const rows=last?.chats||[];
    const query=filter.value.trim().toLowerCase();
    const result=query?rows.filter(c=>(c.title+' '+c.description).toLowerCase().includes(query)):rows;
    entries.replaceChildren();
    if(!rows.length){
      const empty=document.createElement('p');empty.className='empty';
      empty.textContent='No project chats discovered yet. Refresh status or scan the project.';
      entries.append(empty);return;
    }
    if(!result.length){
      const empty=document.createElement('p');empty.className='empty';
      empty.textContent='No matching conversations in the discovered set.';
      entries.append(empty);return;
    }
    for(const row of result.slice(0,250)){
      const item=document.createElement('article');item.className='inventoryItem';
      const info=document.createElement('div');info.style.minWidth='0';
      const link=document.createElement('a');link.href=row.url;link.textContent=row.title||'Untitled';
      link.title='Open this conversation';
      link.target='_blank';link.rel='noopener noreferrer';
      link.addEventListener('click',event=>{
        event.preventDefault();
        void chrome.tabs.create({url:row.url,active:true});
      });
      info.append(link);
      if(row.description){
        const description=document.createElement('p');description.textContent=row.description;info.append(description);
      }
      const tags=document.createElement('div');tags.className='tags';
      const tag=document.createElement('span');tag.className='tag '+(row.visitedAt?'visited':'');
      tag.textContent=row.visitedAt?'Visited':'Not visited in PM';tags.append(tag);
      if(row.open){const open=document.createElement('span');open.className='tag open';open.textContent='Open tab';tags.append(open);}
      info.append(tags);
      const right=document.createElement('div');right.className='right';
      if(row.updated){const stamp=document.createElement('small');stamp.textContent=row.updated;right.append(stamp);}
      else if(row.visitedAt){const stamp=document.createElement('small');stamp.textContent=niceTime(row.visitedAt);right.append(stamp);}
      item.append(info,right);entries.append(item);
    }
    if(result.length>250){const more=document.createElement('p');more.className='empty';more.textContent='Showing 250 of '+result.length+' matching chats. Refine your search.';entries.append(more);}
  }
  async function refresh(){
    if(busy)return;
    busy=true;
    try{
      const context=await chrome.runtime.sendMessage({type:'PM_FIND_PROJECT',preferredTabId:hostTabId});
      if(!context?.ok||!context.tabId){
        hostTabId=null;
        text('knownCount','–');text('openCount','–');
        text('generatingCount','–');text('visitedCount','–');
        say('Open a ChatGPT Project overview. PM will connect automatically.');
        return;
      }
      hostTabId=context.tabId;
      const snapshot=await chrome.runtime.sendMessage({type:'PM_GET_OVERVIEW',tabId:hostTabId});
      if(!snapshot?.ok)throw Error(snapshot?.error||'Overview unavailable');
      last=snapshot;
      text('projectLabel',snapshot.projectTitle||'/project');
      text('knownCount',snapshot.known);
      text('openCount',snapshot.openTabs);
      text('generatingCount',snapshot.generatingObserved);
      text('visitedCount',snapshot.trackedSeen);
      text('inventoryCount',snapshot.known+' known');
      const completeness=snapshot.complete?'Full scan previously completed':'Partial inventory';
      const generating='Generating checked in '+snapshot.generatingChecked+' of '+snapshot.openTabs+' open tabs';
      const scanning=snapshot.scanning?' · scanning more conversations…':'';
      say(completeness+' · '+snapshot.visible+' visible now · '+generating+scanning);
      $('scanProject').disabled=snapshot.scanning;
      renderRows();
    }catch(e){say('Project overview unavailable: '+String(e.message||e));}
    finally{busy=false;}
  }
  $('refreshOverview').addEventListener('click',()=>void refresh());
  $('scanProject').addEventListener('click',async()=>{
    if(busy)return;
    $('scanProject').disabled=true;say('Scanning project conversations…');
    try{
      const context=await chrome.runtime.sendMessage({type:'PM_FIND_PROJECT',preferredTabId:hostTabId});
      if(!context?.tabId)throw Error('Open a ChatGPT Project overview.');
      hostTabId=context.tabId;
      const result=await chrome.runtime.sendMessage({type:'PM_INVENTORY_REFRESH',tabId:hostTabId});
      if(!result?.ok)throw Error(result?.error||'Scan unavailable');
      setTimeout(()=>void refresh(),500);
    }catch(e){say('Could not scan: '+String(e.message||e));}
    finally{$('scanProject').disabled=false;}
  });
  filter.addEventListener('input',renderRows);
  void refresh();
  setInterval(()=>void refresh(),5000);
})();