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
 shadow.innerHTML=`<style>:host{display:block;position:fixed;inset:0;background:#101827;color:#e5edf7;font:15px/1.5 system-ui;box-sizing:border-box}*{box-sizing:border-box}main{height:100%;display:flex;flex-direction:column;padding:14px;gap:10px;max-width:900px;margin:auto}header,.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}h1{font-size:20px;margin:0;flex:1}button,input{font:inherit}button{padding:10px 12px;background:#263b56;border:1px solid #526981;border-radius:9px;color:inherit;cursor:pointer;min-height:44px;white-space:normal}button:disabled{opacity:.5;cursor:default}.danger{background:#703334}input[type=search]{width:100%;background:#1b2b40;color:inherit;border:1px solid #526981;border-radius:8px;padding:11px}input[type=checkbox]{width:20px;height:20px;flex-shrink:0}#list{overflow:auto;min-height:70px;flex:1;border:1px solid #526981;border-radius:10px}label.row{display:flex;align-items:center;gap:10px;padding:12px;border-bottom:1px solid #334155;overflow-wrap:anywhere}p{margin:0;font-size:13px;color:#b8c8dc}.status{white-space:pre-wrap;overflow:auto;max-height:25vh;font-size:14px;overflow-wrap:anywhere}.actions button{flex:1}button:focus-visible,input:focus-visible{outline:2px solid #7cc3ff;outline-offset:2px}</style>
 <main><header><h1>世界书管理</h1><button id="close">关闭</button></header><p>批量导出原生 JSON（ZIP 打包）；删除世界书会影响引用它的聊天和角色卡。勾选后点击删除即执行。</p><input id="search" type="search" aria-label="搜索世界书" placeholder="搜索世界书名称"><header><button id="refresh">刷新</button><button id="all">全选搜索结果</button><button id="clear">清空选择</button><span id="count"></span></header><div id="list" aria-label="世界书列表"></div><div class="actions"><button id="export">批量导出</button><button id="delete" class="danger">批量删除</button></div><div class="status" role="status" aria-live="polite"></div></main>`;
 const $=s=>shadow.querySelector(s),selected=new Set(),urls=new Set(),timers=new Set();let names=[],busy=false,disposed=false;
 const status=t=>{$('.status').textContent=t;};
 function controls(){for(const id of ['refresh','search','all','clear','export','delete','close'])$('#'+id).disabled=busy;for(const cb of shadow.querySelectorAll('#list input'))cb.disabled=busy;$('#count').textContent=`已选 ${selected.size} / 共 ${names.length} 本`;}
 function render(){const query=$('#search').value.trim().toLocaleLowerCase();$('#list').replaceChildren();for(const name of names.filter(n=>n.toLocaleLowerCase().includes(query))){const label=doc.createElement('label');label.className='row';const cb=doc.createElement('input');cb.type='checkbox';cb.checked=selected.has(name);const text=doc.createElement('span');text.textContent=name;cb.onchange=()=>{cb.checked?selected.add(name):selected.delete(name);controls();};label.append(cb,text);$('#list').append(label);}controls();}
 async function refresh(){const result=await adapter.list();if(!Array.isArray(result)||result.some(n=>typeof n!=='string'))throw Error('世界书列表格式异常');names=[...new Set(result)].sort((a,b)=>a.localeCompare(b,'zh'));for(const n of selected)if(!names.includes(n))selected.delete(n);render();}
 async function run(fn){if(busy||disposed)return;busy=true;controls();try{await fn();}catch(e){status('操作未完成：'+(e.message||e));}finally{busy=false;if(!disposed)controls();}}
 async function prepare(){const requested=[...selected];if(!requested.length)throw Error('请先勾选世界书');const existing=await adapter.list();const books=[];for(const name of requested){if(!existing.includes(name))throw Error(name+' 已不存在，请刷新');status(`读取 ${books.length+1}/${requested.length}：${name}`);const data=await adapter.read(name);books.push({name,data});}return books;}
 function download(books){const blob=archive(books),url=URL.createObjectURL(blob);urls.add(url);const a=doc.createElement('a');a.href=url;a.download='世界书批量备份_'+new Date().toISOString().replace(/[:.]/g,'-')+'.zip';shadow.append(a);a.click();a.remove();const timer=setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);timers.delete(timer);},60000);timers.add(timer);return blob.size;}
 $('#refresh').onclick=()=>run(async()=>{await refresh();status('列表已刷新');});$('#search').oninput=render;
 $('#all').onclick=()=>{const q=$('#search').value.trim().toLocaleLowerCase();names.filter(n=>n.toLocaleLowerCase().includes(q)).forEach(n=>selected.add(n));render();};$('#clear').onclick=()=>{selected.clear();render();};
 $('#export').onclick=()=>run(async()=>{const books=await prepare();const size=download(books);status(`已发起下载：${books.length} 本，${(size/1024).toFixed(1)} KiB。解压后可逐本导入酒馆。`);});
 $('#delete').onclick=()=>run(async()=>{
  const requested=[...selected];if(!requested.length)throw Error('请先勾选世界书');
  const deleted=[],failed=[];
  try{
   for(const name of requested){status(`正在删除 ${deleted.length+1}/${requested.length}：${name}`);try{
    await adapter.remove(name);
    if((await adapter.list()).includes(name))throw Error('删除后仍在列表中');
    deleted.push(name);selected.delete(name);
   }catch(e){failed.push(name+'：'+(e.message||e));break;}}
   status(`删除成功 ${deleted.length}/${requested.length} 本。`+(failed.length?'\n已停止，失败或未核实：'+failed.join('\n')+'\n其余未执行，请刷新核对。':''));
  }finally{await refresh();}
 });
 $('#close').onclick=()=>{if(!busy)host.hidden=true;};
 return {shadow,open(){host.hidden=false;return run(async()=>{await refresh();status('请选择要导出或删除的世界书');});},dispose(){disposed=true;for(const timer of timers)clearTimeout(timer);timers.clear();for(const url of urls)URL.revokeObjectURL(url);urls.clear();host.remove();}};
}
const api={mount,archive};globalThis.MvuViewerWorldbooks=api;if(typeof module!=='undefined')module.exports=api;
})();
