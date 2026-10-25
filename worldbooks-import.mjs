// Native worldbook JSON and ZIP reader. No external scripts, no filesystem extraction.
const MAX_TOTAL=50*1024*1024, MAX_FILES=1000;
const utf8=new TextDecoder('utf-8',{fatal:true});
export function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
export function safeName(filename){
 let name=filename.replace(/\\/g,'/').split('/').pop().replace(/\.json$/i,'').replace(/[<>:"/\\|?*\x00-\x1f\x80-\x9f]/g,'_').replace(/[ .]+$/g,'').trim();
 if(!name||/^\.+$/.test(name))name='worldbook';
 if(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name))name='_'+name;
 let result='';for(const c of name){if(new TextEncoder().encode(result+c).length>180)break;result+=c;}return result;
}
export function validateJson(text){const data=JSON.parse(text.replace(/^\uFEFF/,''));if(!data||!data.entries||typeof data.entries!=='object'||Array.isArray(data.entries))throw Error('不是酒馆原生世界书 JSON（缺少 entries 对象）');return data;}
export function equalJson(a,b){const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;return JSON.stringify(sort(a))===JSON.stringify(sort(b));}
export function planImports(books,existing,policy='skip'){
 if(!['skip','copy','overwrite'].includes(policy))throw Error('未知同名处理方式');
 const used=new Set(existing.map(n=>n.toLocaleLowerCase())),plans=[],skipped=[];
 for(const book of books){let name=safeName(book.filename),key=name.toLocaleLowerCase();const exists=used.has(key);
  if(exists&&policy==='overwrite')name=existing.find(n=>n.toLocaleLowerCase()===key)||name;
  if(exists&&policy==='skip'){skipped.push(book.filename+'：同名已存在');continue;}
  if(exists&&policy==='copy'){const stem=name;let i=2;do{name=stem+' ('+(i++)+')';key=name.toLocaleLowerCase();}while(used.has(key));}
  // Never allow two concurrent writes to the same target, including overwrite mode.
  if(plans.some(p=>p.name.toLocaleLowerCase()===key)){skipped.push(book.filename+'：本批次目标名称重复');continue;}
  plans.push({...book,name,overwrite:existing.some(n=>n.toLocaleLowerCase()===key)});used.add(key);
 }
 return {plans,skipped};
}
async function inflate(bytes,size){
 if(typeof DecompressionStream!=='function')throw Error('此浏览器不支持 ZIP 解压，请先解压后多选 JSON');
 const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),parts=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>size||length>MAX_TOTAL)throw Error('ZIP 解压大小超限');parts.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
 if(length!==size)throw Error('ZIP 解压大小不匹配');const out=new Uint8Array(length);let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;
}
export async function readZip(buffer){
 const bytes=new Uint8Array(buffer),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const need=(offset,n)=>{if(offset<0||offset+n>bytes.length)throw Error('ZIP 文件损坏或截断');};
 let end=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){if(v.getUint32(p,true)===0x06054b50&&p+22+v.getUint16(p+20,true)===bytes.length){end=p;break;}}
 if(end<0)throw Error('无效 ZIP 文件');
 const count=v.getUint16(end+10,true),central=v.getUint32(end+16,true),centralSize=v.getUint32(end+12,true);
 if(v.getUint16(end+4,true)||v.getUint16(end+6,true)||count!==v.getUint16(end+8,true))throw Error('不支持分卷 ZIP');
 if(count>MAX_FILES||central===0xffffffff||centralSize===0xffffffff)throw Error('ZIP 条目过多或不支持 ZIP64');
 if(central+centralSize>end)throw Error('ZIP 目录损坏');let pos=central,total=0;const files=[];
 for(let i=0;i<count;i++){
  need(pos,46);if(v.getUint32(pos,true)!==0x02014b50)throw Error('ZIP 目录损坏');
  const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),crc=v.getUint32(pos+16,true),compressed=v.getUint32(pos+20,true),size=v.getUint32(pos+24,true),n=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),local=v.getUint32(pos+42,true);
  need(pos+46,n+extra+comment);const nameBytes=bytes.subarray(pos+46,pos+46+n);let filename;
  try{filename=utf8.decode(nameBytes);}catch(e){if(flags&0x800)throw Error('ZIP 文件名编码错误');filename=new TextDecoder('gb18030').decode(nameBytes);}
  pos+=46+n+extra+comment;if(pos>central+centralSize)throw Error('ZIP 目录大小错误');
  if(!/\.json$/i.test(filename)||filename.endsWith('/'))continue;
  if(flags&1)throw Error('不支持加密 ZIP');if(method!==0&&method!==8)throw Error('不支持此 ZIP 压缩方式');
  total+=size;if(total>MAX_TOTAL)throw Error('ZIP 解压总量超过 50 MiB，请分批导入');
  need(local,30);if(v.getUint32(local,true)!==0x04034b50||v.getUint16(local+8,true)!==method||(v.getUint16(local+6,true)&1))throw Error('ZIP 数据头不匹配');
  const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);need(start,compressed);if(start+compressed>central)throw Error('ZIP 数据范围错误');
  const raw=bytes.subarray(start,start+compressed),data=method===0?raw:await inflate(raw,size);
  if(data.length!==size||crc32(data)!==crc)throw Error('ZIP 文件校验失败：'+filename);
  files.push({filename,text:utf8.decode(data)});
 }
 return files;
}
export async function loadImportFiles(files){
 const books=[],errors=[];let bytes=0,count=0;
 for(const file of files){
  try{
   if(file.size>100*1024*1024)throw Error('文件超过 100 MiB，请分批导入');
   const items=/\.zip$/i.test(file.name)?await readZip(await file.arrayBuffer()):/\.json$/i.test(file.name)?[{filename:file.name,text:await file.text()}]:(()=>{throw Error('仅支持 JSON 或 ZIP');})();
   for(const item of items){bytes+=new TextEncoder().encode(item.text).length;if(++count>MAX_FILES||bytes>MAX_TOTAL)throw Error('本批内容超过 1000 本或 50 MiB，请分批导入');
    try{books.push({filename:item.filename,data:validateJson(item.text)});}catch(e){errors.push(item.filename+'：'+e.message);}
   }
   if(!items.length)errors.push(file.name+'：没有找到 JSON 世界书');
  }catch(e){errors.push(file.name+'：'+e.message);}
 }
 return {books,errors};
}
