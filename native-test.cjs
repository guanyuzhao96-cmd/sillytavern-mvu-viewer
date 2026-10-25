const {JSDOM}=require(process.env.MVU_JSDOM_PATH||'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const dom=new JSDOM('<body><div id="extensions_settings2"></div></body>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.TextEncoder=TextEncoder;w.confirm=()=>true;
 const events=new Map(),table={stat_data:{system:{points:7}},other:{keep:true}};let data=structuredClone(table);
 w.SillyTavern={getContext:()=>({chatId:'native',characterId:'card',eventSource:{on:(k,f)=>events.set(k,f),off:k=>events.delete(k)}})};
 w.TavernHelper={tavern_events:{GENERATION_STARTED:'start',GENERATION_ENDED:'end'},getChatMessages:(id,o)=>[{message_id:0,name:'AI',role:'assistant',swipe_id:0,swipes:['hello']}],updateVariablesWith:(fn)=>{data=fn(structuredClone(data));}};
 w.Mvu={getMvuData:()=>structuredClone(data),events:{}};
 for(const name of ['core.js','ui.js'])w.eval(fs.readFileSync(path.join(__dirname,name),'utf8'));
 let adapter;const mount=w.MvuViewerUI.mount;w.MvuViewerUI.mount=(h,C,a,o)=>{adapter=a;return mount(h,C,a,o);};w.eval(fs.readFileSync(path.join(__dirname,'host.js'),'utf8'));
 assert.equal(w.document.querySelectorAll('#mvu-viewer-extension button').length,4);assert.equal(typeof w.getChatMessages,'undefined');
 await w.__tw_mvu_viewer_v1__.open();
 const s=new w.MvuViewerCore.Session(adapter);await s.load(0);await s.change(['system','points'],20);await s.save();assert.equal(data.stat_data.system.points,20);assert.equal(data.other.keep,true);
 events.get('start')();await s.change(['system','points'],21);await assert.rejects(()=>s.save(),/生成/);events.get('end')();await s.save();assert.equal(data.stat_data.system.points,21);
 w.__tw_mvu_viewer_v1__.dispose();assert.equal(events.size,0);assert.equal(w.document.querySelectorAll('button').length,0);
 w.MvuViewerHostStart();assert.equal(w.document.querySelectorAll('button').length,4);w.__tw_mvu_viewer_v1__.dispose();w.close();
 console.log('PASS：原生扩展上下文（无 iframe 全局函数）启动、TavernHelper 读取/保存、生成拒写、清理和重启；并非真实酒馆安装验收。');
})().catch(e=>{console.error(e);process.exitCode=1;});
