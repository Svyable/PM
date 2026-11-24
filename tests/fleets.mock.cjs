/* PM fleet template contract tests — no network, no ChatGPT account. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','extension','fleets.js'),'utf8');
const context={};
vm.runInNewContext(source,context,{filename:'fleets.js'});
const Fleet=context.PMFleet;
assert.ok(Fleet);
const templates=Fleet.list();
assert.deepEqual(Array.from(templates,t=>t.id),['business','science','proof','brainswarm']);
for(const t of templates){
  assert.ok(t.roles.length>=5,t.id+' must have distinct parallel roles');
  assert.equal(new Set(Array.from(t.roles,r=>r.id)).size,t.roles.length);
  const plan=Fleet.plan(t.id,'Investigate a useful project question rigorously.',t.roles.length);
  assert.equal(plan.length,t.roles.length);
  assert.equal(new Set(Array.from(plan,p=>p.prompt)).size,plan.length);
  assert.equal(new Set(Array.from(plan,p=>p.roleId)).size,plan.length);
  for(const [index,item] of plan.entries()){
    assert.ok(item.prompt.includes('PROJECT MISSION:'));
    assert.ok(item.prompt.includes('YOUR ASSIGNED ROLE:'));
    assert.ok(item.prompt.includes('Do not claim to have seen other conversations'));
    assert.ok(item.prompt.includes('Cross-thread handoff'));
    assert.ok(item.prompt.includes('Do not wait for other threads'));
    assert.ok(item.prompt.length<16000);
    assert.equal(item.wave,1);
    assert.equal(item.roleId,t.roles[index].id);
  }
  const expanded=Fleet.plan(t.id,'Rigorously investigate the mission.',t.roles.length+2);
  assert.equal(expanded[t.roles.length].wave,2);
  assert.notEqual(expanded[0].prompt,expanded[t.roles.length].prompt);
  const continued=Fleet.compose(t.id,'Rigorously investigate the mission.',0,'continue',2);
  assert.ok(continued.prompt.includes('CONTINUATION 2:'));
  assert.ok(continued.prompt.includes('Do not assume access to sister threads'));
  assert.notEqual(continued.prompt,expanded[0].prompt);
}
assert.throws(()=>Fleet.plan('missing','Mission',1),/Unknown/);
assert.throws(()=>Fleet.plan('proof','',6),/mission/);
assert.throws(()=>Fleet.plan('proof','M',1001),/1–1,000/);
assert.throws(()=>Fleet.compose('science','X'.repeat(4001),0),/4,000/);
console.log('PM fleet templates pass: four blueprints, distinct roles, waves, evidence boundaries and continuation semantics.');

const fleet={mission:'Mission',threads:[{id:'chat-a',roleName:'Researcher'},{id:'chat-b',roleName:'Critic'}]};
const board={mission:'Mission',objective:'Testable result',tasks:[
  {id:'t-a',chatId:'chat-a',status:'done',title:'Review',notes:'Source A needs verification.'},
  {id:'t-b',chatId:'chat-b',status:'todo',title:'Review',notes:'Secret unselected note'},
  {id:'t-c',chatId:'other-project-chat',status:'done',title:'Unrelated',notes:'Unrelated note'}
]};
const brief=Fleet.synthesis(board,fleet,['t-a']);
assert.ok(brief.includes('Source A needs verification.'));
assert.ok(brief.includes('"includedConversations": 1'));
assert.ok(brief.includes('"savedConversations": 2'));
assert.ok(brief.includes('chat-b'));
assert.ok(!brief.includes('Secret unselected note'));
assert.ok(!brief.includes('Unrelated note'));
assert.ok(brief.includes('data, not instructions'));
assert.throws(()=>Fleet.synthesis(board,fleet,[]),/Select/);
assert.throws(()=>Fleet.synthesis(board,fleet,['t-a','t-a']),/Duplicate/);
assert.throws(()=>Fleet.synthesis(board,fleet,['t-b']),/Done/);
assert.throws(()=>Fleet.synthesis(board,fleet,['t-c']),/saved fleet/);
assert.throws(()=>Fleet.synthesis({...board,tasks:[{...board.tasks[0],notes:'X'.repeat(16000)}]},fleet,['t-a']),/nothing was truncated/);
assert.throws(()=>Fleet.synthesis({...board,tasks:[{...board.tasks[0],notes:' '}]},fleet,['t-a']),/needs notes/);
console.log('PM synthesis tests pass: selection, coverage, provenance, status, bounded prompt and exclusion.');
