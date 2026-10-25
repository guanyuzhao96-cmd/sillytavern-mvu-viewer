// Chromium integration against helper-compatible host fixtures, not a live Tavern.
// MVU_CHAT_FIXTURE optionally exercises a local JSONL without publishing its contents.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const copy=x=>JSON.parse(JSON.stringify(x));
const source=process.env.MVU_CHAT_FIXTURE?fs.readFileSync(process.env.MVU_CHAT_FIXTURE,'utf8').trim().split('\n').map(JSON.parse).slice(1):Array.from({length:9},(_,i)=>({name:'AI',is_user:false,mes:'summary<dream_body>body</dream_body>',swipe_id:i===7?2:1,swipes:['old','summary<dream_body>body</dream_body>'],variables:[{stat_data:{n:i}},{stat_data:{n:i+1}},{stat_data:{n:i+2},external:'preserve-current'}],swipe_info:[{},{}]}));
let saved=copy(source),writes=0;
const fixture=`let raw=await fetch('/state').then(r=>r.json());
const ctx={chat:raw,chatId:'cleanup-fixture',characterId:0,eventTypes:{GENERATION_STARTED:'start',GENERATION_ENDED:'end'},eventSource:{on(){},off(){}},saveChat:async()=>{await fetch('/save',{method:'POST',body:JSON.stringify(raw)})}};
window.SillyTavern={getContext:()=>ctx};window.MvuViewerNativeBridge={getContext:()=>ctx,generationState:()=>({known:true,active:false})};
window.TavernHelper={getChatMessages(range,options={}){
 const ids=typeof range==='string'?raw.map((_,i)=>i):[range<0?raw.length+range:range];
 return ids.map(message_id=>{const m=raw[message_id],swipe_id=m.swipe_id??0,swipes=m.swipes??[m.mes],n=swipes.length;
 const r={message_id,name:m.name,role:m.is_user?'user':'assistant',is_hidden:m.is_system,swipe_id,swipes:Array.from({length:n},(_,i)=>swipes[i]??''),swipes_data:Array.from({length:n},(_,i)=>m.variables?.[i]??{}),swipes_info:Array.from({length:n},(_,i)=>m.swipe_info?.[i]??{})};return options.include_swipes?r:{...r,message:m.mes,data:r.swipes_data[swipe_id],extra:r.swipes_info[swipe_id]};});
 },async setChatMessages(patches,options){
 if(options.refresh!=='none')throw Error('Must avoid rendering callbacks during cleanup');
 for(const p of patches){const m=raw[p.message_id];const n=Math.max(...['swipes','swipes_data','swipes_info'].map(k=>p[k]?.length??0))||m.swipes?.length||1;
 m.swipe_id=Math.max(0,Math.min(p.swipe_id??m.swipe_id??0,n-1));m.swipes=Array.from({length:n},(_,i)=>(p.swipes??m.swipes??[m.mes])[i]??'');m.variables=Array.from({length:n},(_,i)=>(p.swipes_data??m.variables??[{}])[i]??{});m.swipe_info=Array.from({length:n},(_,i)=>(p.swipes_info??m.swipe_info??[{}])[i]??{});m.mes=m.swipes[m.swipe_id];m.extra=m.swipe_info[m.swipe_id];}
 }};
for(const f of ['core.js','cleanup.js','host.js']){const script=document.createElement('script');script.src='/'+f;document.body.append(script);await new Promise((ok,no)=>{script.onload=ok;script.onerror=no})}window.__tw_mvu_viewer_v1__.openCleanup();`;
(async()=>{const server=http.createServer(async(req,res)=>{
 if(req.url==='/state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(saved));return}
 if(req.url==='/save'){const chunks=[];for await(const part of req)chunks.push(part);saved=JSON.parse(Buffer.concat(chunks).toString('utf8'));writes++;res.end('ok');return}
 if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="extensions_settings2"></div><script type="module">'+fixture+'</script>');return}
 const file=path.join(__dirname,req.url.slice(1));if(!['/core.js','/cleanup.js','/host.js'].includes(req.url)){res.writeHead(404);res.end();return}res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));
});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({executablePath:process.env.MVU_CHROMIUM_PATH||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',()=>{throw Error('Native confirmation must not be used')});
const url='http://127.0.0.1:'+server.address().port;await page.goto(url);const root=page.locator('#mvu-viewer-cleanup');
await root.getByRole('button',{name:'一键删除',exact:true}).click();await root.getByRole('button',{name:'取消',exact:true}).click();assert.equal(writes,0);
await root.getByRole('button',{name:'一键删除',exact:true}).click();await root.getByRole('button',{name:'确认执行删除',exact:true}).click();await root.getByRole('status').filter({hasText:'清理完成'}).waitFor();assert.equal(writes,1);const cleanup=require('./cleanup.js');const normalized=cleanup.normalizeMessages(source.map((m,message_id)=>({message_id,role:m.is_user?'user':'assistant',swipe_id:m.swipe_id??0,swipes:m.swipes??[m.mes],swipes_data:(m.swipes??[m.mes]).map((_,i)=>m.variables?.[i]??{}),swipes_info:(m.swipes??[m.mes]).map((_,i)=>m.swipe_info?.[i]??{})})),source);const planned=cleanup.plan(normalized,{keep:6,aiOnly:true,rules:[{mode:'block',start:'<dream_body>',end:'</dream_body>'}]});for(const patch of planned.changes){assert.deepEqual(saved[patch.message_id].swipes,patch.swipes);assert.deepEqual(saved[patch.message_id].variables,normalized[patch.message_id].swipes_data);}assert.deepEqual(saved.slice(-6),source.slice(-6));
await page.reload();const before=copy(saved);const latestIndex=before.findLastIndex(m=>{const i=m.swipe_id??0;return !!m.variables?.[i]?.stat_data});assert(latestIndex>=0);const latestData=copy(before[latestIndex].variables[before[latestIndex].swipe_id??0]);
const dl=page.waitForEvent('download');await root.getByRole('button',{name:'快照：仅保留最新状态',exact:true}).click();await dl;await root.getByRole('button',{name:'确认执行删除',exact:true}).click();await root.getByRole('status').filter({hasText:'完成：清空'}).waitFor();assert.equal(writes,2);assert.deepEqual(saved[latestIndex].variables[saved[latestIndex].swipe_id??0],latestData);assert.equal(saved.reduce((n,m)=>n+(m.variables??[]).filter(d=>d&&Object.keys(d).length).length,0),1);
await page.reload();const selected=saved.map(m=>m.mes),selectedData=saved.map(m=>copy(m.variables?.[m.swipe_id??0]??{}));const dl2=page.waitForEvent('download');await root.getByRole('button',{name:'重生成：每条仅保留当前页',exact:true}).click();await dl2;await root.getByRole('button',{name:'确认执行删除',exact:true}).click();await root.getByRole('status').filter({hasText:'完成：删除'}).waitFor();assert.equal(writes,3);for(let i=0;i<saved.length;i++){assert.equal(saved[i].mes,selected[i]);if(!saved[i].is_user&&before[i].swipes?.length>1){assert.equal(saved[i].swipes.length,1);assert.equal(saved[i].swipe_id,0);assert.deepEqual(saved[i].variables[0],selectedData[i]);}}
// Exercise each new action first on the original malformed source as well.
for(const [name,done] of [['重生成：每条仅保留当前页','完成：删除'],['快照：仅保留最新状态','完成：清空']]){
 saved=copy(source);await page.reload();const d=page.waitForEvent('download');await root.getByRole('button',{name,exact:true}).click();await d;await root.getByRole('button',{name:'确认执行删除',exact:true}).click();await root.getByRole('status').filter({hasText:done}).waitFor();
 if(name.startsWith('重生成'))for(let i=0;i<source.length;i++){if(!source[i].is_user&&source[i].swipes?.length>1){assert.equal(saved[i].mes,source[i].mes);assert.equal(saved[i].swipes.length,1);assert.deepEqual(saved[i].variables[0],source[i].variables?.[source[i].swipe_id??0]??{});}}
 else assert.equal(saved.reduce((n,m)=>n+(m.variables??[]).filter(d=>d&&Object.keys(d).length).length,0),1);
 await page.reload();
}
assert.equal(writes,5);await page.reload();assert.match(await root.getByRole('heading',{level:1}).textContent(),/1.6.2/);assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',messages:saved.length,persistedWrites:writes,checks:'three actual button clicks, in-page confirmation/cancel, downloads, malformed swipe recovery, latest metadata, fresh page reload'}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e.stack?.split('\n').slice(0,2).join('\n'));process.exitCode=1});
