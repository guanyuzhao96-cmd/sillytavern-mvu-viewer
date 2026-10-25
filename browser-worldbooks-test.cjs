// Actual browser, complete native entry; persistent HTTP host fixture, not a live user Tavern.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const sample={entries:{0:{uid:0,key:['测试'],content:'保留中文',extensions:{unknown:42}}},unknown:{retain:true}};
let db={'甲/世界书':structuredClone(sample),'乙世界书':structuredClone(sample),'丙世界书':structuredClone(sample)},deleted=[],failName=null;
const html=`<meta name="viewport" content="width=device-width,initial-scale=1"><style>.menu_button{width:min-content}body{margin:8px}</style><div id="extensions_settings2"></div><script type="module">window.SillyTavern={getContext:()=>({eventSource:{on(){},off(){}},eventTypes:{}})};await import('/scripts/extensions/third-party/mvu/index-v1.6.0.js');</script>`;
const worldModule=`export let world_names=[];export async function updateWorldInfoList(){world_names=await fetch('/list').then(r=>r.json())}export async function deleteWorldInfo(name){return (await fetch('/delete',{method:'POST',body:JSON.stringify({name})})).ok}`;
(async()=>{const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');let body='';for await(const c of req)body+=c;
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html)}
 if(url.pathname==='/list'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(Object.keys(db)))}
 if(url.pathname==='/api/worldinfo/get'){const n=JSON.parse(body).name;res.setHeader('Content-Type','application/json');if(!db[n])res.statusCode=404;return res.end(JSON.stringify(db[n]||{}))}
 if(url.pathname==='/delete'){const n=JSON.parse(body).name;if(n===failName){res.statusCode=500;return res.end('fixture failure')}delete db[n];deleted.push(n);return res.end('ok')}
 res.setHeader('Content-Type','text/javascript');
 if(url.pathname==='/script.js')return res.end(`export const getRequestHeaders=()=>({'Content-Type':'application/json'});export const isGenerating=()=>false;`);
 if(url.pathname==='/scripts/world-info.js')return res.end(worldModule);
 if(url.pathname==='/scripts/group-chats.js')return res.end('export const is_group_generating=false');
 if(url.pathname==='/scripts/st-context.js')return res.end('export const getContext=()=>window.SillyTavern.getContext()');
 const file=path.basename(url.pathname);if(!/^[a-z0-9.-]+\.(js|mjs)$/.test(file)||!fs.existsSync(path.join(__dirname,file))){res.statusCode=404;return res.end('missing')};res.end(fs.readFileSync(path.join(__dirname,file)));
});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({executablePath:process.env.MVU_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));const url='http://127.0.0.1:'+server.address().port;await page.goto(url);
const open=()=>page.getByRole('button',{name:'世界书管理 · 批量导出 / 删除',exact:true}).click();await open();const root=page.locator('#mvu-viewer-worldbooks'),status=root.getByRole('status');await root.getByText('共 3 本',{exact:false}).waitFor();
assert.equal(await root.locator('#list input').count(),3);await page.screenshot({path:path.join(__dirname,'worldbooks-mobile-test.png')});const box=await root.locator('#export').boundingBox();assert(box.width>130);assert.equal(await root.evaluate(n=>n.shadowRoot.querySelector('main').scrollWidth<=innerWidth),true);
await root.getByLabel('搜索世界书').fill('乙');await root.getByRole('button',{name:'全选搜索结果',exact:true}).click();await root.getByLabel('搜索世界书').fill('');assert.equal(await root.locator('#list input:checked').count(),1);
let d=page.waitForEvent('download');await root.getByRole('button',{name:'批量导出',exact:true}).click();let dl=await d;await dl.saveAs(path.join(__dirname,'worldbooks-export-test.zip'));assert.equal(deleted.length,0);
await root.getByRole('button',{name:'全选搜索结果',exact:true}).click();d=page.waitForEvent('download');await root.getByRole('button',{name:'批量删除',exact:true}).click();await d;assert.equal(deleted.length,0);assert.equal(await root.locator('#execute').isEnabled(),false);await root.getByRole('button',{name:'取消',exact:true}).click();assert.equal(deleted.length,0);
// A worldbook changed after backup: preflight must prevent every deletion.
d=page.waitForEvent('download');await root.getByRole('button',{name:'批量删除',exact:true}).click();await d;db['乙世界书'].entries[0].content='备份后修改';await root.locator('#ack').check();await root.locator('#execute').click();await status.filter({hasText:'已变化'}).waitFor();assert.equal(deleted.length,0);
d=page.waitForEvent('download');await root.getByRole('button',{name:'批量删除',exact:true}).click();dl=await d;await dl.saveAs(path.join(__dirname,'worldbooks-backup-test.zip'));await root.locator('#ack').check();await root.locator('#execute').click();await status.filter({hasText:'删除成功 3/3'}).waitFor();assert.equal(Object.keys(db).length,0);assert.equal(deleted.length,3);
await page.reload();await open();await root.getByText('共 0 本',{exact:false}).waitFor();assert.equal(await root.locator('#list input').count(),0);// Stop after partial failure, retain undeleted books and show the partial result.
db={'A':structuredClone(sample),'B':structuredClone(sample),'C':structuredClone(sample)};failName='B';await root.locator('#refresh').click();await root.getByText('共 3 本',{exact:false}).waitFor();await root.locator('#all').click();d=page.waitForEvent('download');await root.locator('#delete').click();await d;await root.locator('#ack').check();await root.locator('#execute').click();await status.filter({hasText:'删除成功 1/3'}).waitFor();assert.deepEqual(Object.keys(db),['B','C']);assert.equal(deleted.length,4);assert.deepEqual(errors,[]);console.log('PASS Chromium mobile: complete native entry, search/select, ZIP export, cancel, backup acknowledgement, conflict prevents writes, delete all, refresh persistence; fixture host only.');
}finally{await browser?.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
