const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.MVU_JSDOM_PATH||'jsdom');
const pause=()=>new Promise(r=>setTimeout(r,30));
(async()=>{
  const errors=[];const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'MVU数据查看器_交互预览_v1.0.html'),'utf8'),{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){w.TextEncoder=TextEncoder;w.confirm=()=>true;w.URL.createObjectURL=()=> 'blob:mock';w.URL.revokeObjectURL=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};}});const w=dom.window;w.addEventListener('error',e=>errors.push(e.message));await pause();
  const app=w.demoApp,sh=app.shadow;
  const byText=(selector,text)=>[...sh.querySelectorAll(selector)].find(n=>n.textContent===text);
  async function click(text){const b=byText('button',text);assert(b,'按钮存在：'+text);assert(!b.disabled,'按钮未禁用：'+text);b.click();await pause();}
  assert.match(sh.querySelector('.status').textContent,/读取成功/);
  await click('系统与技能');let row=()=>[...sh.querySelectorAll('.row')].find(n=>n.querySelector('.key')?.textContent==='系统点');
  row().querySelector('button').click();await pause();sh.querySelector('.dialog textarea').value='120';await click('加入修改');await click('保存修改');await click('确认保存');assert.equal(row().querySelector('.value').textContent,'120');
  await click('撤销上次保存');assert.equal(row().querySelector('.value').textContent,'70');
  await click('导入');sh.querySelector('.dialog textarea').value='{"system":{"points":150}}';await click('预览差异');assert.match(sh.querySelector('.dialog').textContent,/150/);await click('确认保存');assert.equal(row().querySelector('.value').textContent,'150');
  const floor=sh.querySelector('header select');floor.value='0';floor.dispatchEvent(new w.Event('change'));await pause();assert.equal(byText('button','导入').disabled,true);assert.equal(row().querySelector('button').disabled,true);
  await click('最新楼');const search=sh.querySelector('input[aria-label="搜索数据"]');search.value='未识别字段';search.dispatchEvent(new w.Event('input'));await new Promise(r=>setTimeout(r,200));assert.match(sh.querySelector('main').textContent,/也会完整显示/);
  search.value='';search.dispatchEvent(new w.Event('input'));await new Promise(r=>setTimeout(r,200));await click('本轮变化');assert.match(sh.querySelector('main').textContent,/与 #0/);
  await click('新增字段');sh.querySelector('.dialog input').value='/custom/安全测试';sh.querySelector('.dialog textarea').value='<img src=x onerror=alert(1)>';await click('加入修改');await click('概览');search.value='安全测试';search.dispatchEvent(new w.Event('input'));await new Promise(r=>setTimeout(r,200));assert.match(sh.querySelector('main').textContent,/<img/);assert.equal(sh.querySelectorAll('img').length,0);
  await click('取消修改');assert.equal(app.session.changes().length,0);assert.deepEqual(errors,[]);app.dispose();w.close();console.log('PASS：DOM 交互：编辑、保存、撤销、导入差异、历史只读、搜索、楼层对比、新增、取消、HTML 文本安全。此检查不验证真实布局。');
})().catch(e=>{console.error(e);process.exitCode=1;});
