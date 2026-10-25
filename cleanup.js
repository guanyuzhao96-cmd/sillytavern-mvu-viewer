(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
// Normalize the helper's optional fields and repair legacy out-of-range swipe IDs
// from the host's displayed text and original per-page metadata, without writing.
function normalizeMessages(messages,rawChat){
 return clone(messages).map(m=>{
  const raw=rawChat?.[m.message_id];
  if(raw&&Array.isArray(m.swipes)){
   const index=Number(raw.swipe_id??0);
   if(!Number.isInteger(index)||index<0||index>=m.swipes.length){
    if(typeof raw.mes!=='string')throw Error(`消息 ${m.message_id} 缺少当前正文，无法安全修复消息页`);
    const matches=m.swipes.map((text,i)=>text===raw.mes?i:-1).filter(i=>i>=0);
    const active=matches.length===1?matches[0]:m.swipes.length;
    if(active===m.swipes.length)m.swipes.push(raw.mes);
    for(const [key,source] of [['swipes_data','variables'],['swipes_info','swipe_info']]){
     const original=raw[source];m[key]=Array.from({length:m.swipes.length},(_,i)=>clone(original?.[i]??m[key]?.[i]??{}));
     // The invalid selected slot can hold newer variables than the matching text slot.
     m[key][active]=clone(original?.[index]??(key==='swipes_info'?raw.extra:undefined)??m[key][active]??{});
    }
    m.swipe_id=active;
   }
  }
  return m;
 });
}
function cleanText(text,rules){
 let value=text,count=0;
 for(const rule of rules){
  if(rule.enabled===false)continue;
  if(typeof rule.start!=='string'||!rule.start)throw Error('每条规则必须填写起始字符或待删除文字');
  if(rule.mode==='text'){const parts=value.split(rule.start);count+=parts.length-1;value=parts.join('');continue;}
  if(typeof rule.end!=='string'||!rule.end||rule.start===rule.end)throw Error('整段规则需要不同的起始和结束字符');
  let pos=0,out='';
  while(pos<value.length){const begin=value.indexOf(rule.start,pos);if(begin<0){out+=value.slice(pos);break;}
   let cursor=begin+rule.start.length,depth=1,finish=-1;
   while(depth){const next=value.indexOf(rule.start,cursor),end=value.indexOf(rule.end,cursor);if(end<0)break;
    if(next>=0&&next<end){depth++;cursor=next+rule.start.length;}else{depth--;cursor=end+rule.end.length;if(!depth)finish=cursor;}}
   if(finish<0){out+=value.slice(pos);break;}out+=value.slice(pos,begin);count++;pos=finish;
  }
  value=out;
 }
 return {text:value,count};
}
function plan(messages,settings){
 const keep=Number(settings.keep);if(!Number.isInteger(keep)||keep<1)throw Error('至少保留最近 1 楼，最新楼不清理');
 const cutoff=Math.max(0,messages.length-keep),changes=[];let count=0,bytes=0;
 for(const message of messages.slice(0,cutoff)){
  if(settings.aiOnly&&message.role!=='assistant')continue;
  const swipes=message.swipes;if(!Array.isArray(swipes)||!swipes.every(s=>typeof s==='string'))throw Error('消息页格式不兼容，已停止扫描');
  const next=swipes.map(text=>{const result=cleanText(text,settings.rules);count+=result.count;return result.text;});
  if(next.some((text,i)=>text!==swipes[i])){bytes+=new TextEncoder().encode(JSON.stringify(swipes)).length-new TextEncoder().encode(JSON.stringify(next)).length;changes.push({message_id:message.message_id,swipes:next});}
 }
 return {changes,count,bytes};
}
function planLatestSnapshot(messages){
 let latest=null,hasData=false;
 for(let i=messages.length-1;i>=0;i--){const m=messages[i],data=m?.swipes_data,swipes=m?.swipes;if(!Array.isArray(data))continue;if(!Array.isArray(swipes))throw Error(`消息 ${m.message_id} 的消息页格式不兼容；未修改聊天`);const active=Number(m.swipe_id);if(!Number.isInteger(active)||active<0||active>=swipes.length)throw Error(`消息 ${m.message_id} 的当前消息页无法确认；未修改聊天`);if(data[active]&&typeof data[active]==='object'&&!Array.isArray(data[active])&&Object.keys(data[active]).length){latest={message_id:m.message_id,index:active};hasData=true;break;}}
 if(!latest||!hasData)throw Error('没有找到非空 MVU 快照；未修改聊天');
 const changes=[];let removed=0,bytes=0;
 for(const m of messages){if(!Array.isArray(m?.swipes_data))continue;const next=m.swipes_data.map((value,i)=>m.message_id===latest.message_id&&i===latest.index?value:{});if(JSON.stringify(next)!==JSON.stringify(m.swipes_data)){bytes+=new TextEncoder().encode(JSON.stringify(m.swipes_data)).length-new TextEncoder().encode(JSON.stringify(next)).length;removed+=m.swipes_data.filter((value,i)=>!(m.message_id===latest.message_id&&i===latest.index)&&value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length).length;changes.push({message_id:m.message_id,swipes_data:next});}}
 return {changes,removed,bytes,latestMessageId:latest.message_id};
}
function planKeepSelectedSwipe(messages){
 const changes=[];let removed=0,bytes=0;
 for(const m of messages){if(m?.role!=='assistant')continue;const swipes=m?.swipes;if(!Array.isArray(swipes)||swipes.length<2)continue;
  const active=Number(m.swipe_id);if(!Number.isInteger(active)||active<0||active>=swipes.length)throw Error(`消息 ${m.message_id} 的当前重生成页无法确认；未修改聊天`);
  const next=[swipes[active]],change={message_id:m.message_id,swipes:next,swipe_id:0};
  for(const key of ['swipes_data','swipes_info']){if(Array.isArray(m[key])){if(m[key].length!==swipes.length)throw Error(`消息 ${m.message_id} 的 ${key} 与重生成页数量不一致；未修改聊天`);change[key]=[m[key][active]];}}
  removed+=swipes.length-1;
  for(const key of ['swipes','swipes_data','swipes_info'])if(Array.isArray(m[key]))bytes+=new TextEncoder().encode(JSON.stringify(m[key])).length-new TextEncoder().encode(JSON.stringify(change[key]??m[key])).length;
  changes.push(change);
 }
 return {changes,removed,bytes};
}
function mount(host,adapter){
 const doc=host.ownerDocument,win=doc.defaultView,shadow=host.attachShadow({mode:'open'});let locked=false,disposed=false;const urls=new Set();
 const saved=adapter.settings()||{},settings={keep:6,aiOnly:true,...saved,rules:Array.isArray(saved.rules)?saved.rules.filter(r=>r&&typeof r==='object').map(r=>({mode:r.mode==='text'?'text':'block',start:String(r.start??''),end:String(r.end??''),enabled:r.enabled!==false})):[{mode:'block',start:'<dream_body>',end:'</dream_body>',enabled:true}]};
 function el(tag,text){const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
 function button(text,fn){const b=el('button',text);b.type='button';b.onclick=()=>Promise.resolve().then(fn).catch(e=>status.textContent=e.message||String(e));return b;}
 function persist(){try{adapter.saveSettings(clone(settings));}catch(e){status.textContent='规则暂未保存：'+(e.message||String(e))+'；当前页面仍可操作。';}}
 const style=el('style');style.textContent=':host{font:14px system-ui,sans-serif;color:#253342;color-scheme:light}*{box-sizing:border-box}.page{position:fixed;inset:0;z-index:2147483000;background:#f5f7fa;display:flex;flex-direction:column}header,footer{padding:12px 16px;background:#fff;border-bottom:1px solid #dbe3ea;display:flex;gap:10px;align-items:center;flex-wrap:wrap}h1{font-size:18px;margin:0;flex:1}main{overflow:auto;flex:1;min-height:0;padding:12px 16px}button,input,select,textarea{font:inherit;min-height:40px;border:1px solid #cdd8e2;border-radius:7px;padding:8px;background:#fff;color:inherit}button{cursor:pointer}button:disabled{opacity:.5}input[type=checkbox]{min-height:0}label{display:flex;gap:8px;align-items:center;margin:8px 0}input[type=number]{width:80px}.rule{padding:12px;background:#fff;border:1px solid #dbe3ea;border-radius:9px;margin-bottom:10px}.rule textarea{width:100%;min-height:64px;margin:4px 0 8px;resize:vertical;overflow-wrap:anywhere}.rule-label{font-size:12px;color:#587087;margin-top:8px}.row select{min-width:100px;max-width:100%}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.row select{flex:1}.hint,.status{font-size:13px;color:#587087;line-height:1.5;overflow-wrap:anywhere}.danger{background:#a93232;color:#fff;border-color:#a93232}footer{border-top:1px solid #dbe3ea;padding-bottom:max(12px,env(safe-area-inset-bottom))}.status{flex:1;min-width:180px}';shadow.append(style);
 const page=el('section');page.className='page';page.setAttribute('role','dialog');page.setAttribute('aria-modal','true');page.setAttribute('aria-label','聊天瘦身');const header=el('header');header.append(el('h1','聊天瘦身 · v1.6.2'),button('关闭',()=>{if(!locked)host.hidden=true;}));page.append(header);
 const main=el('main'),hint=el('p','删除旧楼层中匹配的内容及其起止字符，包含所有重生成消息页。缺少结束字符的段落会保留。规则按顺序执行。');hint.className='hint';main.append(hint);
 const keepLabel=el('label','保留最近楼层');const keep=el('input');keep.type='number';keep.min='1';keep.value=settings.keep;keep.setAttribute('aria-label','保留最近楼层数量');keep.onchange=()=>{settings.keep=Number(keep.value);persist();};keepLabel.append(keep);main.append(keepLabel);
 const aiLabel=el('label'),ai=el('input');ai.type='checkbox';ai.checked=settings.aiOnly;ai.onchange=()=>{settings.aiOnly=ai.checked;persist();};aiLabel.append(ai,el('span','仅清理 AI 楼层'));main.append(aiLabel);
 main.append(el('h2','删除规则'));const rules=el('div');rules.id='cleanup-rules';main.append(rules);
 function renderRules(){rules.replaceChildren();settings.rules.forEach((rule,i)=>{const box=el('div');box.className='rule';const row=el('div');row.className='row';const enabled=el('input');enabled.type='checkbox';enabled.checked=rule.enabled!==false;enabled.setAttribute('aria-label','启用规则 '+(i+1));enabled.onchange=()=>{rule.enabled=enabled.checked;persist();};const mode=el('select');for(const [v,t]of [['block','删除起止字符之间整段（含起止字符）'],['text','删除指定文字']]){const o=el('option',t);o.value=v;mode.append(o);}mode.value=rule.mode;mode.onchange=()=>{rule.mode=mode.value;persist();renderRules();};row.append(enabled,mode,button('删除规则',()=>{settings.rules.splice(i,1);persist();renderRules();}));box.append(row);
 box.append(el('div',rule.mode==='text'?'待删除文字':'起始字符'));const start=el('textarea');start.placeholder=rule.mode==='text'?'待删除文字':'起始字符，如 <dream_body>';start.value=rule.start;start.setAttribute('aria-label','规则 '+(i+1)+' 起始字符或文字');start.oninput=()=>{rule.start=start.value;persist();};box.append(start);
 if(rule.mode!=='text'){box.append(el('div','结束字符'));const end=el('textarea');end.placeholder='结束字符，如 </dream_body>';end.value=rule.end;end.setAttribute('aria-label','规则 '+(i+1)+' 结束字符');end.oninput=()=>{rule.end=end.value;persist();};box.append(end);}rules.append(box);});}
 const addRule=button('添加规则',()=>{settings.rules.push({mode:'block',start:'',end:'',enabled:true});persist();renderRules();rules.lastElementChild?.querySelector('textarea')?.focus();});header.append(addRule);
 renderRules();page.append(main);
 const footer=el('footer'),status=el('div','先备份当前聊天，再执行清理。');status.className='status';status.setAttribute('role','status');
 function download(data){const url=win.URL.createObjectURL(new win.Blob([JSON.stringify(data,null,2)],{type:'application/json'}));urls.add(url);const a=el('a');a.href=url;a.download='聊天清理备份_'+Date.now()+'.json';shadow.append(a);a.click();a.remove();}
 let pendingConfirm=null;
 function confirmAction(text){
  if(pendingConfirm)return Promise.resolve(false);
  return new Promise(resolve=>{
   const box=el('section');box.className='rule';box.setAttribute('role','alertdialog');box.setAttribute('aria-label','确认清理');
   const finish=value=>{box.remove();pendingConfirm=null;resolve(value);};
   box.append(el('p',text),button('取消',()=>finish(false)),button('确认执行删除',()=>finish(true)));
   pendingConfirm=()=>finish(false);status.textContent='请在页面内确认清理；尚未修改聊天。';main.append(box);box.scrollIntoView?.({block:'end'});box.querySelector('button').focus();
  });
 }
 const backup=button('导出原文备份',async()=>{download(await adapter.snapshot());status.textContent='已导出所有消息页及其变量的原文备份。';});
 const remove=button('一键删除',async()=>{if(locked||pendingConfirm)return;settings.keep=Number(keep.value);persist();const snapshot=await adapter.snapshot(),result=plan(snapshot.messages,settings);if(!result.changes.length){status.textContent='没有匹配内容；聊天未修改。';return;}
 if(!await confirmAction(`将清理 ${result.changes.length} 个旧楼层，删除 ${result.count} 段，消息页文字预计减少 ${(result.bytes/1024).toFixed(1)} KB。保留最近 ${settings.keep} 楼及所有 MVU 数据。删除原文后 AI 将依赖保留的总结。是否继续？`))return;
 locked=true;remove.disabled=backup.disabled=true;try{await adapter.commit(snapshot,result.changes);status.textContent=`清理完成：${result.changes.length} 楼、${result.count} 段，消息页文字减少 ${(result.bytes/1024).toFixed(1)} KB。已重新读取核对。`;}finally{locked=false;remove.disabled=backup.disabled=false;}});remove.className='danger';footer.append(backup,remove,status);page.append(footer);shadow.append(page);
 const compact=button('快照：仅保留最新状态',async()=>{if(locked||pendingConfirm)return;const snapshot=await adapter.snapshot(),result=planLatestSnapshot(snapshot.messages);if(!result.changes.length){status.textContent='变量快照已经精简；聊天未修改。';return;}download(snapshot);if(!await confirmAction(`将清空 ${result.removed} 份旧 MVU 快照，保留最新非空状态（消息 ${result.latestMessageId} 的当前页），预计减少 ${(result.bytes/1024).toFixed(1)} KB。历史楼层将不再有原 MVU 快照；已自动导出原文备份。继续？`))return;locked=true;for(const b of [backup,remove,compact,prune])b.disabled=true;try{await adapter.commit(snapshot,result.changes,{allowLatest:true});status.textContent=`完成：清空 ${result.removed} 份旧 MVU 快照，保留最新状态；预计减少 ${(result.bytes/1024).toFixed(1)} KB。已重新读取核对。`;}finally{locked=false;for(const b of [backup,remove,compact,prune])b.disabled=false;}});compact.className='danger';
 const prune=button('重生成：每条仅保留当前页',async()=>{if(locked||pendingConfirm)return;const snapshot=await adapter.snapshot(),result=planKeepSelectedSwipe(snapshot.messages);if(!result.changes.length){status.textContent='没有可删除的重生成版本；聊天未修改。';return;}download(snapshot);if(!await confirmAction(`将从 ${result.changes.length} 条消息中删除 ${result.removed} 个非当前版本，并同步保留当前页对应的 MVU 快照与信息，预计减少 ${(result.bytes/1024).toFixed(1)} KB。已自动导出原文备份；删除后不能在酒馆内切回旧版本。继续？`))return;locked=true;for(const b of [backup,remove,compact,prune])b.disabled=true;try{await adapter.commit(snapshot,result.changes,{allowLatest:true});status.textContent=`完成：删除 ${result.removed} 个旧重生成版本，保留 ${result.changes.length} 条消息的当前页；预计减少 ${(result.bytes/1024).toFixed(1)} KB。已重新读取核对。`;}finally{locked=false;for(const b of [backup,remove,compact,prune])b.disabled=false;}});prune.className='danger';footer.append(compact,prune);
 return {open(){if(!disposed){host.hidden=false;status.textContent='先导出备份；两个精简操作会自动备份，且不可在酒馆内撤销。';}},dispose(){disposed=true;pendingConfirm?.();for(const u of urls)win.URL.revokeObjectURL(u);host.remove();},shadow};
}
const api={normalizeMessages,cleanText,plan,planLatestSnapshot,planKeepSelectedSwipe,mount};root.MvuViewerCleanup=api;if(typeof window==='undefined'&&typeof module==='object')module.exports=api;
})(globalThis);
