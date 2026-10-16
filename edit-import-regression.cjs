const {JSDOM}=require('jsdom'),fs=require('node:fs'),assert=require('node:assert/strict');
const tick=()=>new Promise(r=>setTimeout(r,15));
async function run(){
 const dom=new JSDOM('<body><div id="mes_stop" style="display:none"></div><div id="extensions_settings2"></div></body>',{url:'https://qa.invalid',runScripts:'outside-only'}),w=dom.window;w.TextEncoder=TextEncoder;
 let table={stat_data:{system:{points:70}},metadata:{preserve:true}},writes=0;
 w.SillyTavern={getContext:()=>({chatId:'regression',characterId:1})};
 w.TavernHelper={getChatMessages:()=>[{message_id:0,name:'AI',role:'assistant',swipe_id:0,swipes:['unchanged']}],updateVariablesWith:async fn=>{table=fn(structuredClone(table));writes++;}};
 w.Mvu={getMvuData:()=>structuredClone(table),events:{}};
 for(const f of ['core.js','ui.js'])w.eval(fs.readFileSync(f,'utf8'));
 w.eval(fs.readFileSync('host.js','utf8'));
 await w.__tw_mvu_viewer_v1__.open();const s=w.document.getElementById('tw-mvu-viewer-v1').shadowRoot;
 const button=t=>[...s.querySelectorAll('button')].find(b=>b.textContent===t);
 button('系统与技能').click();await tick();
 assert.equal(button('编辑').disabled,false);assert.equal(button('导入').disabled,false);
 button('编辑').click();await tick();let value=s.querySelector('.dialog textarea');value.value='123';button('加入修改').click();await tick();button('保存修改').click();await tick();button('确认保存').click();await tick();assert.equal(table.stat_data.system.points,123);assert.equal(writes,1);
 button('导入').click();await tick();const file=s.querySelector('input[type=file]');Object.defineProperty(file,'files',{value:[{size:100,text:async()=>JSON.stringify({format:'mvu-viewer-export',version:1,data:{stat_data:{system:{points:456}}}})}]});await file.onchange();button('预览差异').click();await tick();button('确认保存').click();await tick();assert.equal(table.stat_data.system.points,456);assert.equal(table.metadata.preserve,true);assert.equal(writes,2);
 await w.__tw_mvu_viewer_v1__.open();assert.equal(button('导入').disabled,false);assert(s.textContent.includes('456'));
 // UI stop indicator covers non-streaming generation when event subscription is absent.
 w.document.getElementById('mes_stop').style.display='block';await w.__tw_mvu_viewer_v1__.open();assert.equal(button('编辑').disabled,false);assert.equal(button('导入').disabled,false);button('编辑').click();await tick();s.querySelector('.dialog textarea').value='888';button('加入修改').click();await tick();button('保存修改').click();await tick();button('确认保存').click();await tick();assert.equal(writes,2);assert(s.textContent.includes('正在生成'));button('返回编辑').click();await tick();button('取消修改').click();await tick();
 w.document.getElementById('mes_stop').remove();await w.__tw_mvu_viewer_v1__.open();assert.equal(button('导入').disabled,false);button('编辑').click();await tick();s.querySelector('.dialog textarea').value='999';button('加入修改').click();await tick();button('保存修改').click();await tick();button('确认保存').click();await tick();assert.equal(writes,2);assert(s.textContent.includes('无法确认生成状态'));
 w.__tw_mvu_viewer_v1__.dispose();w.close();
}
(async()=>{await run();console.log('PASS: 无事件接口时草稿编辑、文件导入、保存、重读；生成中可编辑草稿但拒绝写入；状态未知保留草稿。DOM/宿主模拟，非云酒馆实测。');})().catch(e=>{console.error(e);process.exitCode=1;});
