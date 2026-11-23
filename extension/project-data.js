/* PM — Local-first Project Boards. Pure schema and mutation engine, no DOM. */
(() => {
  'use strict';
  const statuses=Object.freeze(['todo','doing','blocked','done']);
  const threadStatuses=Object.freeze(['untriaged','working','waiting','blocked','done']);
  const priorities=Object.freeze(['low','normal','high','critical']);
  const limits=Object.freeze({tasks:500,threads:1000,mission:4000,objective:1200,nextAction:1200});
  const idPattern=/^[a-zA-Z0-9-]{1,128}$/;
  function bounded(value,max=500){return String(value??'').trim().slice(0,max);}
  function choice(value,allowed,defaultValue){
    if(value===undefined||value===null||value==='')return defaultValue;
    if(!allowed.includes(value))throw Error('Invalid status or priority.');
    return value;
  }
  function date(value){
    if(!value)return'';
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Invalid due date.');
    const d=new Date(value+'T12:00:00Z');
    if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==value)throw Error('Invalid due date.');
    return value;
  }
  function empty(){return{version:1,revision:0,mission:'',objective:'',nextAction:'',
    tasks:[],threads:{},updatedAt:0};}
  function task(input,existing=null,now=Date.now()){
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid task.');
    const result={
      id:existing?.id||input.id,
      title:bounded(input.title??existing?.title,160),
      notes:bounded(input.notes??existing?.notes,2500),
      status:choice(input.status??existing?.status,statuses,'todo'),
      priority:choice(input.priority??existing?.priority,priorities,'normal'),
      due:date(input.due??existing?.due),
      milestone:(input.milestone??existing?.milestone)===true,
      chatId:bounded(input.chatId??existing?.chatId,128),
      createdAt:existing?.createdAt||Number(input.createdAt)||now,
      updatedAt:existing?now:(Number(input.updatedAt)||now)
    };
    if(!result.title)throw Error('Task title is required.');
    if(!idPattern.test(result.id||''))throw Error('Invalid task identity.');
    if(result.chatId&&!idPattern.test(result.chatId))throw Error('Invalid linked chat ID.');
    return result;
  }
  function thread(input,existing=null,now=Date.now()){
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid conversation tracking.');
    return{
      status:choice(input.status??existing?.status,threadStatuses,'untriaged'),
      label:bounded(input.label??existing?.label,80),
      notes:bounded(input.notes??existing?.notes,1200),
      updatedAt:existing?now:(Number(input.updatedAt)||now)
    };
  }
  function normalize(raw,now=Date.now()){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid board data.');
    if(raw.version!==undefined&&raw.version!==1)throw Error('Unsupported board version.');
    const tasks=Array.isArray(raw.tasks)?raw.tasks:[];
    if(tasks.length>limits.tasks)throw Error('Board has too many tasks (maximum 500).');
    const result=empty();
    result.revision=Number.isInteger(raw.revision)&&raw.revision>=0?raw.revision:0;
    result.mission=bounded(raw.mission,limits.mission);
    result.objective=bounded(raw.objective,limits.objective);
    result.nextAction=bounded(raw.nextAction,limits.nextAction);
    const ids=new Set();
    for(const input of tasks){
      const item=task(input,null,now);
      if(ids.has(item.id))throw Error('Duplicate task ID.');
      ids.add(item.id);result.tasks.push(item);
    }
    const entries=Object.entries(raw.threads||{});
    if(entries.length>limits.threads)throw Error('Board has too many tracked conversations.');
    for(const [id,info] of entries){
      if(!idPattern.test(id))throw Error('Invalid tracked conversation identity.');
      result.threads[id]=thread(info,null,now);
    }
    result.updatedAt=Number(raw.updatedAt)||now;
    return result;
  }
  function mutate(raw,mutation,{now=Date.now(),makeId=()=>('t-'+now+'-'+Math.random().toString(36).slice(2,9))}={}){
    const board=normalize(raw||empty(),now);
    if(!mutation||typeof mutation!=='object'||Array.isArray(mutation))throw Error('Invalid board change.');
    switch(mutation.type){
      case'saveBrief':
        board.mission=bounded(mutation.mission,limits.mission);
        board.objective=bounded(mutation.objective,limits.objective);
        board.nextAction=bounded(mutation.nextAction,limits.nextAction);
        break;
      case'addTask':{
        if(board.tasks.length>=limits.tasks)throw Error('Task limit reached (500).');
        const id=makeId();
        if(!idPattern.test(id)||board.tasks.some(t=>t.id===id))throw Error('Could not create unique task.');
        board.tasks.push(task({...mutation.task,id},null,now));break;
      }
      case'editTask':{
        const found=board.tasks.findIndex(t=>t.id===mutation.id);
        if(found<0)throw Error('Task was not found. Refresh your board.');
        const patch=mutation.patch;
        if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('Invalid task update.');
        const allowed=['title','notes','status','priority','due','milestone','chatId'];
        if(Object.keys(patch).some(key=>!allowed.includes(key)))throw Error('Unsupported task property.');
        board.tasks[found]=task(patch,board.tasks[found],now);break;
      }
      case'removeTask':{
        const before=board.tasks.length;
        board.tasks=board.tasks.filter(t=>t.id!==mutation.id);
        if(board.tasks.length===before)throw Error('Task was not found. Refresh your board.');
        break;
      }
      case'setThread':{
        const id=mutation.chatId;
        if(typeof id!=='string'||!idPattern.test(id))throw Error('Invalid conversation identity.');
        if(!Object.hasOwn(board.threads,id)&&Object.keys(board.threads).length>=limits.threads)
          throw Error('Conversation tracking limit reached.');
        const patch=mutation.patch;
        if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('Invalid conversation update.');
        if(Object.keys(patch).some(key=>!['status','label','notes'].includes(key)))
          throw Error('Unsupported conversation property.');
        board.threads[id]=thread(patch,board.threads[id],now);break;
      }
      case'bulkThreadStatus':{
        const ids=mutation.chatIds;
        if(!Array.isArray(ids)||!ids.length||ids.length>1000)
          throw Error('Choose between 1 and 1,000 conversations.');
        if(!threadStatuses.includes(mutation.status))throw Error('Invalid conversation status.');
        const unique=[...new Set(ids)];
        for(const id of unique){
          if(typeof id!=='string'||!idPattern.test(id))throw Error('Invalid conversation identity.');
          if(!Object.hasOwn(board.threads,id)&&Object.keys(board.threads).length>=limits.threads)
            throw Error('Conversation tracking limit reached.');
          board.threads[id]=thread({status:mutation.status},board.threads[id],now);
        }
        break;
      }
      case'import':
        if(mutation.board?.version!==1)throw Error('Expected a PM Project Board export (version 1).');
        return{...normalize(mutation.board,now),revision:board.revision+1,updatedAt:now};
      default:throw Error('Unsupported Project Board change.');
    }
    board.revision++;board.updatedAt=now;
    return board;
  }
  function summary(board,today=new Date().toISOString().slice(0,10)){
    const tasks=board.tasks||[],threadEntries=Object.values(board.threads||{});
    const count=s=>tasks.filter(t=>t.status===s).length;
    return{
      taskCount:tasks.length,done:count('done'),doing:count('doing'),blocked:count('blocked'),
      milestoneOpen:tasks.filter(t=>t.milestone&&t.status!=='done').length,
      overdue:tasks.filter(t=>t.due&&t.due<today&&t.status!=='done').length,
      trackedConversations:threadEntries.length,
      activeConversations:threadEntries.filter(t=>t.status==='working').length,
      blockedConversations:threadEntries.filter(t=>t.status==='blocked').length
    };
  }
  globalThis.PMProjectBoard=Object.freeze({
    empty,normalize,mutate,summary,statuses,threadStatuses,priorities,limits
  });
})();