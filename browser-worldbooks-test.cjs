// Real Chromium + complete entry. All server/host state is synthetic, not the user's Tavern.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const sample={entries:{0:{uid:0,key:['测试'],content:'保留中文',extensions:{unknown:42}}},unknown:{retain:true}};
let db={'甲世界书':structuredClone(sample),'乙世界书':structuredClone(sample),'丙世界书':structuredClone(sample)};
let removed=[],failName=null,noOpName=null,fast=true,listCount=0,deleteCount=0,active=0,peak=0,readCount=0,downloads=0;
const resetMetrics=()=>{listCount=deleteCount=active=peak=0;removed=[]};
const html=`<meta name="viewport" content="width=device-width,initial-scale=1"><style>.menu_button{width:min-content}body{margin:8px}</style><div id="extensions_settings2"></div><script type="module">
window.metrics={settings:0,character:0,editor:0,characterChange:0,characterWorld:'乙世界书'};
window.jQuery=selector=>({val(value){if(arguments.length){window.metrics.characterWorld=value;return this}return window.metrics.characterWorld},trigger(){window.metrics[selector==='#character_world'?'characterChange':'editor']++;return this}});
window.SillyTavern={getContext:()=>({eventSource:{on(){},off(){}},eventTypes:{}})};
window.worlds=await import('/scripts/world-info.js');await import('/scripts/extensions/third-party/mvu/index-v1.6.2.js');</script>`;
const worldModule=()=>`export let world_names=[];export const worldInfoCache=${fast?'new Map('+JSON.stringify(Object.keys(db).map(n=>[n,sample]))+')':'undefined'};export const selected_world_info=['乙世界书','untouched'];export function setWorldInfoButtonClass(){window.metrics.buttonCleared=true}
export async function updateWorldInfoList(){const r=await fetch('/list');if(!r.ok)throw Error('fixture list failure');world_names=await r.json()}
export async function deleteWorldInfo(name){const r=await fetch('/api/worldinfo/delete',{method:'POST',body:JSON.stringify({name})});if(!r.ok)return false;worldInfoCache?.delete(name);const i=selected_world_info.indexOf(name);if(i!==-1){selected_world_info.splice(i,1);window.metrics.settings++}await updateWorldInfoList();return true}`;
(async()=>{const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');let body='';for await(const c of req)body+=c;
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html)}
 if(url.pathname==='/list'){listCount++;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(Object.keys(db)))}
 if(url.pathname==='/api/worldinfo/get'){readCount++;const n=JSON.parse(body).name;res.setHeader('Content-Type','application/json');if(!db[n])res.statusCode=404;return res.end(JSON.stringify(db[n]||{}))}
 if(url.pathname==='/api/worldinfo/delete'){
  const n=JSON.parse(body).name;deleteCount++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,10));active--;
  if(n===failName){res.statusCode=500;return res.end('fixture failure')}
  if(n!==noOpName){delete db[n];removed.push(n)}return res.end('ok');
 }
 res.setHeader('Content-Type','text/javascript');
 if(url.pathname==='/script.js')return res.end(`export const getRequestHeaders=()=>({'Content-Type':'application/json'});export const isGenerating=()=>false;export function saveSettingsDebounced(){window.metrics.settings++}export function saveCharacterDebounced(){window.metrics.character++}export const menu_type='characters';`);
 if(url.pathname==='/scripts/world-info.js')return res.end(worldModule());
 if(url.pathname==='/scripts/group-chats.js')return res.end('export const is_group_generating=false');
 if(url.pathname==='/scripts/st-context.js')return res.end('export const getContext=()=>window.SillyTavern.getContext()');
 const file=path.basename(url.pathname);if(!/^[a-z0-9.-]+\.(js|mjs)$/.test(file)||!fs.existsSync(path.join(__dirname,file))){res.statusCode=404;return res.end('missing')};res.end(fs.readFileSync(path.join(__dirname,file)));
});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({executablePath:process.env.MVU_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('download',()=>downloads++);page.on('dialog',()=>errors.push('unexpected confirmation'));
 const url='http://127.0.0.1:'+server.address().port;const root=page.locator('#mvu-viewer-worldbooks'),status=root.getByRole('status');
 const open=()=>page.getByRole('button',{name:'世界书管理 · 批量导出 / 删除',exact:true}).click();
 const waitCount=n=>root.getByText('共 '+n+' 本',{exact:false}).waitFor();const refresh=async n=>{await root.locator('#refresh').click();await waitCount(n)};
 await page.goto(url);await open();await waitCount(3);
 assert.equal(await root.evaluate(n=>n.shadowRoot.querySelector('main').scrollWidth<=innerWidth),true);
 await root.getByLabel('搜索世界书').fill('乙');await root.locator('#all').click();await root.getByLabel('搜索世界书').fill('');assert.equal(await root.locator('#list input:checked').count(),1);
 const d=page.waitForEvent('download');await root.locator('#export').click();await(await d).saveAs(path.join(__dirname,'worldbooks-export-test.zip'));assert.equal(deleteCount,0);
 await root.locator('#all').click();const beforeReads=readCount;resetMetrics();await root.locator('#delete').click();await status.filter({hasText:'删除成功 3/3'}).waitFor();assert.equal(listCount,1);assert.equal(deleteCount,3);assert.equal(peak,3);assert.equal(readCount,beforeReads);assert.equal(downloads,1);
 const host=await page.evaluate(()=>({cache:window.worlds.worldInfoCache.size,global:window.worlds.selected_world_info,metrics:window.metrics}));assert.equal(host.cache,0);assert.deepEqual(host.global,['untouched']);assert.equal(host.metrics.settings,1);assert.equal(host.metrics.editor,1);assert.equal(host.metrics.character,1);assert.equal(host.metrics.characterChange,1);assert.equal(host.metrics.characterWorld,'');
 await page.reload();await open();await waitCount(0);
 // 100-book performance regression: 100 deletes + 1 list refresh; exactly 3 workers.
 db=Object.fromEntries(Array.from({length:100},(_,i)=>['book-'+String(i).padStart(3,'0'),structuredClone(sample)]));await refresh(100);await root.locator('#all').click();resetMetrics();await root.locator('#delete').click();await status.filter({hasText:'删除成功 100/100'}).waitFor();assert.equal(deleteCount,100);assert.equal(listCount,1);assert.equal(peak,3);assert.equal(new Set(removed).size,100);assert.equal(Object.keys(db).length,0);
 // Failure stops new dispatch; requests already in flight settle and are verified.
 db=Object.fromEntries(['A','B','C','D','E','F'].map(n=>[n,structuredClone(sample)]));failName='A';await refresh(6);await root.locator('#all').click();resetMetrics();await root.locator('#delete').click();await status.filter({hasText:'失败或未删除'}).waitFor();assert.equal(deleteCount,3);assert.equal(active,0);assert.equal(removed.length,2);assert.equal(listCount,1);assert(db.A&&db.D&&db.E&&db.F);
 // A false success cannot pass final list verification.
 failName=null;noOpName='A';await root.locator('#clear').click();await root.getByLabel('搜索世界书').fill('A');await root.locator('#all').click();resetMetrics();await root.locator('#delete').click();await status.filter({hasText:'删除后仍在列表中'}).waitFor();assert.equal(listCount,1);assert(db.A);
 await root.locator('#clear').click();await root.locator('#delete').click();await status.filter({hasText:'请先勾选'}).waitFor();assert.equal(deleteCount,1);
 // Missing cache/cleanup contract falls back to serial native API, without the old extra per-book refresh.
 db={A:structuredClone(sample),B:structuredClone(sample),C:structuredClone(sample)};noOpName=null;fast=false;await page.reload();await open();await waitCount(3);await root.locator('#all').click();resetMetrics();await root.locator('#delete').click();await status.filter({hasText:'删除成功 3/3'}).waitFor();assert.equal(peak,1);assert.equal(deleteCount,3);assert.equal(listCount,4);
 await page.reload();await open();await waitCount(0);assert.equal(downloads,1);assert.deepEqual(errors,[]);
 console.log('PASS Chromium mobile: full entry; 100 deletes + 1 list refresh, concurrency=3; final persisted state; cache/global/current-character cleanup once; partial failure/inflight; false success; serial compatibility 3 deletes + 4 list refreshes; no backups/confirmation. Fixture host only.');
}finally{await browser?.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
