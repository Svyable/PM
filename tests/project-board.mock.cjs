'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../extension/project-data.js'),'utf8');
const ctx={Date,Math};vm.createContext(ctx);
vm.runInContext(code,ctx,{filename:'project-data.js'});
const model=ctx.PMProjectBoard;
assert.ok(model);
const now=Date.UTC(2026,10,22);
let board=model.empty();
assert.equal(board.revision,0);
board=model.mutate(board,{
  type:'saveBrief',mission:'Build a rigorous research portfolio.',
  objective:'Publish three validated results.',nextAction:'Audit sources.'
},{now});
assert.equal(board.revision,1);
assert.equal(board.mission,'Build a rigorous research portfolio.');
const id=()=> 't-test-1';
board=model.mutate(board,{type:'addTask',task:{
  title:'Replicate benchmark',notes:'Link results to methods',
  status:'todo',priority:'critical',due:'2026-11-20',chatId:'chat-1',
  milestone:true
}},{now:now+1000,makeId:id});
assert.equal(board.tasks.length,1);
assert.equal(board.tasks[0].id,'t-test-1');
assert.equal(board.tasks[0].createdAt,now+1000);
assert.equal(board.tasks[0].updatedAt,now+1000);
const preserved=model.normalize(board,now+5000);
assert.equal(preserved.tasks[0].updatedAt,now+1000,'normalization cannot fabricate a new edit time');
board=model.mutate(board,{type:'editTask',id:'t-test-1',patch:{status:'doing',notes:'Evidence reviewed'}},{now:now+2000});
assert.equal(board.tasks[0].status,'doing');
assert.equal(board.tasks[0].title,'Replicate benchmark');
assert.equal(board.tasks[0].updatedAt,now+2000);
board=model.mutate(board,{type:'setThread',chatId:'chat-1',
  patch:{status:'working',label:'Proof agent',notes:'Verify lemmas.'}},{now:now+2100});
board=model.mutate(board,{type:'bulkThreadStatus',chatIds:['chat-1','chat-2','chat-2'],status:'blocked'},{now:now+2200});
assert.equal(board.threads['chat-1'].label,'Proof agent');
assert.equal(board.threads['chat-1'].status,'blocked');
assert.equal(board.threads['chat-2'].status,'blocked');
assert.equal(Object.keys(board.threads).length,2);
const counts=model.summary(board,'2026-11-22');
assert.equal(counts.taskCount,1);
assert.equal(counts.overdue,1);
assert.equal(counts.milestoneOpen,1);
assert.equal(counts.blockedConversations,2);
board=model.mutate(board,{type:'editTask',id:'t-test-1',patch:{status:'done'}},{now:now+2300});
assert.equal(model.summary(board,'2026-11-22').milestoneOpen,0);
assert.equal(model.summary(board,'2026-11-22').overdue,0);
let planIds=0;
board=model.mutate(board,{type:'seedFleetTasks',mission:'Investigate PM workstreams.',threads:[
  {id:'chat-1',roleName:'Existing Role'}, {id:'chat-3',roleName:'Proof Auditor'},
  {id:'chat-4',roleName:'Red Team'}
]},{now:now+2400,makeId:()=> 't-plan-'+(++planIds)});
assert.equal(board.tasks.length,3,'existing linked task is preserved, new chats get new review work');
assert.ok(board.tasks.some(t=>t.chatId==='chat-3'&&t.title==='Review Proof Auditor findings'));
const planSnapshot=board.tasks.length;
board=model.mutate(board,{type:'seedFleetTasks',mission:'Ignored repeat',threads:[
  {id:'chat-1',roleName:'Existing Role'}, {id:'chat-3',roleName:'Proof Auditor'},
  {id:'chat-4',roleName:'Red Team'}
]},{now:now+2450,makeId:()=> 't-plan-'+(++planIds)});
assert.equal(board.tasks.length,planSnapshot,'repeated seed is idempotent');
assert.throws(()=>model.mutate(board,{type:'seedFleetTasks',threads:[{id:'../wrong',roleName:'Bad'}]}),/identity/);
const exported=JSON.parse(JSON.stringify(board));
board=model.mutate(board,{type:'removeTask',id:'t-test-1'},{now:now+2400});
assert.equal(board.tasks.length,2,'removing one task preserves linked review tasks');
const previousRev=board.revision;
board=model.mutate(board,{type:'import',board:exported},{now:now+2500});
assert.equal(board.revision,previousRev+1);
assert.equal(board.tasks.length,3);
assert.equal(board.threads['chat-2'].status,'blocked');
assert.throws(()=>model.mutate(board,{type:'addTask',task:{title:'Bad',due:'2026-02-31'}},{makeId:()=> 't-test-2'}),/Invalid due date/);
assert.throws(()=>model.mutate(board,{type:'setThread',chatId:'../../x',patch:{status:'done'}}),/identity/);
assert.throws(()=>model.mutate(board,{type:'setThread',chatId:'safe-id',patch:{status:'hacked'}}),/Invalid status/);
assert.throws(()=>model.mutate(board,{type:'editTask',id:'t-test-1',patch:{id:'rewritten'}}),/Unsupported task property/);
assert.throws(()=>model.mutate(board,{type:'bulkThreadStatus',chatIds:['a'],status:'hacked'}),/status/);
assert.throws(()=>model.mutate(board,{type:'import',board:{version:2}}),/version/);
const duplicate=JSON.parse(JSON.stringify(exported));duplicate.tasks.push({...duplicate.tasks[0]});
assert.throws(()=>model.normalize(duplicate),/Duplicate task ID/);
const oversized=JSON.parse(JSON.stringify(exported));
oversized.tasks=Array.from({length:501},(_,i)=>({...exported.tasks[0],id:'t-'+i}));
assert.throws(()=>model.normalize(oversized),/too many tasks/);
assert.equal(Object.keys(model.empty().threads).length,0);
console.log('PM Project Board tests passed: local plans, tasks, milestones, status tracking, dates, revision, import and schema guards.');
