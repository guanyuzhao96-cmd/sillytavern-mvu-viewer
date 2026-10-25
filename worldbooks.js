(function(){
'use strict';
const enc = new TextEncoder();
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function header(size,values){const a=new Uint8Array(size),v=new DataView(a.buffer);for(const [offset,n,width] of values)width===2?v.setUint16(offset,n,true):v.setUint32(offset,n,true);return a;}
// ZIP STORE + UTF-8 names; no CDN or compression dependency. Native JSONs stay intact.
function archive(books){
 const parts=[],central=[],used=new Set();let offset=0,centralSize=0;
 books.forEach(({name,data},i)=>{
  const safe=name.replace(/[\\/\x00-\x1f<>:"|?*]/g,'_').slice(0,100)||'worldbook';
  let file=safe+'.json',suffix=1;while(used.has(file.toLocaleLowerCase()))file=safe+'_'+(++suffix)+'.json';used.add(file.toLocaleLowerCase());
  const filename=enc.encode(file),body=enc.encode(JSON.stringify(data,null,2)),crc=crc32(body);
  if(offset+body.length>0xffffffff || books.length>65535)throw Error('所选内容超出 ZIP 格式上限，请分批导出');
  const local=header(30,[[0,0x04034b50,4],[4,20,2],[6,0x800,2],[14,crc,4],[18,body.length,4],[22,body.length,4],[26,filename.length,2]]);
  const cd=header(46,[[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0x800,2],[16,crc,4],[20,body.length,4],[24,body.length,4],[28,filename.length,2],[42,offset,4]]);
  parts.push(local,filename,body);central.push(cd,filename);offset+=local.length+filename.length+body.length;centralSize+=cd.length+filename.length;
 });
 const end=header(22,[[0,0x06054b50,4],[8,books.length,2],[10,books.length,2],[12,centralSize,4],[16,offset,4]]);
 return new Blob([...parts,...central,end],{type:'application/zip'});
}
function mount(host,adapter){
 const doc=host.ownerDocument,shadow=host.attachShadow({mode:'open'});
 shadow.innerHTML=`<style>:host{display:block;position:fixed;inset:0;background:#101827;color:#e5edf7;font:15px/1.5 system-ui;box-sizing:border-box}*{box-sizing:border-box}main{height:100%;display:flex;flex-direction:column;padding:14px;gap:10px;max-width:900px;margin:auto}header,.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}h1{font-size:20px;margin:0;flex:1}button,input,select{font:inherit}select{background:#263b56;color:inherit;padding:8px;border-radius:8px;min-height:44px}button{padding:10px 12px;background:#263b56;border:1px solid #526981;border-radius:9px;color:inherit;cursor:pointer;min-height:44px;white-space:normal}button:disabled{opacity:.5;cursor:default}.danger{background:#703334}input[type=search]{width:100%;background:#1b2b40;color:inherit;border:1px solid #526981;border-radius:8px;padding:11px}input[type=checkbox]{width:20px;height:20px;flex-shrink:0}#list{overflow:auto;min-height:70px;flex:1;border:1px solid #526981;border-radius:10px}label.row{display:flex;align-items:center;gap:10px;padding:12px;border-bottom:1px solid #334155;overflow-wrap:anywhere}p{margin:0;font-size:13px;color:#b8c8dc}.status{white-space:pre-wrap;overflow:auto;max-height:25vh;font-size:14px;overflow-wrap:anywhere}.actions button{flex:1}button:focus-visible,input:focus-visible{outline:2px solid #7cc3ff;outline-offset:2px}</style>
 <main><header><h1>世界书管理</h1><button id="close">关闭</button></header><p>批量导出原生 JSON（ZIP 打包）；删除世界书会影响引用它的聊天和角色卡。勾选后点击删除即执行。</p><input id="search" type="search" aria-label="搜索世界书" placeholder="搜索世界书名称"><header><button id="refresh">刷新</button><button id="all">全选搜索结果</button><button id="clear">清空选择</button><span id="count"></span></header><div id="list" aria-label="世界书列表"></div><label>同名处理 <select id="import-policy" aria-label="导入同名处理"><option value="skip">跳过同名</option><option value="copy">另存副本</option><option value="overwrite">覆盖同名</option></select></label><input id="files" type="file" multiple accept=".json,.zip,application/json,application/zip" hidden aria-label="选择世界书文件"><div class="actions"><button id="import">批量导入</button><button id="export">批量导出</button><button id="delete" class="danger">批量删除</button></div><div class="status" role="status" aria-live="polite"></div></main>`;
 const $=s=>shadow.querySelector(s),selected=new Set(),urls=new Set(),timers=new Set();let names=[],busy=false,disposed=false;
 const status=t=>{$('.status').textContent=t;};
 function controls(){for(const id of ['refresh','search','all','clear','export','delete','close','import','files','import-policy'])$('#'+id).disabled=busy;for(const cb of shadow.querySelectorAll('#list input'))cb.disabled=busy;$('#count').textContent=`已选 ${selected.size} / 共 ${names.length} 本`;}
 function render(){const query=$('#search').value.trim().toLocaleLowerCase();$('#list').replaceChildren();for(const name of names.filter(n=>n.toLocaleLowerCase().includes(query))){const label=doc.createElement('label');label.className='row';const cb=doc.createElement('input');cb.type='checkbox';cb.checked=selected.has(name);const text=doc.createElement('span');text.textContent=name;cb.onchange=()=>{cb.checked?selected.add(name):selected.delete(name);controls();};label.append(cb,text);$('#list').append(label);}controls();}
 async function refresh(result){if(result===undefined)result=await adapter.list();if(!Array.isArray(result)||result.some(n=>typeof n!=='string'))throw Error('世界书列表格式异常');names=[...new Set(result)].sort((a,b)=>a.localeCompare(b,'zh'));for(const n of selected)if(!names.includes(n))selected.delete(n);render();}
 async function run(fn){if(busy||disposed)return;busy=true;controls();try{await fn();}catch(e){status('操作未完成：'+(e.message||e));}finally{busy=false;if(!disposed)controls();}}
 async function prepare(){const requested=[...selected];if(!requested.length)throw Error('请先勾选世界书');const existing=await adapter.list();const books=[];for(const name of requested){if(!existing.includes(name))throw Error(name+' 已不存在，请刷新');status(`读取 ${books.length+1}/${requested.length}：${name}`);const data=await adapter.read(name);books.push({name,data});}return books;}
 function download(books){const blob=archive(books),url=URL.createObjectURL(blob);urls.add(url);const a=doc.createElement('a');a.href=url;a.download='世界书批量备份_'+new Date().toISOString().replace(/[:.]/g,'-')+'.zip';shadow.append(a);a.click();a.remove();const timer=setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);timers.delete(timer);},60000);timers.add(timer);return blob.size;}
 $('#refresh').onclick=()=>run(async()=>{await refresh();status('列表已刷新');});$('#search').oninput=render;
 $('#all').onclick=()=>{const q=$('#search').value.trim().toLocaleLowerCase();names.filter(n=>n.toLocaleLowerCase().includes(q)).forEach(n=>selected.add(n));render();};$('#clear').onclick=()=>{selected.clear();render();};
 $('#export').onclick=()=>run(async()=>{const books=await prepare();const size=download(books);status(`已发起下载：${books.length} 本，${(size/1024).toFixed(1)} KiB。解压后可逐本导入酒馆。`);});
 $('#import').onclick=()=>{if(!busy){$('#files').value='';$('#files').click();}};
 $('#files').onchange=()=>{const files=Array.from($('#files').files),policy=$('#import-policy').value;if(!files.length)return;
  run(async()=>{
   status('正在读取导入文件…');
   const {loadImportFiles}=await import('./worldbooks-import.mjs?v=1.6.3');
   const {books,errors}=await loadImportFiles(files);
   if(!books.length){status('没有可导入的世界书。\n'+errors.join('\n'));return;}
   const batch=await adapter.importMany(books,policy,(done,total)=>status(`正在导入 ${done}/${total}`));
   const failed=batch.results.filter(r=>!r.ok||!batch.remaining?.includes(r.name));
   const imported=batch.results.filter(r=>r.ok&&batch.remaining?.includes(r.name));
   if(batch.remaining){$('#search').value='';await refresh(batch.remaining);}
   status(`导入成功 ${imported.length} 本；跳过 ${batch.skipped.length} 本；失败 ${failed.length+errors.length} 项。`+
    (batch.skipped.length?'\n跳过：'+batch.skipped.join('\n'):'')+
    (failed.length?'\n失败或未核实：'+failed.map(r=>r.name+'：'+(r.error||'最终列表未核实')).join('\n'):'')+
    (errors.length?'\n无效文件：'+errors.join('\n'):'')+(batch.syncError?'\n'+batch.syncError:''));
  });
 };
 $('#delete').onclick=()=>run(async()=>{
  const requested=[...selected];if(!requested.length)throw Error('请先勾选世界书');
  status(`正在删除 0/${requested.length}`);
  const batch=await adapter.removeMany(requested,(done,total)=>status(`正在删除 ${done}/${total}`));
  if(!Array.isArray(batch.remaining)){
   status('删除请求已执行，但无法核实最终结果。'+(batch.syncError||'列表读取失败')+'。请点击刷新核对。');return;
  }
  const attempted=new Set(batch.results.map(r=>r.name));
  const deleted=requested.filter(name=>attempted.has(name)&&!batch.remaining.includes(name));
  const failed=batch.results.filter(r=>batch.remaining.includes(r.name));
  const unattempted=requested.length-attempted.size;
  for(const name of deleted)selected.delete(name);
  await refresh(batch.remaining);
  status(`删除成功 ${deleted.length}/${requested.length} 本。`+
   (failed.length?'\n失败或未删除：'+failed.map(r=>r.name+'：'+(r.error||'删除后仍在列表中')).join('\n'):'')+
   (unattempted?'\n其余 '+unattempted+' 本未执行；已停止派发新请求。':'')+
   (batch.syncError?'\n'+batch.syncError:''));

 });
 $('#close').onclick=()=>{if(!busy)host.hidden=true;};
 return {shadow,open(){host.hidden=false;return run(async()=>{await refresh();status('可批量导入，或勾选后导出、删除世界书');});},dispose(){disposed=true;for(const timer of timers)clearTimeout(timer);timers.clear();for(const url of urls)URL.revokeObjectURL(url);urls.clear();host.remove();}};
}
const api={mount,archive};globalThis.MvuViewerWorldbooks=api;if(typeof module!=='undefined')module.exports=api;
})();
