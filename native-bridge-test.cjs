const assert=require('node:assert/strict');
(async()=>{
 const {createNativeBridge}=await import('./native-bridge.mjs');
 let active=false,send=false,group=false;
 const ctx=()=>({chatId:'qa'}),script={isGenerating:()=>active};
 const bridge=createNativeBridge(script,{},ctx);assert.equal(bridge.getContext,ctx);assert.equal(bridge.generationState().active,false);active=true;assert.equal(bridge.generationState().active,true);active=false;assert.equal(bridge.generationState().active,false);
 const old={get is_send_press(){return send;}},groups={get is_group_generating(){return group;}};
 const legacy=createNativeBridge(old,groups,ctx);assert.equal(legacy.generationState().known,true);send=true;assert.equal(legacy.generationState().active,true);send=false;group=true;assert.equal(legacy.generationState().active,true);group=false;assert.equal(legacy.generationState().active,false);
 assert.equal(createNativeBridge({}, {},ctx).generationState().known,false);
 console.log('PASS: 原生生成状态实时读取、旧版发送/群聊状态回退、未知接口拒判');
})().catch(e=>{console.error(e);process.exitCode=1;});
