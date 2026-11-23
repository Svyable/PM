/* PM v0.13 — Project OS / local project-management control plane. */
'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const statuses=['todo','doing','blocked','done'];
  const statusNames={todo:'To do',doing:'In progress',blocked:'Blocked',done:'Done'};
  const priorities={critical:'Critical',high:'High',normal:'Normal',low:'Low'};
  let context=null,board=null,history=[],fleet=null,summary=null,view='tasks',taskFilter='open';
  let busy=false,loading=false,editingTaskId=null,briefDirty=false,lastSync=0;
  const text=(id,value)=>{const el=$(id);if(el)el.textContent=String(value);};
  const notify=(message,bad=false)=>{
    const el=$('pmBoardNotice');
    el.textContent=message;el.classList.toggle('pmError',bad);
  };
  const formatDate=value=>{
    if(!value)return'';
    try{return new Date(value+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
    catch{return value;}
  };
  const time=value=>{
    if(!value)return'';
    try{return new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});}
    catch{return'';}
  };
  function el(tag,cls,content){
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(content!==undefined)node.textContent=content;
    return node;
  }
  async function request(type,payload){
    const result=await chrome.runtime.sendMessage({type,...payload});
    if(!result?.ok)throw Error(result?.error||'Project management request failed.');
    return result;
  }
  function setControls(enabled){
    for(const id of ['pmTaskTitle','pmMission','pmObjective','pmNextAction','pmTaskPriority',
      'pmTaskDue','pmTaskChat','pmIsMilestone','pmTaskStatus','pmTaskNotes',
      'pmTaskFilter','pmSaveTask','pmExportBoard','pmImportBoard']){
      const node=$(id);if(node)node.disabled=!enabled;
    }
  }
  function briefFromBoard(force=false){
    if(!board||(!force&&briefDirty))return;
    $('pmMission').value=board.mission||'';
    $('pmObjective').value=board.objective||'';
    $('pmNextAction').value=board.nextAction||'';
    briefDirty=false;text('pmBriefStatus','');
  }
  function threadOptions(){
    const options=$('pmTaskChat'),current=options.value;
    options.replaceChildren();
    const empty=el('option','', 'No linked conversation');empty.value='';options.append(empty);
    const known=context?.snapshot?.chats||[];
    for(const row of known.slice(0,1000)){
      const item=el('option','',row.title||row.id);item.value=row.id;options.append(item);
    }
    options.value=[...options.options].some(o=>o.value===current)?current:'';
  }
  function summaryCards(){
    const data=summary||{};
    text('pmTasksOpen',Math.max(0,(data.taskCount||0)-(data.done||0)));
    text('pmTasksBlocked',(data.blocked||0)+(data.blockedConversations||0));
    text('pmMilestonesOpen',data.milestoneOpen||0);
    text('pmOverdue',data.overdue||0);
  }
  function selectedTasks(){
    const all=board?.tasks||[];
    return all.filter(task=>{
      if(view==='milestones'&&!task.milestone)return false;
      if(view==='tasks'&&task.milestone)return false;
      if(taskFilter==='open')return task.status!=='done';
      return taskFilter==='all'||task.status===taskFilter;
    }).sort((a,b)=>{
      const pri={critical:0,high:1,normal:2,low:3};
      const status={blocked:0,doing:1,todo:2,done:3};
      return status[a.status]-status[b.status]||pri[a.priority]-pri[b.priority]||
        (a.due||'9999-99-99').localeCompare(b.due||'9999-99-99')||
        b.createdAt-a.createdAt;
    });
  }
  function linkedChat(chatId){
    if(!chatId)return null;
    return(context?.snapshot?.chats||[]).find(row=>row.id===chatId)||null;
  }
  function resetEditor(){
    editingTaskId=null;
    $('pmTaskForm').reset();
    $('pmTaskPriority').value='normal';$('pmTaskStatus').value='todo';
    $('pmSaveTask').textContent='+ Add work item';
    $('pmCancelTaskEdit').hidden=true;
    threadOptions();
  }
  function edit(task){
    editingTaskId=task.id;
    $('pmTaskTitle').value=task.title;
    $('pmTaskNotes').value=task.notes||'';
    $('pmTaskPriority').value=task.priority||'normal';
    $('pmTaskDue').value=task.due||'';
    $('pmTaskStatus').value=task.status||'todo';
    $('pmIsMilestone').checked=!!task.milestone;
    threadOptions();$('pmTaskChat').value=task.chatId||'';
    $('pmSaveTask').textContent='Save work item';
    $('pmCancelTaskEdit').hidden=false;
    $('pmTaskForm').scrollIntoView({behavior:'smooth',block:'center'});
    $('pmTaskTitle').focus();
  }
  function renderTasks(){
    const list=$('pmTaskList');list.replaceChildren();
    const rows=selectedTasks();
    if(!rows.length){
      list.append(el('p','pmEmpty',view==='milestones'?
        'No matching milestones. Add one above to establish a measurable checkpoint.':
        'No matching tasks. Capture your next deliverable above.'));return;
    }
    for(const item of rows.slice(0,250)){
      const card=el('article','pmWorkCard');
      if(item.status==='blocked')card.classList.add('pmBlocked');
      if(item.status==='done')card.classList.add('pmDone');
      const head=el('div','pmWorkTitle');
      const title=el('strong','',item.title);head.append(title);
      if(item.milestone)head.append(el('span','pmWorkBadge','Milestone'));
      card.append(head);
      const meta=el('div','pmWorkMeta');
      meta.append(el('span','pmPriority '+item.priority,priorities[item.priority]||item.priority));
      if(item.due)meta.append(el('span','', 'Due '+formatDate(item.due)));
      const target=linkedChat(item.chatId);
      if(target){
        const link=el('a','',target.title||'Conversation');
        link.href=target.url;link.target='_blank';link.rel='noopener noreferrer';
        meta.append(link);
      }else if(item.chatId)meta.append(el('span','', 'Linked chat not in current inventory'));
      card.append(meta);
      if(item.notes)card.append(el('p','pmWorkNotes',item.notes));
      const actions=el('div','pmWorkActions');
      const status=el('select','pmWorkStatus');
      status.setAttribute('aria-label','Status for '+item.title);
      for(const code of statuses){
        const option=el('option','',statusNames[code]);option.value=code;status.append(option);
      }
      status.value=item.status;
      status.addEventListener('change',()=>void mutate({
        type:'editTask',id:item.id,patch:{status:status.value}
      }));
      const editBtn=el('button','','Edit');editBtn.type='button';editBtn.addEventListener('click',()=>edit(item));
      const removeBtn=el('button','pmDelete','Delete');removeBtn.type='button';
      removeBtn.addEventListener('click',()=>{
        if(confirm('Delete "'+item.title+'"? This removes only the PM task, never the ChatGPT conversation.')){
          void mutate({type:'removeTask',id:item.id});
        }
      });
      actions.append(status,editBtn,removeBtn);card.append(actions);
      list.append(card);
    }
    if(rows.length>250)list.append(el('p','pmEmpty','Showing 250 of '+rows.length+' work items. Refine the status filter.'));
  }
  function renderHistory(){
    const list=$('pmHistoryList');list.replaceChildren();
    if(!history.length){list.append(el('p','pmEmpty','No completed PM runs recorded yet. New dispatches will appear here.'));return;}
    for(const row of history){
      const card=el('div','pmHistoryItem');
      card.append(el('strong','',row.mode.replaceAll('-',' ')+' · '+(row.status||'done')));
      card.append(el('div','',row.completed+' verified · '+row.failed+' failed · '+(row.uncertain||0)+' uncertain'));
      card.append(el('small','',time(row.finishedAt)));
      list.append(card);
    }
  }
  function render(){
    if(!board)return;
    summaryCards();
    briefFromBoard();
    threadOptions();
    renderTasks();renderHistory();
    $('pmTaskView').hidden=view==='history';
    $('pmHistoryView').hidden=view!=='history';
    $('pmTaskForm').hidden=view==='history';
    document.querySelectorAll('[data-pm-view]').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.pmView===view));
    });
    setControls(true);
    $('pmSeedFleetTasks').disabled=!(fleet?.threads?.length);
    $('pmSeedFleetTasks').title=fleet?.threads?.length?
      'Create idempotent PM review tasks linked to the saved specialist chats':
      'Seed a Project fleet first';
  }
  async function load(force=false){
    if(!context?.tabId||loading)return;
    if(!force&&Date.now()-lastSync<12000)return;
    loading=true;
    const current=context.projectId,tabId=context.tabId;
    try{
      const [b,h,f]=await Promise.all([
        request('PM_BOARD_GET',{tabId}),request('PM_HISTORY_GET',{tabId}),
        request('PM_GET_FLEET',{tabId})
      ]);
      if(current!==context?.projectId)return;
      board=b.board;history=h.runs||[];summary=b.summary;fleet=f.fleet||null;
      globalThis.PMBoardState=board;
      lastSync=Date.now();
      render();window.dispatchEvent(new Event('pm:board-updated'));
    }catch(e){notify('Could not load Project Board: '+String(e.message||e),true);}
    finally{loading=false;}
  }
  async function mutate(mutation){
    if(!context?.tabId||!board||busy)return;
    busy=true;
    const current=context.projectId,tabId=context.tabId,revision=board.revision;
    notify('Saving Project Board…');
    try{
      const r=await request('PM_BOARD_MUTATE',{tabId,expectedRevision:revision,mutation});
      if(context?.projectId!==current)return;
      board=r.board;summary=r.summary;
      globalThis.PMBoardState=board;
      lastSync=Date.now();
      render();
      window.dispatchEvent(new Event('pm:board-updated'));
      notify('Saved locally · '+new Date().toLocaleTimeString());
      return true;
    }catch(e){
      notify(String(e.message||e),true);
      await load(true);
      return false;
    }finally{busy=false;}
  }
  window.addEventListener('pm:project',event=>{
    const data=event.detail;
    if(!data?.projectId||!data.tabId){
      context=null;board=null;summary=null;history=[];fleet=null;globalThis.PMBoardState=null;
      setControls(false);notify('Open a ChatGPT Project overview to manage its work.');
      return;
    }
    const changed=context?.projectId!==data.projectId;
    context={projectId:data.projectId,tabId:data.tabId,snapshot:data.snapshot};
    if(changed){
      board=null;history=[];summary=null;fleet=null;briefDirty=false;lastSync=0;editingTaskId=null;
      globalThis.PMBoardState=null;
      setControls(false);notify('Loading Project Board…');
    }
    void load(changed);
    if(board)threadOptions();
  });
  for(const id of ['pmMission','pmObjective','pmNextAction']){
    $(id).addEventListener('input',()=>{
      briefDirty=true;text('pmBriefStatus','Unsaved changes');
    });
  }
  $('pmBriefForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const saved=await mutate({
      type:'saveBrief',mission:$('pmMission').value,
      objective:$('pmObjective').value,nextAction:$('pmNextAction').value
    });
    if(saved){briefDirty=false;text('pmBriefStatus','Saved');}
  });
  $('pmTaskForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const data={
      title:$('pmTaskTitle').value,notes:$('pmTaskNotes').value,
      priority:$('pmTaskPriority').value,due:$('pmTaskDue').value,
      chatId:$('pmTaskChat').value,status:$('pmTaskStatus').value,
      milestone:$('pmIsMilestone').checked
    };
    const saved=await mutate(editingTaskId
      ?{type:'editTask',id:editingTaskId,patch:data}
      :{type:'addTask',task:data});
    if(saved)resetEditor();
  });
  $('pmCancelTaskEdit').addEventListener('click',resetEditor);
  $('pmTaskFilter').addEventListener('change',()=>{
    taskFilter=$('pmTaskFilter').value;renderTasks();
  });
  document.querySelectorAll('[data-pm-view]').forEach(button=>{
    button.addEventListener('click',()=>{
      view=button.dataset.pmView;
      render();
    });
  });
  window.addEventListener('pm:thread-status',event=>{
    if(event.detail.projectId!==context?.projectId)return;
    void mutate({type:'setThread',chatId:event.detail.chatId,
      patch:{status:event.detail.status}});
  });
  window.addEventListener('pm:thread-edit',event=>{
    if(event.detail.projectId!==context?.projectId)return;
    void mutate({type:'setThread',chatId:event.detail.chatId,
      patch:{label:event.detail.label,notes:event.detail.notes}});
  });
  window.addEventListener('pm:thread-bulk-status',event=>{
    if(event.detail.projectId!==context?.projectId)return;
    void mutate({type:'bulkThreadStatus',
      chatIds:event.detail.chatIds,status:event.detail.status});
  });
  $('pmSeedFleetTasks').addEventListener('click',async()=>{
    if(!board||!context)return;
    const threads=fleet?.threads||[];
    if(!threads.length){notify('Seed a Project fleet first, then refresh Project OS.',true);return;}
    const linked=new Set(board.tasks.map(t=>t.chatId).filter(Boolean));
    const newCount=threads.filter(t=>!linked.has(t.id)).length;
    if(!newCount){notify('Every saved specialist chat already has a linked work item.');return;}
    if(!confirm('Create '+newCount+' PM review tasks linked to the saved specialist chats? Existing tasks will not be replaced.'))return;
    const saved=await mutate({type:'seedFleetTasks'});
    if(saved)notify('Added '+newCount+' specialist review tasks from the verified fleet ledger.');
  });
  $('pmExportBoard').addEventListener('click',()=>{
    if(!board||!context)return;
    const exportData={kind:'pm-project-board',schema:1,projectId:context.projectId,
      exportedAt:new Date().toISOString(),board};
    const blob=new Blob([JSON.stringify(exportData,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=el('a');
    a.href=url;a.download='PM-Project-Board-'+context.projectId+'.json';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    notify('Project Board JSON exported. It includes your local notes.');
  });
  $('pmImportBoard').addEventListener('click',()=>$('pmBoardFile').click());
  $('pmBoardFile').addEventListener('change',async event=>{
    const file=event.target.files?.[0];event.target.value='';
    if(!file||!context)return;
    if(file.size>2_000_000){notify('Import is too large (maximum 2 MB).',true);return;}
    try{
      const data=JSON.parse(await file.text());
      if(data.kind!=='pm-project-board'||data.schema!==1||data.projectId!==context.projectId)
        throw Error('This export belongs to another Project or is not a supported PM board.');
      if(!confirm('Replace this Project’s PM notes, tasks and workstream statuses with the imported board? ChatGPT conversations will not be changed.'))return;
      const saved=await mutate({type:'import',board:data.board});
      if(saved){briefDirty=false;briefFromBoard(true);resetEditor();notify('Project Board imported locally.');}
    }catch(e){notify('Import failed: '+String(e.message||e),true);}
  });
  setControls(false);
  if(globalThis.PMProjectContext){
    const state=globalThis.PMProjectContext;
    context={projectId:state.projectId,tabId:state.tabId,snapshot:state.snapshot};
    void load(true);
  }
  setInterval(()=>void load(),15000);
})();