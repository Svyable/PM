/* PM 0.13 — Native Project inventory, status annotations and selective dispatch. */
'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const entries=$('inventoryList'),filter=$('inventoryFilter');
  const statuses=['untriaged','working','waiting','blocked','done'];
  const statusLabels={untriaged:'Untriaged',working:'Working',waiting:'Waiting',blocked:'Blocked',done:'Done'};
  let hostTabId=null,last=null,busy=false,selectionProjectId=null,selected=new Set();
  const say=message=>{const n=$('scanMeta');if(n)n.textContent=message;};
  const text=(id,value)=>{const e=$(id);if(e)e.textContent=String(value);};
  function emit(name,detail){window.dispatchEvent(new CustomEvent(name,{detail}));}
  function selectedRows(){
    if(!last||selectionProjectId!==last.projectId)return[];
    return(last.chats||[]).filter(row=>selected.has(row.id));
  }
  globalThis.PMSelection=Object.freeze({
    snapshot:()=>({projectId:selectionProjectId,chats:selectedRows().map(row=>({
      id:row.id,title:row.title,url:row.url
    }))}),
    count:()=>selectedRows().length
  });
  function selectionChanged(){
    const n=selectedRows().length;
    text('pmSelectedCount',n+' selected');
    $('pmDispatchSelected').disabled=n===0;
    emit('pm:selection',{projectId:selectionProjectId,count:n,chats:selectedRows()});
  }
  function selectedStatus(id){
    return globalThis.PMBoardState?.threads?.[id]?.status||'untriaged';
  }
  function filteredRows(){
    const rows=last?.chats||[],query=filter.value.trim().toLowerCase(),status=$('pmThreadFilter').value;
    return rows.filter(row=>
      (!query||(row.title+' '+row.description).toLowerCase().includes(query))&&
      (status==='all'||selectedStatus(row.id)===status));
  }
  function element(tag,className,textContent){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(textContent!==undefined)node.textContent=textContent;
    return node;
  }
  function openChat(row){
    void chrome.tabs.create({url:row.url,active:true});
  }
  function rerender(force=false){
    if(!force&&entries.contains(document.activeElement)&&
       ['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
    const rows=last?.chats||[],result=filteredRows();
    entries.replaceChildren();
    if(!rows.length){
      entries.append(element('p','empty','No project chats found yet. Refresh status or scan the Project.'));
      selectionChanged();return;
    }
    if(!result.length){
      entries.append(element('p','empty','No matching conversations. Try clearing your search or workstream status filter.'));
      selectionChanged();return;
    }
    for(const row of result.slice(0,250)){
      const item=element('article','inventoryItem');
      const left=element('div','pmThreadMain');
      const top=element('div','pmThreadTop');
      const checkbox=element('input','pmThreadCheck');
      checkbox.type='checkbox';checkbox.checked=selected.has(row.id);
      checkbox.setAttribute('aria-label','Select '+(row.title||'conversation'));
      checkbox.addEventListener('change',()=>{
        if(checkbox.checked)selected.add(row.id);else selected.delete(row.id);
        selectionChanged();
      });
      top.append(checkbox);
      const info=element('div','pmThreadInfo');
      const link=element('a','',row.title||'Untitled');
      link.href=row.url;link.target='_blank';link.rel='noopener noreferrer';
      link.title='Open this ChatGPT conversation';
      link.addEventListener('click',event=>{event.preventDefault();openChat(row);});
      info.append(link);
      if(row.description)info.append(element('p','',row.description));
      const tags=element('div','tags');
      tags.append(element('span','tag '+(row.visitedAt?'visited':''),row.visitedAt?'Visited in PM':'Not visited in PM'));
      if(row.open)tags.append(element('span','tag open','Open tab'));
      const meta=globalThis.PMBoardState?.threads?.[row.id];
      if(meta?.label)tags.append(element('span','tag pmLabel',meta.label));
      info.append(tags);top.append(info);left.append(top);
      const tools=element('div','pmThreadActions');
      const work=element('select','pmThreadStatus');
      work.setAttribute('aria-label','Workstream status for '+(row.title||'conversation'));
      for(const key of statuses){
        const opt=document.createElement('option');opt.value=key;opt.textContent=statusLabels[key];
        work.append(opt);
      }
      work.value=selectedStatus(row.id);
      work.addEventListener('change',()=>emit('pm:thread-status',{
        projectId:last.projectId,chatId:row.id,status:work.value
      }));
      tools.append(work);
      const annotateButton=element('button','pmAnnotateButton','Notes');
      annotateButton.type='button';annotateButton.setAttribute('aria-expanded','false');
      tools.append(annotateButton);
      if(row.updated)tools.append(element('small','',row.updated));
      const annotation=element('div','pmThreadAnnotation');
      annotation.hidden=true;
      const label=element('input','');label.maxLength=80;label.placeholder='Short workstream label';
      label.value=meta?.label||'';
      const note=element('textarea','');note.maxLength=1200;note.rows=2;
      note.placeholder='Tracking notes (stored in PM only)';
      note.value=meta?.notes||'';
      const save=element('button','pmTinyPrimary','Save notes');save.type='button';
      save.addEventListener('click',()=>emit('pm:thread-edit',{
        projectId:last.projectId,chatId:row.id,label:label.value,notes:note.value
      }));
      annotateButton.addEventListener('click',()=>{
        annotation.hidden=!annotation.hidden;
        annotateButton.setAttribute('aria-expanded',String(!annotation.hidden));
        if(!annotation.hidden)label.focus();
      });
      annotation.append(label,note,save);
      left.append(tools,annotation);
      item.append(left);entries.append(item);
    }
    if(result.length>250){
      entries.append(element('p','empty','Showing 250 of '+result.length+' matches. Refine your filters for the rest.'));
    }
    selectionChanged();
  }
  globalThis.PMInventoryRerender=()=>rerender(true);
  async function refresh(){
    if(busy)return;busy=true;
    try{
      const context=await chrome.runtime.sendMessage({
        type:'PM_FIND_PROJECT',preferredTabId:hostTabId
      });
      if(!context?.ok||!context.tabId||!context.projectId){
        hostTabId=null;last=null;selectionProjectId=null;selected.clear();
        text('knownCount','–');text('openCount','–');
        text('generatingCount','–');text('visitedCount','–');
        say('Open a ChatGPT Project overview. PM connects automatically.');
        emit('pm:project',{projectId:null,tabId:null});
        rerender(true);return;
      }
      hostTabId=context.tabId;
      const snapshot=await chrome.runtime.sendMessage({type:'PM_GET_OVERVIEW',tabId:hostTabId});
      if(!snapshot?.ok)throw Error(snapshot?.error||'Project overview unavailable');
      if(selectionProjectId!==snapshot.projectId){
        selectionProjectId=snapshot.projectId;selected.clear();
      }
      last=snapshot;
      globalThis.PMProjectContext={projectId:snapshot.projectId,tabId:hostTabId,snapshot};
      text('projectLabel',snapshot.projectTitle||'/project');
      text('knownCount',snapshot.known);
      text('openCount',snapshot.openTabs);
      text('generatingCount',snapshot.generatingObserved);
      text('visitedCount',snapshot.trackedSeen);
      text('inventoryCount',snapshot.known+' known');
      const completeness=snapshot.complete?'Inventory scan complete':'Partial inventory';
      const generating='Generating measured in '+snapshot.generatingChecked+' of '+snapshot.openTabs+' open tabs';
      const scanning=snapshot.scanning?' · scanning more…':'';
      say(completeness+' · '+(snapshot.visible??'?')+' currently visible · '+generating+scanning);
      $('scanProject').disabled=!!snapshot.scanning;
      emit('pm:project',{projectId:snapshot.projectId,tabId:hostTabId,snapshot});
      rerender();
    }catch(e){say('Project overview unavailable: '+String(e.message||e));}
    finally{busy=false;}
  }
  $('refreshOverview').addEventListener('click',()=>void refresh());
  $('scanProject').addEventListener('click',async()=>{
    if(busy)return;
    $('scanProject').disabled=true;say('Scanning Project conversations…');
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
  filter.addEventListener('input',()=>rerender(true));
  $('pmThreadFilter').addEventListener('change',()=>rerender(true));
  $('pmSelectVisible').addEventListener('click',()=>{
    for(const row of filteredRows())selected.add(row.id);
    rerender(true);
  });
  $('pmClearSelected').addEventListener('click',()=>{selected.clear();rerender(true);});
  $('pmApplyBulkStatus').addEventListener('click',()=>{
    const status=$('pmBulkStatus').value,ids=selectedRows().map(row=>row.id);
    if(!statuses.includes(status)||!ids.length)return;
    emit('pm:thread-bulk-status',{projectId:selectionProjectId,chatIds:ids,status});
  });
  $('pmDispatchSelected').addEventListener('click',()=>{
    const count=selectedRows().length;
    if(!count)return;
    $('mode').value='selected';
    $('target').value=String(count);
    $('mode').dispatchEvent(new Event('change',{bubbles:true}));
    $('setup').scrollIntoView({behavior:'smooth',block:'start'});
    $('prompt').focus();
  });
  window.addEventListener('pm:board-updated',()=>rerender(true));
  void refresh();
  setInterval(()=>void refresh(),5000);
})();
