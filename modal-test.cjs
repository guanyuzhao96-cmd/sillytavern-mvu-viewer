const {JSDOM}=require('jsdom');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
const d=new JSDOM('<body><dialog open><div id="extensions_settings2"></div></dialog></body>',{url:'https://qa.invalid',runScripts:'outside-only'}),w=d.window;
const opened=[];w.HTMLDialogElement.prototype.showModal=function(){this.open=true;opened.push(this);};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
w.TextEncoder=TextEncoder;w.SillyTavern={getContext:()=>({chatId:'qa'})};
for(const name of ['core','ui','cleanup','gallery-model','gallery'])w.eval(fs.readFileSync(name+'.js','utf8'));
w.eval(fs.readFileSync('host.js','utf8'));
w.__tw_mvu_viewer_v1__.openCleanup();await new Promise(r=>setTimeout(r,0));
const page=w.document.getElementById('mvu-viewer-cleanup'),shell=page.parentElement,s=page.shadowRoot;
assert.equal(shell.tagName,'DIALOG');assert.equal(shell.open,true);assert.equal(opened.at(-1),shell);
assert([...s.querySelectorAll('header button')].some(b=>b.textContent==='添加规则'));
page.hidden=true;await new Promise(r=>setTimeout(r,0));assert.equal(shell.open,false);
w.__tw_mvu_viewer_v1__.openCleanup();await new Promise(r=>setTimeout(r,0));assert.equal(shell.open,true);
w.__tw_mvu_viewer_v1__.openGallery();await new Promise(r=>setTimeout(r,0));
const gallery=w.document.getElementById('mvu-viewer-gallery');assert.equal(gallery.parentElement.open,true);assert.equal(opened.at(-1),gallery.parentElement);
w.__tw_mvu_viewer_v1__.dispose();assert.equal(w.document.querySelectorAll('dialog').length,1);w.close();
console.log('PASS: 模态容器调用、关闭重开、图鉴入口、顶部添加规则与清理（DOM模拟；不证明真实层级布局）');
})().catch(e=>{console.error(e);process.exitCode=1;});
