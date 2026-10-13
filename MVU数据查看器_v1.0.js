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
  if(typeof module==='object'&&module.exports)module.exports=api;else root.MvuViewerCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);

(function(root){
  'use strict';
  function mount(host,C,adapter,options={}){
    const doc=host.ownerDocument,win=doc.defaultView,shadow=host.attachShadow({mode:'open'}),session=new C.Session(adapter);
    let module='roles',view='overview',query='',previous=null,previousId=null,editor=null,disposed=false,editable=false,loadSeq=0,lastFocus=null;
    const expanded=new Set();
    function el(tag,text,cls){const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
    function button(text,fn,cls){const n=el('button',text,cls);n.type='button';n.onclick=()=>Promise.resolve().then(fn).catch(error);return n;}
    function error(e){status.textContent=e.message||String(e);status.className='status error';}
    function note(s){status.textContent=s;status.className='status';}
    const css=el('style');css.textContent=`
      :host{font-family:system-ui,"Microsoft YaHei",sans-serif;font-size:14px;color:#253342;color-scheme:light;--border:#dfe6ed;--accent:#275f8a}
      *{box-sizing:border-box}button,input,select,textarea{font:inherit}button{cursor:pointer;border:1px solid var(--border);background:#fff;border-radius:7px;padding:8px 11px;color:inherit;min-height:38px}button:hover{background:#edf4fa}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #2d77ae;outline-offset:2px}.accent{background:var(--accent);color:white;border-color:var(--accent)}.accent:hover{background:#1f5078}
      .backdrop{position:fixed;inset:0;background:#182c4055;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:22px}.panel{width:min(100%,940px);height:min(860px,92dvh);background:#f8fafc;border:1px solid var(--border);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 60px #15273830;min-width:0}
      header{background:white;padding:15px 18px 10px;border-bottom:1px solid var(--border)}.heading{display:flex;align-items:center;gap:10px}.heading h1{font-size:18px;margin:0;flex:1}.badge{font-size:12px;color:#5e7080}.identity{font-size:12px;color:#647789;margin:6px 0;overflow-wrap:anywhere}.toolbar{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.toolbar input{flex:1;min-width:120px}.toolbar select{max-width:240px}.toolbar input,.toolbar select{border:1px solid var(--border);padding:8px;border-radius:7px;background:white;min-height:38px;min-width:0}.tabs{display:flex;gap:5px;overflow:auto;padding:9px 14px;background:white;flex-shrink:0}.tabs button{white-space:nowrap;border-color:transparent;padding:6px 10px}.tabs button.active{background:#e7f0f8;color:#185780;border-color:#c7ddeb;font-weight:600}.status{margin:0;padding:8px 18px;font-size:12px;color:#507187;background:#eef5fa;overflow-wrap:anywhere}.status.error{color:#972b2b;background:#fff0ee}.views{display:flex;gap:6px;padding:8px 16px;border-bottom:1px solid var(--border);align-items:center}.views button{padding:5px 10px;min-height:34px}.views .active{border-color:#8eb7d5;background:#edf5fb}.views .spacer{flex:1}
      main{overflow:auto;flex:1;min-height:0;padding:12px 18px}.group{margin-bottom:10px;border:1px solid var(--border);border-radius:8px;background:white;overflow:hidden}.group h2{font-size:14px;margin:0;padding:10px 12px;background:#f0f4f8;overflow-wrap:anywhere}.row{display:grid;grid-template-columns:minmax(100px,30%) minmax(0,1fr) auto;gap:10px;align-items:start;padding:8px 12px;border-top:1px solid #edf1f5;min-width:0}.key{color:#627585;overflow-wrap:anywhere;font-size:13px}.value{min-width:0;white-space:pre-wrap;overflow-wrap:anywhere}.row button{padding:3px 8px;min-height:28px;font-size:12px}.type{font-size:11px;color:#81909e;margin-left:5px}.empty{color:#738494;padding:24px 0;text-align:center}.details{border-top:1px solid #edf1f5}.details summary{padding:9px 12px;cursor:pointer;overflow-wrap:anywhere;list-style-position:inside;color:#324c62}.details summary .count{font-size:12px;color:#718698}.nested{padding-left:9px;border-left:2px solid #edf2f7;margin-left:10px}pre{font:12px/1.6 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}footer{padding:10px 18px;border-top:1px solid var(--border);background:white;display:flex;flex-wrap:wrap;gap:7px;align-items:center}.footnote{font-size:12px;color:#647789;flex:1}.dirty{color:#8b5821}.editmask{position:absolute;inset:0;background:#182c4070;display:flex;align-items:center;justify-content:center;padding:18px}.dialog{background:white;width:min(100%,620px);max-height:90%;overflow:auto;border-radius:12px;padding:18px;box-shadow:0 10px 40px #0003}.dialog h2{font-size:17px;margin:0 0 10px}.dialog label{display:block;color:#566c7e;font-size:13px;margin:10px 0 6px}.dialog textarea,.dialog input,.dialog select{width:100%;padding:9px;border:1px solid var(--border);border-radius:6px;min-width:0}.dialog textarea{min-height:130px;font:13px/1.5 ui-monospace,monospace;resize:vertical}.dialog .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}.dialog .hint{font-size:12px;color:#647789;overflow-wrap:anywhere}.dialog .error{font-size:13px;color:#a22;margin-top:10px}.diffrow{padding:10px 12px;border-top:1px solid #edf1f5}.diffrow .path{font-size:12px;color:#5f7487;overflow-wrap:anywhere;margin-bottom:5px}.before{color:#a03a38}.after{color:#216844}.diffval{display:grid;grid-template-columns:1fr 1fr;gap:12px;white-space:pre-wrap;overflow-wrap:anywhere}.panel{position:relative}
      @media(max-width:600px){.backdrop{padding:0}.panel{width:100%;height:100dvh;height:100svh;border:0;border-radius:0}header{padding:12px 12px 8px}.heading h1{font-size:17px}main{padding:10px}.tabs{padding:7px 8px}.status{padding:8px 12px}.toolbar select{max-width:none;flex:1}.toolbar input{flex-basis:100%}.row{padding:8px 9px;gap:7px;grid-template-columns:minmax(86px,31%) minmax(0,1fr) auto}.views{padding:7px 10px}footer{padding:9px 10px;padding-bottom:max(9px,env(safe-area-inset-bottom))}.editmask{padding:10px}.diffval{grid-template-columns:1fr}.dialog{padding:14px}.identity{margin:5px 0}.heading .badge{font-size:11px}}
    `;shadow.append(css);
    const backdrop=el('div',undefined,'backdrop'),panel=el('section',undefined,'panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','MVU 数据查看器');backdrop.append(panel);shadow.append(backdrop);
    const header=el('header'),heading=el('div',undefined,'heading');heading.append(el('h1','MVU 数据查看器'),el('span',options.demo?'演示数据 · v1.0':'v1.0','badge'),button('关闭',close));header.append(heading);
    const identity=el('div','尚未读取','identity');header.append(identity);
    const toolbar=el('div',undefined,'toolbar'),floor=el('select');floor.setAttribute('aria-label','选择楼层');floor.onchange=()=>load(Number(floor.value)).catch(error);
    const search=el('input');search.placeholder='搜索角色、字段或内容';search.setAttribute('aria-label','搜索数据');let searchTimer;
    search.oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{query=search.value.toLowerCase();render();},160);};
    toolbar.append(floor,button('最新楼',()=>load()),button('刷新',()=>load(session.base?.token.message_id)),search);header.append(toolbar);panel.append(header);
    const tabs=el('nav',undefined,'tabs');tabs.setAttribute('aria-label','数据模块');panel.append(tabs);
    const status=el('div','正在读取…','status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');panel.append(status);
    const views=el('div',undefined,'views');panel.append(views);
    const main=el('main');panel.append(main);const footer=el('footer');panel.append(footer);
    const fmt=v=>v===undefined?'未保存':v===null?'空值（null）':typeof v==='string'?(v===''?'空字符串':v):typeof v==='object'?JSON.stringify(v,null,2):String(v);
    function modal(title){if(editor)editor.remove();lastFocus=shadow.activeElement;const mask=el('div',undefined,'editmask'),dialog=el('div',undefined,'dialog');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label',title);dialog.append(el('h2',title));mask.append(dialog);panel.append(mask);editor=mask;return dialog;}
    function endModal(){editor?.remove();editor=null;lastFocus?.focus();}
    function dialogActions(d,items){const actions=el('div',undefined,'actions');for(const item of items)actions.append(item);d.append(actions);}
    function editField(path,existing=true){
      if(!editable)throw Error('只有最新楼层可编辑，请点击最新楼');const r=C.lookup(session.draft,path),d=modal(existing?'编辑字段':'新增字段');
      const pathInput=el('input');pathInput.value=C.pointer(path);pathInput.readOnly=existing;d.append(el('label','实际字段路径（JSON Pointer）'),pathInput);
      const type=el('select');for(const [v,t] of [['string','文字'],['number','数字'],['boolean','布尔值'],['null','空值'],['json','对象／列表 JSON']]){const o=el('option',t);o.value=v;type.append(o);}
      type.value=r.exists?(r.value===null?'null':typeof r.value==='object'?'json':typeof r.value):'string';
      const input=el('textarea');input.value=r.exists?(typeof r.value==='string'?r.value:JSON.stringify(r.value,null,2)):'';d.append(el('label','数据类型'),type,el('label','新值'),input);
      d.append(el('p',r.exists?'原值：'+fmt(r.value):'父路径必须已存在；数组通过下标新增。','hint'));const feedback=el('div','','error');d.append(feedback);
      const stage=button('加入修改',async()=>{try{let v;switch(type.value){case 'string':v=input.value;break;case 'number':if(!input.value.trim()||!Number.isFinite(Number(input.value)))throw Error('请输入有效数字');v=Number(input.value);break;case 'boolean':if(!['true','false'].includes(input.value.trim()))throw Error('布尔值请填写 true 或 false');v=input.value.trim()==='true';break;case 'null':v=null;break;default:v=JSON.parse(input.value);}await session.change(C.parsePath(pathInput.value),v);endModal();render();note('修改已加入草稿，尚未保存');}catch(e){feedback.textContent=e.message;}},'accent');
      const items=[button('取消',endModal)];if(existing)items.push(button('删除字段',async()=>{try{await session.change(path,null,true);endModal();render();note('删除已加入草稿，尚未保存');}catch(e){feedback.textContent=e.message;}}));items.push(stage);dialogActions(d,items);input.focus();
    }
    function valueRow(key,v,path){const row=el('div',undefined,'row'),name=el('div',C.label(key),'key');name.title=path?C.pointer(path):key;row.append(name,el('div',fmt(v),'value'));if(path)row.append(button('编辑',()=>editField(path)));else row.append(el('span'));if(path)row.lastChild.disabled=!editable||session.lock;return row;}
    function tree(key,v,path,parent,depth=0){
      if(depth>80){parent.append(el('p','嵌套过深，请查看原始 JSON'));return;}
      if(v===null||typeof v!=='object'){parent.append(valueRow(key,v,path));return;}
      const entries=Object.entries(v),details=el('details',undefined,'details'),id=C.pointer(path),summary=el('summary');summary.append(el('span',C.label(key)+' '),el('span',`${Array.isArray(v)?'列表':'对象'} · ${entries.length} 项`,'count'));details.append(summary);
      details.open=expanded.has(id);const box=el('div',undefined,'nested');let built=false;
      function build(){if(built)return;built=true;box.append(valueRow('完整值',v,path));if(!entries.length)box.append(el('p','空对象／空列表','empty'));for(const [k,val]of entries)tree(k,val,[...path,k],box,depth+1);}
      if(details.open)build();details.ontoggle=()=>{if(details.open){expanded.add(id);build();}else expanded.delete(id);};details.append(box);parent.append(details);
    }
    function diffView(changes,parent){if(!changes.length){parent.append(el('p','没有变化','empty'));return;}for(const row of changes){const item=el('div',undefined,'diffrow');item.append(el('div',row.kind+' · '+C.pointer(row.path),'path'));const vals=el('div',undefined,'diffval');vals.append(el('div','原：'+fmt(row.before),'before'),el('div','新：'+fmt(row.after),'after'));item.append(vals);parent.append(item);}}
    function matches(v,path=[]){const rows=[];const scan=(x,p)=>{const isBranch=x!==null&&typeof x==='object'&&Object.keys(x).length>0;if(!isBranch){if((C.pointer(p)+' '+p.map(C.label).join(' ')+' '+fmt(x)).toLowerCase().includes(query))rows.push({path:p,value:x});}else for(const [k,value]of Object.entries(x))scan(value,[...p,k]);};scan(v,path);return rows;}
    function render(){
      const oldScroll=main.scrollTop;tabs.replaceChildren();for(const [id,name]of C.modules){const b=button(name,()=>{module=id;render();main.scrollTop=0;},module===id?'active':'');b.setAttribute('aria-pressed',String(module===id));tabs.append(b);}
      views.replaceChildren();for(const [id,name]of [['overview','概览'],['changes','本轮变化'],['raw','原始数据']])views.append(button(name,()=>{view=id;render();},view===id?'active':''));views.append(el('span','','spacer'));const add=button('新增字段',()=>editField(['新字段'],false));add.disabled=!editable||!session.base||session.lock;views.append(add);
      main.replaceChildren();footer.replaceChildren();
      if(!session.base){main.append(el('p','没有读取到可用数据，请刷新或选择其他楼层。','empty'));main.scrollTop=0;return;}
      if(view==='raw'){const raw=C.clone(session.base.table);raw.stat_data=C.clone(session.draft);main.append(el('p','完整变量表；stat_data 中包含未保存草稿。导出始终读取实际保存值。','identity'),el('pre',JSON.stringify(raw,null,2)));}
      else if(view==='changes'){main.append(el('p',previousId===null?'没有可比较的上一份 AI 楼数据':`与 #${previousId} AI 楼实际数据比较；包含当前草稿`,'identity'));if(previous)diffView(C.diff(previous,session.draft),main);}
      else if(query){const found=matches(session.draft);main.append(el('p',`搜索全部实际数据 · ${found.length} 项`,'identity'));for(const r of found){const box=el('div',undefined,'group');box.append(el('h2',C.pointer(r.path)),valueRow(r.path.at(-1),r.value,r.path));main.append(box);}if(!found.length)main.append(el('p','没有匹配字段','empty'));}
      else{const sections=C.sections(session.draft,module);if(!sections.length)main.append(el('p','此模块没有已保存数据；可到“全部字段”查看其他结构。','empty'));for(const section of sections){const group=el('section',undefined,'group');group.append(el('h2',section.name));const v=section.value;if(v!==null&&typeof v==='object'){if(!Object.keys(v).length)group.append(valueRow('当前值',v,section.path));for(const [k,value]of Object.entries(v))tree(k,value,[...section.path,k],group);}else group.append(valueRow(section.path.at(-1),v,section.path));main.append(group);}if(module==='claimed')main.prepend(el('p','这里展示实际奖励账本；不会自行生成成就或重算奖励。','identity'));}
      const count=session.changes().length;footer.append(el('span',`${editable?'最新楼 · 可编辑':'历史楼 · 只读'}${count?' · '+count+' 项待保存':''}`,count?'footnote dirty':'footnote'));
      footer.append(button('导出',exportFile),button('复制 JSON',copy));const imp=button('导入',importDialog);imp.disabled=!editable||session.lock;footer.append(imp);
      const undo=button('撤销上次保存',async()=>{await session.revert();await recalc();render();note('已撤销并重新读取核对');});undo.disabled=!editable||!session.undo||count>0||session.lock;footer.append(undo);
      if(count){const cancel=button('取消修改',()=>{session.draft=C.clone(session.base.table.stat_data);render();note('已取消草稿');});cancel.disabled=session.lock;footer.append(cancel);const save=button('保存修改',reviewSave,'accent');save.disabled=!editable||session.lock;footer.append(save);}main.scrollTop=oldScroll;
    }
    async function recalc(){editable=false;if(session.base)try{await session.assertEditable();editable=true;}catch(_){} }
    async function load(id){
      if(session.changes().length){if(!win.confirm('有未保存修改，刷新或切换楼层将丢弃草稿。继续吗？'))return;}
      const seq=++loadSeq;note('正在读取…');editable=false;
      try{const list=await adapter.list();if(seq!==loadSeq)return;floor.replaceChildren();for(const m of list.slice().reverse()){const o=el('option',`#${m.message_id} · ${{assistant:'AI',user:'用户',system:'系统'}[m.role]||m.role} · ${m.name}`);o.value=String(m.message_id);floor.append(o);}if(id===undefined)id=(await adapter.latest()).message_id;
        await session.load(id);if(seq!==loadSeq)return;floor.value=String(id);previous=null;previousId=null;
        for(let i=list.length-1;i>=0;i--){const m=list[i];if(m.message_id>=id||m.role!=='assistant')continue;try{const old=await adapter.read(m.message_id);if(C.object(old.table.stat_data)){previous=C.clone(old.table.stat_data);previousId=m.message_id;break;}}catch(_){}}
        await recalc();identity.textContent=`${session.base.token.chat_id||'当前聊天'} · #${id} · 消息页 ${(session.base.token.swipe_id||0)+1} · ${new TextEncoder().encode(JSON.stringify(session.base.table)).length.toLocaleString()} 字节`;
        note(`读取成功 · ${new Date().toLocaleTimeString()} · ${editable?'可编辑最新楼层':'只读（历史楼或更新中）'}`);render();
      }catch(e){if(seq!==loadSeq)return;session.base=null;session.draft=null;previous=null;render();identity.textContent='未读取到数据';error(e);}
    }
    async function exportFile(){if(!session.base)throw Error('请先读取数据');const snapshot=await adapter.read(session.base.token.message_id);if(!C.equal(snapshot.token,session.base.token))throw Error('消息来源变化，请刷新后导出');download(JSON.stringify(C.exportData(snapshot),null,2),`MVU_楼层${snapshot.token.message_id}_${Date.now()}.json`);note('已导出所选楼层的实际保存数据');}
    function download(text,name){const url=win.URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'})),a=el('a');a.href=url;a.download=name;shadow.append(a);a.click();a.remove();const t=setTimeout(()=>{win.URL.revokeObjectURL(url);urls.delete(url);timers.delete(t);},10000);urls.add(url);timers.add(t);}
    async function copy(){if(!session.base)throw Error('请先读取数据');const snapshot=await adapter.read(session.base.token.message_id);if(!C.equal(snapshot.token,session.base.token))throw Error('消息来源变化，请刷新');const text=JSON.stringify(C.exportData(snapshot),null,2);try{await win.navigator.clipboard.writeText(text);note('已复制实际保存数据');}catch(_){const d=modal('复制数据'),area=el('textarea');area.value=text;area.readOnly=true;d.append(el('p','浏览器未允许自动复制，请全选下方内容手动复制。','hint'),area);dialogActions(d,[button('关闭',endModal)]);area.focus();area.select();}}
    function importDialog(){if(!editable)throw Error('只有最新楼层可导入');const d=modal('导入 MVU 数据'),file=el('input');file.type='file';file.accept='.json,application/json';const area=el('textarea');area.placeholder='选择 JSON 文件，或粘贴数据';const mode=el('select');for(const [v,t]of [['merge','合并：保留未提供字段'],['replace','替换：删除未提供的实际字段']]){const o=el('option',t);o.value=v;mode.append(o);}const feedback=el('div','','error');file.onchange=async()=>{try{const f=file.files[0];if(f){if(f.size>20*1024*1024)throw Error('文件超过 20 MB');area.value=await f.text();}}catch(e){feedback.textContent=e.message;}};
      d.append(el('p','只导入实际数据 stat_data，保留当前消息的 MVU 元信息及其他脚本字段。不执行奖励、扣点或任务结算。','hint'),file,el('label','JSON 内容'),area,el('label','导入方式'),mode,feedback);
      dialogActions(d,[button('取消',endModal),button('预览差异',async()=>{try{const info=await session.import(area.value,mode.value);endModal();render();note(info.source?'已读取备份；将应用到当前最新楼，尚未保存':'导入已加入草稿，尚未保存');reviewSave();}catch(e){feedback.textContent=e.message;}},'accent')]);area.focus();
    }
    async function reviewSave(){await session.assertEditable();const changes=session.changes();if(!changes.length){note('没有待保存修改');return;}const d=modal('核对并保存修改');d.append(el('p',`将修改最新楼 #${session.base.token.message_id}，共 ${changes.length} 项。不自动执行游戏结算。`,'hint'));diffView(changes,d);const feedback=el('div','','error');d.append(feedback);const commit=button('确认保存',async()=>{commit.disabled=true;try{await session.save();endModal();await recalc();render();note('保存成功，已重新读取核对。刷新酒馆后可再次确认持久化。');}catch(e){feedback.textContent=e.message;commit.disabled=false;await recalc();render();}},'accent');dialogActions(d,[button('返回编辑',endModal),commit]);commit.focus();}
    const urls=new Set(),timers=new Set();
    function close(){if(session.lock){note('正在保存，请稍后关闭');return;}if(session.changes().length&&!win.confirm('关闭将丢弃未保存草稿，继续吗？'))return;host.hidden=true;endModal();options.onClose?.();}
    function focusTrap(e){if(e.key==='Escape'){e.preventDefault();if(editor)endModal();else close();}if(e.key==='Tab'){const container=editor||panel;const nodes=[...container.querySelectorAll('button,input,select,textarea,a[href],summary')].filter(n=>!n.disabled&&n.getClientRects().length);if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1),active=shadow.activeElement;if(e.shiftKey&&active===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&active===last){e.preventDefault();first.focus();}}}
    shadow.addEventListener('keydown',focusTrap);
    const stop=adapter.subscribe?.(async()=>{if(disposed)return;await recalc();render();if(session.base&&!editable)note('当前数据来源或更新状态已变化；保存将重新校验，请刷新到最新楼。');});
    return {session,shadow,open:async()=>{host.hidden=false;await load();search.focus();},dispose:()=>{disposed=true;stop?.();clearTimeout(searchTimer);for(const t of timers)clearTimeout(t);for(const url of urls)win.URL.revokeObjectURL(url);shadow.removeEventListener('keydown',focusTrap);host.remove();},load};
  }
  root.MvuViewerUI={mount};
})(globalThis);

