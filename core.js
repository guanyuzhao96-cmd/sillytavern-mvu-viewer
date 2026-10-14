(function (root) {
  'use strict';
  const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const clone=v=>JSON.parse(JSON.stringify(v));
  const forbidden=new Set(['__proto__','constructor','prototype']);
  function validate(v,depth=0) {
    if(depth>80)throw Error('数据嵌套超过 80 层');
    if(v===null||typeof v==='string'||typeof v==='boolean')return;
    if(typeof v==='number'&&Number.isFinite(v))return;
    if(typeof v!=='object')throw Error('只支持 JSON 数据');
    for(const k of Object.keys(v)){if(forbidden.has(k))throw Error('不允许的字段名：'+k);validate(v[k],depth+1);}
  }
  function stable(v){if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v);}
  const equal=(a,b)=>stable(a)===stable(b);
  const encode=k=>String(k).replace(/~/g,'~0').replace(/\//g,'~1');
  const pointer=p=>'/'+p.map(encode).join('/');
  function parsePath(s){if(!s.startsWith('/'))throw Error('路径必须以 / 开头');const p=s.slice(1).split('/').map(x=>x.replace(/~1/g,'/').replace(/~0/g,'~'));if(p.some(k=>forbidden.has(k)))throw Error('不允许的字段路径');return p;}
  function lookup(v,path){for(const k of path){if(v===null||typeof v!=='object'||!own(v,k))return {exists:false};v=v[k];}return {exists:true,value:v};}
  function edit(v,path,value,remove=false){
    if(!path.length)throw Error('不可删除或直接编辑数据根节点');
    validate(value===undefined?null:value);const out=clone(v);let parent=out;
    for(const k of path.slice(0,-1)){if(forbidden.has(k)||!own(parent,k)||parent[k]===null||typeof parent[k]!=='object')throw Error('父路径不存在，请先创建对象');parent=parent[k];}
    const k=path.at(-1);if(forbidden.has(k))throw Error('不允许的字段名');
    if(Array.isArray(parent)){if(!/^(0|[1-9]\d*)$/.test(k)||Number(k)>parent.length)throw Error('数组下标无效');if(remove){if(Number(k)>=parent.length)throw Error('字段不存在');parent.splice(Number(k),1);}else parent[Number(k)]=clone(value);}
    else if(remove){if(!own(parent,k))throw Error('字段不存在');delete parent[k];}else parent[k]=clone(value);
    return out;
  }
  function diff(a,b,path=[],result=[]){
    if(equal(a,b))return result;
    if(object(a)&&object(b)){for(const k of new Set([...Object.keys(a),...Object.keys(b)])){
      if(!own(a,k))result.push({kind:'新增',path:[...path,k],after:b[k]});
      else if(!own(b,k))result.push({kind:'删除',path:[...path,k],before:a[k]});
      else diff(a[k],b[k],[...path,k],result);
    }}else result.push({kind:'修改',path,before:a,after:b});return result;
  }
  function merge(a,b){if(!object(a)||!object(b))return clone(b);const out=clone(a);for(const k of Object.keys(b))out[k]=object(out[k])&&object(b[k])?merge(out[k],b[k]):clone(b[k]);return out;}
  function readImport(text){
    if(new TextEncoder().encode(text).length>20*1024*1024)throw Error('导入文件超过 20 MB');
    let raw;try{raw=JSON.parse(text);}catch(e){throw Error('JSON 格式错误：'+e.message);}validate(raw);if(!object(raw))throw Error('导入根节点必须为对象');
    let data,source=null;
    if(raw.format==='mvu-viewer-export'){if(raw.version!==1||!object(raw.data)||!object(raw.data.stat_data))throw Error('导出格式版本或数据结构不支持');data=raw.data.stat_data;source=raw.source;}
    else data=own(raw,'stat_data')?raw.stat_data:raw;
    if(!object(data))throw Error('stat_data 必须为对象');
    return {stat:clone(data),source};
  }
  function exportData(snapshot){const source=clone(snapshot.token);delete source.message_text;return {format:'mvu-viewer-export',version:1,exported_at:new Date().toISOString(),source,data:clone(snapshot.table)};}
  class Session {
    constructor(adapter){this.a=adapter;this.base=null;this.draft=null;this.undo=null;this.lock=false;this.epoch=0;}
    async load(id){if(this.lock)throw Error('正在保存，请稍后');const epoch=++this.epoch;const s=await this.a.read(id);if(epoch!==this.epoch)throw Error('读取请求已被更新的请求替代');if(!object(s.table)||!object(s.table.stat_data))throw Error('该楼层没有可用的 MVU stat_data');validate(s.table);this.base=clone(s);this.draft=clone(s.table.stat_data);return this.base;}
    changes(){return this.base?diff(this.base.table.stat_data,this.draft):[];}
    async assertEditable(){if(!this.base)throw Error('请先读取数据');const latest=await this.a.latest();if(!equal(latest,this.base.token))throw Error('聊天、最新楼层或消息页已变化，请刷新；历史楼层不可编辑');if(this.a.busy())throw Error('正在生成或更新变量，请完成后刷新');return latest;}
    async change(path,value,remove=false){await this.assertEditable();this.draft=edit(this.draft,path,value,remove);}
    async import(text,mode='merge'){await this.assertEditable();const data=readImport(text);this.draft=mode==='replace'?clone(data.stat):merge(this.draft,data.stat);return data;}
    async save(){
      if(this.lock)throw Error('正在保存');this.lock=true;let written=false;
      try{await this.assertEditable();if(!this.changes().length)throw Error('没有待保存修改');validate(this.draft);const before=clone(this.base);const desired=clone(this.draft);
        await this.a.commit(before,desired);written=true;
        const actual=await this.a.read(before.token.message_id);
        if(!equal(actual.token,before.token)||!equal(actual.table.stat_data,desired))throw Error('写入后核对不一致，请刷新查看实际值；不要重复保存');
        this.undo={before,after:clone(actual)};this.base=clone(actual);this.draft=clone(actual.table.stat_data);return actual;
      }catch(e){if(written){this.base=null;this.draft=null;this.undo=null;}throw e;}finally{this.lock=false;}
    }
    async revert(){
      if(this.lock)throw Error('正在保存');if(!this.undo)throw Error('没有可撤销记录');if(this.changes().length)throw Error('请先取消未保存修改');const u=clone(this.undo);this.lock=true;
      try{await this.assertEditable();await this.a.commit(u.after,u.before.table.stat_data);const actual=await this.a.read(u.after.token.message_id);if(!equal(actual.token,u.after.token)||!equal(actual.table.stat_data,u.before.table.stat_data))throw Error('撤销后核对不一致，请刷新');this.base=clone(actual);this.draft=clone(actual.table.stat_data);this.undo=null;}finally{this.lock=false;}
    }
  }
  const labels={stat_data:'实际数据',display_data:'MVU 显示数据',delta_data:'MVU 变化数据',initialized_lorebooks:'初始化世界书',roles:'角色',scene:'场景',system:'系统',quests:'任务',events:'事件',gallery:'图鉴',forum:'论坛',points:'系统点',mp:'精神力',current:'当前值',max:'上限',skills:'技能',inventory:'持有物品',shop_level:'商店等级',role_name:'姓名',grade:'角色等级',relationship:'关系',affection:'好感度',romanceStatus:'恋爱状态',approachStage:'当前攻略阶段',currentGoal:'当前目标',goalProgress:'目标进度',currentMoodOrDesire:'心情与愿望',shortTermGoal:'短期目标',longTermGoal:'长期目标',date:'日期',time:'时间',location:'地点',present_role_ids:'在场角色 ID',interacting_role_ids:'互动角色 ID',active_role_id:'主要互动角色',present_role_names:'角色姓名映射',present_state:'在场状态',display:'角色显示资料',clothing:'衣着',hair:'发型',affection_reason:'好感变化原因',affection_delta:'好感变化值',affection_initial:'初始好感',recent_results:'近期结果',new_quest_ids:'新任务 ID',chat_notices:'聊天提示',goal:'任务目标',condition:'达成条件',difficulty:'难度',reward:'系统点奖励',affection_reward:'好感奖励',affection_received:'实际好感到账',reward_policy:'奖励规则版本',approach_stage:'关联攻略阶段',progress:'当前进度',progress_evidence:'进展依据',status:'状态',settled:'已结算',role_id:'目标角色 ID',collected:'已收录角色',claimed:'已领取奖励',snapshot:'首次收录资料',name:'名称',age:'年龄',height:'身高',cup:'罩杯',beauty:'颜值',rank:'校花榜',tags:'标签',collected_at:'收录日期',pending:'待处理事件',processed:'已处理事件',results:'处理结果',mind_read:'读心术',appraise:'鉴定术',foresee:'预知术',hypnotize:'催眠术',last_recovery_day:'上次恢复日期',count:'数量',level:'等级',type:'类型',reason:'原因',success:'成功',title:'标题',evidence:'依据',outcome:'结果',amount:'数额',target:'目标',brief:'中文简报',hotspots:'热点',unlocked:'已解锁',executor:'执行者',progress_updated_day:'进度更新日期',created_day:'创建日期',deadline:'截止日期',reward_received:'实际点数到账'};
  const label=k=>labels[k]||k;
  const modules=[['roles','角色状态'],['scene','场景状态'],['quests','任务'],['system','系统与技能'],['inventory','商店与物品'],['gallery','图鉴'],['claimed','成就与奖励'],['events','事件与结果'],['forum','论坛'],['all','全部字段']];
  function sections(stat,module){
    const found=[];const add=(name,path)=>{const r=lookup(stat,path);if(r.exists)found.push({name,path,value:r.value});};
    if(module==='all'){for(const k of Object.keys(stat))add(label(k),[k]);}
    else if(module==='roles'){for(const [id,r] of Object.entries(stat.roles||{})){if(id.startsWith('$'))continue;add((r&&r.role_name)||id,['roles',id]);add('显示资料 · '+id,['scene','display',id]);}add('角色元信息',['roles','$meta']);}
    else if(module==='quests'){for(const [id,r] of Object.entries(stat.roles||{}))if(r&&own(r,'quests'))add(((r.role_name)||id)+' · 任务',['roles',id,'quests']);add('全局任务（若存在）',['quests']);}
    else if(module==='inventory'){add('商店等级',['system','shop_level']);add('持有物品',['system','inventory']);add('商店数据',['shop']);add('购买记录',['purchases']);}
    else if(module==='gallery'){add('收录角色与固定快照',['gallery','collected']);}
    else if(module==='claimed'){add('已结算奖励账本',['gallery','claimed']);add('其他成就数据',['achievements']);}
    else if(module==='system'){for(const k of Object.keys(stat.system||{}))if(k!=='inventory')add(label(k),['system',k]);}
    else add(label(module),[module]);
    return found;
  }
  const api={own,object,clone,validate,equal,stable,pointer,parsePath,lookup,edit,diff,merge,readImport,exportData,Session,label,modules,sections};
  root.MvuViewerCore=api;
  if(typeof window==='undefined'&&typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
