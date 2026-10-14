const {JSDOM}=require(process.env.MVU_JSDOM_PATH||'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const src=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,20));
(async()=>{
 for(const mode of ['normal','module-shim','body-not-ready','mount-failure','missing-ui','dispose-before-body']){
  const dom=new JSDOM('<body><div id="extensions_settings2"></div></body>',{runScripts:'outside-only'}),w=dom.window;w.TextEncoder=TextEncoder;
  if(mode==='module-shim')w.module={exports:{keep:true}};
  if(mode==='body-not-ready'||mode==='dispose-before-body')w.document.body.remove();
  w.eval(src('core.js'));w.eval(src('ui.js'));
  if(mode==='mount-failure')w.MvuViewerUI.mount=()=>{throw Error('模拟面板启动失败');};
  if(mode==='missing-ui')delete w.MvuViewerUI;
  w.eval(src('host.js'));
  if(mode==='dispose-before-body'){w.__tw_mvu_viewer_v1__.dispose();w.document.documentElement.append(w.document.createElement('body'));await tick();assert.equal(w.document.querySelectorAll('button').length,0);w.close();continue;}
  if(mode==='body-not-ready'){assert.equal(w.document.querySelectorAll('button').length,0);const b=w.document.createElement('body');b.innerHTML='<div id="extensions_settings2"></div>';w.document.documentElement.append(b);await tick();}
  assert.equal(w.document.querySelectorAll('#mvu-viewer-extension').length,1,mode+' must have extension drawer item');
  if(mode==='module-shim'){assert(w.MvuViewerCore.Session);assert.equal(w.module.exports.keep,true);}
  if(mode==='mount-failure'||mode==='missing-ui'){await w.__tw_mvu_viewer_v1__.open();assert(w.document.querySelector('[role="alert"]'));assert.match(w.document.querySelector('[role="alert"]').textContent,/启动失败/);assert(w.document.querySelector('#mvu-viewer-extension button').textContent.includes('启动失败'));}
  w.__tw_mvu_viewer_v1__.dispose();assert.equal(w.document.querySelectorAll('button').length,0);w.close();
 }
 console.log('PASS：正常启动、module shim、延迟 body、面板异常、缺失界面、等待时停用（6 组）；入口创建不依赖 MVU 数据。');
})().catch(e=>{console.error(e);process.exitCode=1;});