(function(){
  'use strict';
  if(typeof window==='undefined')return;
  const C=globalThis.MvuViewerCore;
  const H={messages:typeof getChatMessages==='function'?getChatMessages:null,update:typeof updateVariablesWith==='function'?updateVariablesWith:null,
    event:typeof eventOn==='function'?eventOn:null,button:typeof getButtonEvent==='function'?getButtonEvent:null,
    append:typeof appendInexistentScriptButtons==='function'?appendInexistentScriptButtons:null,
    tv:typeof tavern_events!=='undefined'?tavern_events:{},iv:typeof iframe_events!=='undefined'?iframe_events:{}};
  let target;try{target=window.parent;void target.document.body;}catch(_){target=window;}
  const KEY='__tw_mvu_viewer_v1__';target[KEY]?.dispose?.();
  let generating=false,updating=false,disposed=false,mvuBound=null;
  const disposers=[],listeners=new Set();
  function signal(){for(const f of listeners)Promise.resolve(f()).catch(()=>{});}
  function listen(name,callback){if(!name||!H.event)return;const d=H.event(name,callback);if(d?.stop)disposers.push(()=>d.stop());}
  function mvu(){const v=(typeof Mvu!=='undefined'?Mvu:null)||target.Mvu;if(!v||typeof v.getMvuData!=='function')throw Error('MVU 未就绪，请确认变量框架已启用，再点击刷新');return v;}
  function context(){const st=target.SillyTavern||window.SillyTavern;if(!st||typeof st.getContext!=='function')throw Error('未提供 SillyTavern 聊天身份接口，禁止写入');return st.getContext();}
  function requireHelper(){if(!H.messages)throw Error('酒馆助手消息读取接口不可用');}
  function token(id){requireHelper();const message=H.messages(id,{include_swipes:true})[0];if(!message)throw Error('消息楼层不存在');const ctx=context();
    const chatId=ctx.chatId;if(chatId===undefined||chatId===null||chatId==='')throw Error('当前没有可识别的聊天');
    return {chat_id:String(chatId),character_id:String(ctx.characterId??''),group_id:String(ctx.groupId??''),message_id:message.message_id,swipe_id:message.swipe_id??0,message_text:(message.swipes||[])[message.swipe_id??0]||''};
  }
  const adapter={
    busy:()=>generating||updating,
    latest:()=>token(-1),
    list:()=>{requireHelper();return H.messages('0-{{lastMessageId}}').map(({message_id,role,name})=>({message_id,role,name}));},
    read:async id=>{const t=token(id);const table=C.clone(mvu().getMvuData({type:'message',message_id:t.message_id}));return {token:t,table};},
    commit:async(base,stat)=>{
      if(!H.update)throw Error('酒馆助手更新接口不可用');if(adapter.busy())throw Error('正在生成或更新，禁止保存');
      if(!C.equal(token(-1),base.token))throw Error('最新楼层或消息页已变化，请刷新');
      // 固定 helper 快照中的同步 updater 在同一 JS 任务内检查并写入。
      await H.update(table=>{if(adapter.busy()||!C.equal(token(-1),base.token)||!C.equal(table,base.table))throw Error('保存冲突：数据已变化，请刷新后重改');
        const next=C.clone(table);next.stat_data=C.clone(stat);return next;
      },{type:'message',message_id:base.token.message_id});
      if(!C.equal(token(-1),base.token))throw Error('写入期间聊天发生变化，请检查实际数据');
    },
    subscribe:f=>{listeners.add(f);return()=>listeners.delete(f);}
  };
  const host=target.document.createElement('div');host.id='tw-mvu-viewer-v1';host.hidden=true;target.document.body.append(host);
  const app=globalThis.MvuViewerUI.mount(host,C,adapter);
  const launch=target.document.createElement('button');launch.type='button';launch.textContent='MVU 数据';launch.setAttribute('aria-label','打开 MVU 数据查看器');
  Object.assign(launch.style,{position:'fixed',right:'12px',bottom:'calc(80px + env(safe-area-inset-bottom))',zIndex:'2147482000',border:'1px solid #cbd9e5',borderRadius:'8px',padding:'9px 12px',fontSize:'13px',background:'#f4f8fc',color:'#275f8a',boxShadow:'0 2px 10px #0002'});
  function open(){app.open().catch(e=>{host.hidden=false;const s=app.shadow.querySelector('.status');s.textContent=e.message;s.className='status error';});}
  launch.onclick=open;target.document.body.append(launch);
  if(H.append&&H.button&&H.event){H.append([{name:'MVU 数据',visible:true}]);listen(H.button('MVU 数据'),open);}
  for(const k of ['CHAT_CHANGED','MESSAGE_SWIPED','MESSAGE_SENT','MESSAGE_RECEIVED','MESSAGE_DELETED','MESSAGE_UPDATED','MESSAGE_EDITED'])listen(H.tv[k],signal);
  listen(H.tv.GENERATION_STARTED,()=>{generating=true;signal();});listen(H.tv.GENERATION_ENDED,()=>{generating=false;signal();});listen(H.tv.GENERATION_STOPPED,()=>{generating=false;updating=false;signal();});
  // 不复制事件字符串；使用实际安装导出的常量。
  const poll=setInterval(()=>{try{const v=mvu();if(v===mvuBound)return;mvuBound=v;listen(v.events?.VARIABLE_UPDATE_STARTED,()=>{updating=true;signal();});listen(v.events?.VARIABLE_UPDATE_ENDED,()=>{updating=false;setTimeout(signal,120);});}catch(_){}},1000);
  const api={open,dispose(){if(disposed)return;disposed=true;clearInterval(poll);for(const f of disposers)f();listeners.clear();app.dispose();launch.remove();window.removeEventListener('pagehide',api.dispose);if(target[KEY]===api)delete target[KEY];}};
  target[KEY]=api;window.addEventListener('pagehide',api.dispose);
})();
