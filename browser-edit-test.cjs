// Real Chromium clicks against the complete native entry. Host data/APIs are fixtures.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),chromiumArgs=require('@sparticuz/chromium').default.args;
const oldSources=Object.fromEntries(['core.js','ui.js','host.js'].map(f=>[f,require('node:child_process').execFileSync('git',['show','8e66fbad467b86d7f2bfc03e2a6027e94b25750d:'+f],{encoding:'utf8'})]));
let baseline=true;
const initial={stat_data:{system:{points:70},roles:{}},external:{preserve:true}};
let state=structuredClone(initial),writes=0;
const html=`<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MVU 原生扩展编辑回归 · 测试宿主</title><style>body{font:14px sans-serif;margin:8px}dialog{width:100%;max-width:440px;height:94vh;padding:8px;box-sizing:border-box}#extensions_settings2{width:100%}.inline-drawer-content{display:block}.menu_button{width:min-content;display:flex;align-items:center;justify-content:center;white-space:normal}</style><dialog id="settings"><p>原生扩展编辑回归 · 测试宿主（非用户云酒馆）</p><div id="extensions_settings2"></div><button id="error-stream">模拟已停止的错误流</button><button id="active">模拟生成中</button><button id="idle">模拟生成结束</button><output id="write"></output></dialog><script type="module">
import {events,setActive} from '/script.js';
let table=await fetch('/state.json').then(r=>r.json());
const context={chatId:'qa-chat',characterId:0,eventSource:events,eventTypes:{GENERATION_STARTED:'start',GENERATION_ENDED:'end'},streamingProcessor:{isFinished:false,isStopped:true,abortController:{signal:{aborted:true}}}};
window.testContext=context;window.SillyTavern={getContext:()=>context};
window.TavernHelper={getChatMessages:(id)=>{const record=n=>({message_id:n,name:'AI',role:'assistant',swipe_id:0,swipes:['测试正文']});return typeof id==='string'?[record(0),record(2)]:[record(id===-1?2:id)];},updateVariablesWith:async(fn,{message_id})=>{if(message_id!==2)throw Error('历史拒写');const next=fn(structuredClone(table));await fetch('/save',{method:'POST',body:JSON.stringify(next)});table=next;document.getElementById('write').textContent='已保存系统点：'+table.stat_data.system.points;}};
window.Mvu={events:{},getMvuData:({message_id})=>structuredClone(message_id===0?{stat_data:{system:{points:1}}}:table)};
document.getElementById('settings').showModal();
document.getElementById('error-stream').onclick=()=>{setActive(false);events.emit('start');};
document.getElementById('active').onclick=()=>{setActive(true);events.emit('start');};
document.getElementById('idle').onclick=()=>{setActive(false);events.emit('end');};
await import('/scripts/extensions/third-party/mvu/index-v1.5.3.js');
</script></html>`;
const nativeScript=`let active=false;const map=new Map();export const isGenerating=()=>active;export function setActive(v){active=v}export const events={on(n,f){if(!map.has(n))map.set(n,new Set());map.get(n).add(f)},off(n,f){map.get(n)?.delete(f)},emit(n){for(const f of map.get(n)||[])f()}};`;
(async()=>{
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.setHeader('content-type','text/html;charset=utf-8');res.end(baseline?html.replace('index-v1.5.3.js','index-v1.4.3.js'):html);return;}
  if(url.pathname==='/state.json'){res.setHeader('content-type','application/json');res.end(JSON.stringify(state));return;}
  if(url.pathname==='/save'){let data='';for await(const c of req)data+=c;state=JSON.parse(data);writes++;res.end('ok');return;}
  if(url.pathname==='/script.js'){res.setHeader('content-type','text/javascript');res.end(nativeScript);return;}
  if(url.pathname==='/scripts/group-chats.js'){res.setHeader('content-type','text/javascript');res.end('export const is_group_generating=false;');return;}
  if(url.pathname==='/scripts/st-context.js'){res.setHeader('content-type','text/javascript');res.end('export const getContext=()=>window.testContext;');return;}
  const prefix='/scripts/extensions/third-party/mvu/';
  if(url.pathname.startsWith(prefix)){const name=url.pathname.slice(prefix.length);if(name.includes('/')||!fs.existsSync(path.join(__dirname,name))){res.writeHead(404);res.end();return;}res.setHeader('content-type','text/javascript');res.end(baseline&&oldSources[name]?oldSources[name]:fs.readFileSync(path.join(__dirname,name)));return;}
  res.writeHead(404);res.end();
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.MVU_CHROMIUM_PATH||'/tmp/chromium',args:chromiumArgs,headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR:',e.message);});page.on('console',m=>{if(m.type()==='error')console.error('BROWSER:',m.text());});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('button',{name:'读取或刷新当前 MVU 数据',exact:true}).click();
  const viewer=page.locator('#tw-mvu-viewer-v1');await viewer.getByRole('button',{name:'系统与技能',exact:true}).click();
  assert.equal(await viewer.getByRole('button',{name:'编辑',exact:true}).isEnabled(),false);assert.equal(await viewer.getByRole('button',{name:'导入',exact:true}).isEnabled(),false);assert.equal(writes,0);
  baseline=false;await page.reload();await page.screenshot({path:path.join(__dirname,'entry-mobile-verified.png')});await page.getByRole('button',{name:'读取或刷新当前 MVU 数据',exact:true}).click();await viewer.getByRole('button',{name:'系统与技能',exact:true}).click();
  const menuButtons=page.locator('#mvu-viewer-extension .mvu-viewer-menu-button');assert.equal(await menuButtons.count(),3);for(let i=0;i<3;i++){const box=await menuButtons.nth(i).boundingBox();assert(box&&box.width>350,`入口按钮 ${i} 应铺满手机设置栏，实际宽度=${box?.width}`);assert.equal(await menuButtons.nth(i).evaluate(n=>getComputedStyle(n).width),await menuButtons.nth(i).evaluate(n=>`${n.getBoundingClientRect().width}px`));}
  const edit=()=>viewer.getByRole('button',{name:'编辑',exact:true});assert(await edit().isEnabled());assert(await viewer.getByRole('button',{name:'导入',exact:true}).isEnabled());
  await page.getByRole('button',{name:'模拟已停止的错误流',exact:true}).click();assert(await edit().isEnabled());
  await edit().click();await viewer.locator('.dialog textarea').fill('123');await viewer.getByRole('button',{name:'加入修改',exact:true}).click();await viewer.getByRole('button',{name:'保存修改',exact:true}).click();await viewer.getByRole('button',{name:'确认保存',exact:true}).click();await viewer.getByText('保存成功，已重新读取核对。',{exact:false}).waitFor();assert.equal(state.stat_data.system.points,123);assert.equal(writes,1);
  await page.reload();await page.getByRole('button',{name:'读取或刷新当前 MVU 数据',exact:true}).click();await viewer.getByRole('button',{name:'系统与技能',exact:true}).click();await viewer.getByText('123',{exact:true}).waitFor();
  await viewer.getByRole('button',{name:'导入',exact:true}).click();await viewer.locator('input[type=file]').setInputFiles({name:'mvu-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'mvu-viewer-export',version:1,data:{stat_data:{system:{points:456}}}}))});
  await page.waitForFunction(()=>document.getElementById('tw-mvu-viewer-v1').shadowRoot.querySelector('.dialog textarea').value.includes('456'));
  await viewer.getByRole('button',{name:'预览差异',exact:true}).click();await viewer.getByRole('button',{name:'确认保存',exact:true}).click();await viewer.getByText('保存成功，已重新读取核对。',{exact:false}).waitFor();assert.equal(state.stat_data.system.points,456);assert.equal(state.external.preserve,true);assert.equal(writes,2);
  await page.getByRole('button',{name:'模拟生成中',exact:true}).click();assert(await edit().isEnabled());await edit().click();await viewer.locator('.dialog textarea').fill('789');await viewer.getByRole('button',{name:'加入修改',exact:true}).click();await viewer.getByRole('button',{name:'保存修改',exact:true}).click();await viewer.getByRole('button',{name:'确认保存',exact:true}).click();await viewer.getByText('AI 正在生成；草稿已保留，结束后可保存',{exact:true}).waitFor();assert.equal(writes,2);
  await viewer.getByRole('button',{name:'返回编辑',exact:true}).click();await page.getByRole('button',{name:'模拟生成结束',exact:true}).click();await viewer.getByRole('button',{name:'保存修改',exact:true}).click();await viewer.getByRole('button',{name:'确认保存',exact:true}).click();await viewer.getByText('保存成功，已重新读取核对。',{exact:false}).waitFor();assert.equal(writes,3);assert.equal(state.stat_data.system.points,789);
  await page.reload();await page.getByRole('button',{name:'读取或刷新当前 MVU 数据',exact:true}).click();await viewer.getByRole('button',{name:'系统与技能',exact:true}).click();await viewer.getByText('789',{exact:true}).waitFor();await page.screenshot({path:path.join(__dirname,'edit-mobile-verified.png')});
  await viewer.getByLabel('选择楼层').selectOption('0');await viewer.getByText('只读 ·',{exact:false}).waitFor();assert.equal(await edit().isEnabled(),false);
  assert.deepEqual(errors,[]);console.log('PASS: Chromium '+await browser.version()+' 手机390×844；模拟酒馆 menu_button=min-content 样式后入口仍铺满；原生入口模块加载；实际点击编辑/保存；File上传导入/保存；刷新HTTP数据读回；停止错误流/过期事件恢复；生成中只存草稿；历史拒写。宿主API与服务端为测试夹具，非用户实机。');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
