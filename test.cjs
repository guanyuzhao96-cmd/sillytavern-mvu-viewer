const assert=require('node:assert/strict');
const C=require('./core.js');
function fixture(){
  const a={token:{chat_id:'a',message_id:2,swipe_id:0,message_text:'x'},table:{stat_data:{roles:{'周/韵~涵':{affection:3,grade:'A'}},system:{points:70},extra:{unknown:false}},initialized_lorebooks:{book:[]},external:{keep:1}}};
  let actual=C.clone(a),busy=false,writes=0;
  const adapter={busy:()=>busy,latest:async()=>C.clone(actual.token),read:async id=>{const out=C.clone(actual);out.token.message_id=id;return out;},commit:async(base,stat)=>{assert.equal(busy,false);if(!C.equal(base.token,actual.token)||!C.equal(base.table,actual.table))throw Error('冲突');actual.table.stat_data=C.clone(stat);writes++;}};
  return {a,adapter,get:()=>actual,mutate:f=>f(actual),busy:v=>busy=v,writes:()=>writes};
}
(async()=>{
  let count=0;
  const f=fixture(),s=new C.Session(f.adapter);await s.load(2);await s.change(['roles','周/韵~涵','affection'],35);await s.save();assert.equal(f.get().table.stat_data.roles['周/韵~涵'].affection,35);assert.deepEqual(f.get().table.external,{keep:1});assert.deepEqual(f.get().table.initialized_lorebooks,{book:[]});count++;
  await s.revert();assert.equal(f.get().table.stat_data.roles['周/韵~涵'].affection,3);count++;
  const ex=C.exportData(s.base);assert(!('message_text' in ex.source));assert.deepEqual(C.readImport(JSON.stringify(ex)).stat,s.draft);count++;
  await s.import('{"system":{"points":200}}');assert.equal(s.draft.system.points,200);assert(s.draft.roles);assert.equal(f.get().table.stat_data.system.points,70);await s.save();count++;
  await s.import('{"stat_data":{"only":1}}','replace');assert.deepEqual(s.draft,{only:1});await s.save();assert.equal(f.get().table.external.keep,1);count++;
  const z=fixture(),h=new C.Session(z.adapter);await h.load(0);await assert.rejects(()=>h.change(['system','points'],100),/历史/);assert.equal(z.writes(),0);count++;
  for(const [key,value]of [['chat_id','b'],['message_id',3],['swipe_id',1],['message_text','regenerated']]){const f=fixture(),s=new C.Session(f.adapter);await s.load(2);await s.change(['system','points'],2);f.mutate(v=>v.token[key]=value);await assert.rejects(()=>s.save());assert.equal(f.writes(),0);count++;}
  {const f=fixture(),s=new C.Session(f.adapter);await s.load(2);await s.change(['system','points'],2);f.mutate(v=>v.table.external.keep=5);await assert.rejects(()=>s.save(),/冲突/);assert.equal(f.writes(),0);count++;}
  {const f=fixture(),s=new C.Session(f.adapter);await s.load(2);f.busy(true);await s.change(['system','points'],1);await s.import('{"system":{"points":2}}');assert.equal(s.draft.system.points,2);await assert.rejects(()=>s.save(),/更新/);assert.equal(f.writes(),0);f.busy(false);await s.save();assert.equal(f.writes(),1);count++;}
  {const f=fixture(),s=new C.Session(f.adapter);await s.load(2);await s.change(['system','points'],3);await s.save();f.mutate(v=>v.table.stat_data.system.points=4);await assert.rejects(()=>s.revert(),/冲突/);assert.equal(f.get().table.stat_data.system.points,4);count++;}
  assert.throws(()=>C.readImport('{"__proto__":{"polluted":true}}'),/字段/);assert.throws(()=>C.readImport('{broken'),/JSON/);assert.throws(()=>C.readImport('[1,2]'),/对象/);assert.throws(()=>C.readImport('{"format":"mvu-viewer-export","version":4}'),/版本/);count+=4;
  const ptr=C.pointer(['roles','周/韵~涵','affection']);assert.deepEqual(C.parsePath(ptr),['roles','周/韵~涵','affection']);assert.deepEqual(C.edit({a:[1,2]},['a','0'],null,true),{a:[2]});count+=2;
  assert.equal(C.lookup({x:0},['x']).value,0);assert.equal(C.lookup({},['x']).exists,false);assert.equal(C.lookup({x:null},['x']).value,null);assert.deepEqual(C.sections({foo:{unknown:1}},'all')[0].path,['foo']);count+=2;
  {const f=fixture();f.adapter.read=async id=>({token:{chat_id:'a',message_id:id},table:{}});const s=new C.Session(f.adapter);await assert.rejects(()=>s.load(2),/没有/);count++;}
  console.log(`PASS：${count} 组数据与事务检查`);
})().catch(e=>{console.error(e);process.exitCode=1;});
