(function(){
  'use strict';
  if(typeof window==='undefined')return;
  const C=globalThis.MvuViewerCore;
  const H={messages:typeof getChatMessages==='function'?getChatMessages:null,update:typeof updateVariablesWith==='function'?updateVariablesWith:null,
    event:typeof eventOn==='function'?eventOn:null,button:typeof getButtonEvent==='function'?getButtonEvent:null,
    append:typeof appendInexistentScriptButtons==='function'?appendInexistentScriptButtons:null,
    tv:typeof tavern_events!=='undefined'?tavern_events:{},iv:typeof iframe_events!=='undefined'?iframe_events:{}};
  let target;try{target=window.parent;void target.document.body;}catch(_){target=window;}
  const KEY='__tw_mvu_viewer_v1__';target[KEY]?.dispose?.();
  let generating=false,updating=false,disposed=false,mvuBound=null;
  const disposers=[],listeners=new Set();
  function signal(){for(const f of listeners)Promise.resolve(f()).catch(()=>{});}
  function listen(name,callback){if(!name||!H.event)return;const d=H.event(name,callback);if(d?.stop)disposers.push(()=>d.stop());}
  function mvu(){const v=(typeof Mvu!=='undefined'?Mvu:null)||target.Mvu;if(!v||typeof v.getMvuData!=='function')throw Error('MVU 未就绪，请确认变量框架已启用，再点击刷新');return v;}
  function context(){const st=target.SillyTavern||window.SillyTavern;if(!st||typeof st.getContext!=='function')throw Error('未提供 SillyTavern 聊天身份接口，禁止写入');return st.getContext();}
  function requireHelper(){if(!H.messages)throw Error('酒馆助手消息读取接口不可用');}
  function token(id){requireHelper();const message=H.messages(id,{include_swipes:true})[0];if(!message)throw Error('消息楼层不存在');const ctx=context();
    const chatId=ctx.chatId;if(chatId===undefined||chatId===null||chatId==='')throw Error('当前没有可识别的聊天');
    return {chat_id:String(chatId),character_id:String(ctx.characterId??''),group_id:String(ctx.groupId??''),message_id:message.message_id,swipe_id:message.swipe_id??0,message_text:(message.swipes||[])[message.swipe_id??0]||''};
  }
  const adapter={
    busy:()=>generating||updating,
    latest:()=>token(-1),
    list:()=>{requireHelper();return H.messages('0-{{lastMessageId}}').map(({message_id,role,name})=>({message_id,role,name}));},
    read:async id=>{const t=token(id);const table=C.clone(mvu().getMvuData({type:'message',message_id:t.message_id}));return {token:t,table};},
    commit:async(base,stat)=>{
      if(!H.update)throw Error('酒馆助手更新接口不可用');if(adapter.busy())throw Error('正在生成或更新，禁止保存');
      if(!C.equal(token(-1),base.token))throw Error('最新楼层或消息页已变化，请刷新');
      // 固定 helper 快照中的同步 updater 在同一 JS 任务内检查并写入。
      await H.update(table=>{if(adapter.busy()||!C.equal(token(-1),base.token)||!C.equal(table,base.table))throw Error('保存冲突：数据已变化，请刷新后重改');
        const next=C.clone(table);next.stat_data=C.clone(stat);return next;
      },{type:'message',message_id:base.token.message_id});
      if(!C.equal(token(-1),base.token))throw Error('写入期间聊天发生变化，请检查实际数据');
    },
    subscribe:f=>{listeners.add(f);return()=>listeners.delete(f);}
  };
  const host=target.document.createElement('div');host.id='tw-mvu-viewer-v1';host.hidden=true;target.document.body.append(host);
  const app=globalThis.MvuViewerUI.mount(host,C,adapter);
  const launch=target.document.createElement('button');launch.type='button';launch.textContent='MVU 数据';launch.setAttribute('aria-label','打开 MVU 数据查看器');
  Object.assign(launch.style,{position:'fixed',right:'12px',bottom:'calc(80px + env(safe-area-inset-bottom))',zIndex:'2147482000',border:'1px solid #cbd9e5',borderRadius:'8px',padding:'9px 12px',fontSize:'13px',background:'#f4f8fc',color:'#275f8a',boxShadow:'0 2px 10px #0002'});
  function open(){app.open().catch(e=>{host.hidden=false;const s=app.shadow.querySelector('.status');s.textContent=e.message;s.className='status error';});}
  launch.onclick=open;target.document.body.append(launch);
  if(H.append&&H.button&&H.event){H.append([{name:'MVU 数据',visible:true}]);listen(H.button('MVU 数据'),open);}
  for(const k of ['CHAT_CHANGED','MESSAGE_SWIPED','MESSAGE_SENT','MESSAGE_RECEIVED','MESSAGE_DELETED','MESSAGE_UPDATED','MESSAGE_EDITED'])listen(H.tv[k],signal);
  listen(H.tv.GENERATION_STARTED,()=>{generating=true;signal();});listen(H.tv.GENERATION_ENDED,()=>{generating=false;signal();});listen(H.tv.GENERATION_STOPPED,()=>{generating=false;updating=false;signal();});
  // 不复制事件字符串；使用实际安装导出的常量。
  const poll=setInterval(()=>{try{const v=mvu();if(v===mvuBound)return;mvuBound=v;listen(v.events?.VARIABLE_UPDATE_STARTED,()=>{updating=true;signal();});listen(v.events?.VARIABLE_UPDATE_ENDED,()=>{updating=false;setTimeout(signal,120);});}catch(_){}},1000);
  const api={open,dispose(){if(disposed)return;disposed=true;clearInterval(poll);for(const f of disposers)f();listeners.clear();app.dispose();launch.remove();window.removeEventListener('pagehide',api.dispose);if(target[KEY]===api)delete target[KEY];}};
  target[KEY]=api;window.addEventListener('pagehide',api.dispose);
})();
