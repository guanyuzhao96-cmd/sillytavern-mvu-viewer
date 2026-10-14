const {JSDOM}=require(process.env.MVU_JSDOM_PATH||'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
const dom=new JSDOM('<body></body>',{runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;w.TextEncoder=TextEncoder;w.confirm=()=>true;
let chat='a',swipe=0,latest=2,updates=0;const tables={0:{stat_data:{system:{points:1}}},2:{stat_data:{system:{points:70}},initialized_lorebooks:{book:[]},external:{keep:1}}};const events=new Map();
w.SillyTavern={getContext:()=>({chatId:chat,characterId:'card',groupId:''})};w.Mvu={getMvuData:({message_id})=>structuredClone(tables[message_id]),events:{VARIABLE_UPDATE_STARTED:'start',VARIABLE_UPDATE_ENDED:'end'}};
w.tavern_events={CHAT_CHANGED:'chat',GENERATION_STARTED:'gen-start',GENERATION_ENDED:'gen-end'};
w.getChatMessages=(id,opt)=>{if(typeof id==='string'&&id.startsWith('0-'))return [0,latest].map(message_id=>({message_id,name:'AI',role:'assistant'}));return [{message_id:id===-1?latest:id,name:'AI',role:'assistant',swipe_id:swipe,swipes:['hello','alternate']}];};
w.updateVariablesWith=(fn,{message_id})=>{tables[message_id]=fn(structuredClone(tables[message_id]));updates++;return tables[message_id];};w.eventOn=(name,fn)=>{events.set(name,fn);return {stop:()=>events.delete(name)};};w.appendInexistentScriptButtons=()=>{};w.getButtonEvent=()=> 'open';
w.eval(fs.readFileSync(path.join(__dirname,'core.js'),'utf8'));w.eval(fs.readFileSync(path.join(__dirname,'ui.js'),'utf8'));const mount=w.MvuViewerUI.mount;let adapter;w.MvuViewerUI.mount=(host,C,a,options)=>{adapter=a;return mount(host,C,a,options);};w.eval(fs.readFileSync(path.join(__dirname,'host.js'),'utf8'));
await w.__tw_mvu_viewer_v1__.open();const C=w.MvuViewerCore,s=new C.Session(adapter);await s.load(2);await s.change(['system','points'],120);await s.save();assert.equal(tables[2].stat_data.system.points,120);assert.equal(tables[2].external.keep,1);assert.equal(updates,1);
await s.change(['system','points'],130);swipe=1;await assert.rejects(()=>s.save(),/变化/);assert.equal(updates,1);swipe=0;chat='b';await assert.rejects(()=>s.save(),/变化/);chat='a';events.get('gen-start')();await assert.rejects(()=>s.save(),/生成/);events.get('gen-end')();latest=3;await assert.rejects(()=>s.save(),/变化/);assert.equal(updates,1);
w.__tw_mvu_viewer_v1__.dispose();assert.equal(w.document.querySelectorAll('button').length,0);assert.equal(events.size,0);w.close();console.log('PASS：宿主接口模拟：明确楼层、元信息保留、切页/切聊天/生成/新消息拒写、监听器与入口清理。未证明实机持久化。');
})().catch(e=>{console.error(e);process.exitCode=1;});
