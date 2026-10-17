(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
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
function mount(host,adapter){
 const doc=host.ownerDocument,win=doc.defaultView,shadow=host.attachShadow({mode:'open'});let locked=false,disposed=false;const urls=new Set();
 const saved=adapter.settings()||{},settings={keep:6,aiOnly:true,...saved,rules:Array.isArray(saved.rules)?saved.rules.filter(r=>r&&typeof r==='object').map(r=>({mode:r.mode==='text'?'text':'block',start:String(r.start??''),end:String(r.end??''),enabled:r.enabled!==false})):[{mode:'block',start:'<dream_body>',end:'</dream_body>',enabled:true}]};
 function el(tag,text){const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
 function button(text,fn){const b=el('button',text);b.type='button';b.onclick=()=>Promise.resolve().then(fn).catch(e=>status.textContent=e.message||String(e));return b;}
 function persist(){try{adapter.saveSettings(clone(settings));}catch(e){status.textContent='规则暂未保存：'+(e.message||String(e))+'；当前页面仍可操作。';}}
 const style=el('style');style.textContent=':host{font:14px system-ui,sans-serif;color:#253342;color-scheme:light}*{box-sizing:border-box}.page{position:fixed;inset:0;z-index:2147483000;background:#f5f7fa;display:flex;flex-direction:column}header,footer{padding:12px 16px;background:#fff;border-bottom:1px solid #dbe3ea;display:flex;gap:10px;align-items:center;flex-wrap:wrap}h1{font-size:18px;margin:0;flex:1}main{overflow:auto;flex:1;min-height:0;padding:12px 16px}button,input,select,textarea{font:inherit;min-height:40px;border:1px solid #cdd8e2;border-radius:7px;padding:8px;background:#fff;color:inherit}button{cursor:pointer}button:disabled{opacity:.5}input[type=checkbox]{min-height:0}label{display:flex;gap:8px;align-items:center;margin:8px 0}input[type=number]{width:80px}.rule{padding:12px;background:#fff;border:1px solid #dbe3ea;border-radius:9px;margin-bottom:10px}.rule textarea{width:100%;min-height:64px;margin:4px 0 8px;resize:vertical;overflow-wrap:anywhere}.rule-label{font-size:12px;color:#587087;margin-top:8px}.row select{min-width:100px;max-width:100%}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.row select{flex:1}.hint,.status{font-size:13px;color:#587087;line-height:1.5;overflow-wrap:anywhere}.danger{background:#a93232;color:#fff;border-color:#a93232}footer{border-top:1px solid #dbe3ea;padding-bottom:max(12px,env(safe-area-inset-bottom))}.status{flex:1;min-width:180px}';shadow.append(style);
 const page=el('section');page.className='page';page.setAttribute('role','dialog');page.setAttribute('aria-modal','true');page.setAttribute('aria-label','聊天瘦身');const header=el('header');header.append(el('h1','聊天瘦身 · v1.5.1'),button('关闭',()=>{if(!locked)host.hidden=true;}));page.append(header);
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
 const backup=button('导出原文备份',async()=>{download(await adapter.snapshot());status.textContent='已导出所有消息页及其变量的原文备份。';});
 const remove=button('一键删除',async()=>{if(locked)return;settings.keep=Number(keep.value);persist();const snapshot=await adapter.snapshot(),result=plan(snapshot.messages,settings);if(!result.changes.length){status.textContent='没有匹配内容；聊天未修改。';return;}
 if(!win.confirm(`将清理 ${result.changes.length} 个旧楼层，删除 ${result.count} 段，消息页文字预计减少 ${(result.bytes/1024).toFixed(1)} KB。保留最近 ${settings.keep} 楼及所有 MVU 数据。删除原文后 AI 将依赖保留的总结。是否继续？`))return;
 locked=true;remove.disabled=backup.disabled=true;try{await adapter.commit(snapshot,result.changes);status.textContent=`清理完成：${result.changes.length} 楼、${result.count} 段，消息页文字减少 ${(result.bytes/1024).toFixed(1)} KB。已重新读取核对。`;}finally{locked=false;remove.disabled=backup.disabled=false;}});remove.className='danger';footer.append(backup,remove,status);page.append(footer);shadow.append(page);
 return {open(){if(!disposed){host.hidden=false;status.textContent='规则自动保存；保留数量按所有消息楼层计算。';}},dispose(){disposed=true;for(const u of urls)win.URL.revokeObjectURL(u);host.remove();},shadow};
}
const api={cleanText,plan,mount};root.MvuViewerCleanup=api;if(typeof window==='undefined'&&typeof module==='object')module.exports=api;
})(globalThis);
