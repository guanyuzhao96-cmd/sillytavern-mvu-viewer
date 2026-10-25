(function(){
  'use strict';
  globalThis.MvuViewerHostStart=function(){
  if(typeof window==='undefined')return;
  const C=globalThis.MvuViewerCore;
  const H={messages:typeof getChatMessages==='function'?getChatMessages:null,update:typeof updateVariablesWith==='function'?updateVariablesWith:null,
    event:typeof eventOn==='function'?eventOn:null,button:typeof getButtonEvent==='function'?getButtonEvent:null,
    append:typeof appendInexistentScriptButtons==='function'?appendInexistentScriptButtons:null,
    tv:typeof tavern_events!=='undefined'?tavern_events:{},iv:typeof iframe_events!=='undefined'?iframe_events:{}};
  let target;try{target=window.parent;void target.document.body;}catch(_){target=window;}
  const native=typeof getButtonEvent!=='function';
  if(native)target=window;
  const helperMessage=H.messages,helperUpdate=H.update;
  H.messages=(...args)=>{const fn=helperMessage||target.TavernHelper?.getChatMessages;if(typeof fn!=='function')throw Error('酒馆助手未就绪，请启用后刷新');return fn(...args);};
  H.update=(...args)=>{const fn=helperUpdate||target.TavernHelper?.updateVariablesWith;if(typeof fn!=='function')throw Error('酒馆助手更新接口不可用');return fn(...args);};
  const KEY='__tw_mvu_viewer_v1__';target[KEY]?.dispose?.();
  if(!target.document.body){
    let stopped=false;
    const resume=()=>{if(!stopped&&target.document.body){pending.dispose();globalThis.MvuViewerHostStart();}};
    const observer=new target.MutationObserver(resume);
    const pending={dispose(){if(stopped)return;stopped=true;observer.disconnect();target.document.removeEventListener('DOMContentLoaded',resume);window.removeEventListener('pagehide',pending.dispose);if(target[KEY]===pending)delete target[KEY];}};
    target[KEY]=pending;observer.observe(target.document,{childList:true,subtree:true});target.document.addEventListener('DOMContentLoaded',resume);window.addEventListener('pagehide',pending.dispose);return;
  }
  let generating=false,updating=false,disposed=false,mvuBound=null;
  const disposers=[],listeners=new Set();
  function signal(){for(const f of listeners)Promise.resolve(f()).catch(()=>{});}
  function listen(name,callback){if(!name)return;if(H.event){const d=H.event(name,callback);if(typeof d==='function')disposers.push(d);else if(d?.stop)disposers.push(()=>d.stop());}else{const source=context().eventSource;const off=source?.removeListener||source?.off;if(!source||typeof source.on!=='function'||typeof off!=='function')throw Error('宿主事件接口不可用');source.on(name,callback);disposers.push(()=>off.call(source,name,callback));}}
  function mvu(){const v=(typeof Mvu!=='undefined'?Mvu:null)||target.Mvu;if(!v||typeof v.getMvuData!=='function')throw Error('MVU 未就绪，请确认变量框架已启用，再点击刷新');return v;}
  function context(){const bridge=target.MvuViewerNativeBridge;if(typeof bridge?.getContext==='function')return bridge.getContext();const st=target.SillyTavern||window.SillyTavern;if(!st||typeof st.getContext!=='function')throw Error('未提供 SillyTavern 聊天身份接口，禁止写入');return st.getContext();}
  function requireHelper(){if(!H.messages)throw Error('酒馆助手消息读取接口不可用');}
  function generationState(){
    const bridge=target.MvuViewerNativeBridge;
    if(typeof bridge?.generationState==='function'){const state=bridge.generationState();if(state.known)return state;}
    const ctx=context();
    if(ctx.streamingProcessor&&!ctx.streamingProcessor.isFinished&&!ctx.streamingProcessor.isStopped&&!ctx.streamingProcessor.abortController?.signal?.aborted)return {known:true,active:true};
    const stop=target.document.getElementById('mes_stop');
    if(stop){let visible=!stop.hidden;for(let n=stop;n&&visible;n=n.parentElement){const style=target.getComputedStyle(n);visible=style.display!=='none'&&style.visibility!=='hidden'&&style.visibility!=='collapse';}return {known:true,active:visible};}
    return {known:eventsBound,active:generating};
  }
  function token(id){requireHelper();const message=H.messages(id,{include_swipes:true})[0];if(!message)throw Error('消息楼层不存在');const ctx=context();
    const chatId=ctx.chatId;if(chatId===undefined||chatId===null||chatId==='')throw Error('当前没有可识别的聊天');
    return {chat_id:String(chatId),character_id:String(ctx.characterId??''),group_id:String(ctx.groupId??''),message_id:message.message_id,swipe_id:message.swipe_id??0,message_text:(message.swipes||[])[message.swipe_id??0]||''};
  }
  const adapter={
    busy:()=>updating||generationState().active,
    busyReason:()=>updating?'MVU 正在更新变量；草稿已保留，完成后可保存':generationState().active?'AI 正在生成；草稿已保留，结束后可保存':'',
    latest:()=>token(-1),
    list:()=>{requireHelper();return H.messages('0-{{lastMessageId}}').map(({message_id,role,name})=>({message_id,role,name}));},
    read:async id=>{const t=token(id);const table=C.clone(mvu().getMvuData({type:'message',message_id:t.message_id}));return {token:t,table};},
    commit:async(base,stat)=>{
      if(!generationState().known)throw Error('无法确认生成状态；草稿已保留，尚未写入。请先打开酒馆聊天界面再保存');
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
  let drawer=null,host=target.document.createElement('div');host.id='tw-mvu-viewer-v1';host.hidden=true;
  let app=null,errorPanel=null,cleanupApp=null,galleryApp=null,worldbooksApp=null;
  function createPage(id){
    const shell=target.document.createElement('dialog'),page=target.document.createElement('div');
    shell.setAttribute('aria-label',id==='mvu-viewer-worldbooks'?'世界书管理':id==='mvu-viewer-gallery'?'角色图鉴':'聊天瘦身');
    Object.assign(shell.style,{position:'fixed',inset:'0',margin:'0',padding:'0',border:'0',width:'100vw',height:'100dvh',maxWidth:'none',maxHeight:'none',overflow:'hidden'});
    page.id=id;page.hidden=true;shell.append(page);target.document.body.append(shell);
    const sync=()=>{if(page.hidden){if(shell.open)shell.close();}else if(!shell.open){if(typeof shell.showModal==='function')shell.showModal();else shell.setAttribute('open','');}};
    const observer=new target.MutationObserver(sync);observer.observe(page,{attributes:true,attributeFilter:['hidden']});
    shell.addEventListener('cancel',e=>{e.preventDefault();page.hidden=true;sync();});
    disposers.push(()=>{observer.disconnect();if(shell.open&&shell.close)shell.close();shell.remove();});
    return page;
  }
  function cleanupMessages(){
    return globalThis.MvuViewerCleanup.normalizeMessages(H.messages('0-{{lastMessageId}}',{include_swipes:true}),context().chat);
  }
  function cleanupToken(messages){
    const last=messages.at(-1),ctx=context();if(!last||ctx.chatId===undefined||ctx.chatId===null||ctx.chatId==='')throw Error('当前没有可识别的聊天');
    return {chat_id:String(ctx.chatId),character_id:String(ctx.characterId??''),group_id:String(ctx.groupId??''),message_id:last.message_id,swipe_id:last.swipe_id??0,message_text:last.swipes?.[last.swipe_id??0]??''};
  }
  const cleanupAdapter={
    settings:()=>{const ctx=context();if(ctx.extensionSettings?.mvu_viewer_cleanup)return ctx.extensionSettings.mvu_viewer_cleanup;try{return JSON.parse(target.localStorage.getItem('mvu-viewer-cleanup-rules')||'{}');}catch(_){return {}; }},
    saveSettings:value=>{const ctx=context();if(ctx.extensionSettings&&typeof ctx.saveSettingsDebounced==='function'){ctx.extensionSettings.mvu_viewer_cleanup=value;ctx.saveSettingsDebounced();}else{target.localStorage.setItem('mvu-viewer-cleanup-rules',JSON.stringify(value));}},
    snapshot:async()=>{if(adapter.busy())throw Error('正在生成或更新，请稍后清理');return {format:'mvu-viewer-chat-cleanup-backup-v1',...(()=>{const messages=cleanupMessages();return {token:cleanupToken(messages),messages,...(Array.isArray(context().chat)?{raw_messages:C.clone(context().chat)}:{})};})()};},
    commit:async(base,changes,options={})=>{
      if(!generationState().known)throw Error('无法确认生成状态，未执行删除；请先打开酒馆聊天界面');
      const setter=typeof setChatMessages==='function'?setChatMessages:target.TavernHelper?.setChatMessages;if(typeof setter!=='function')throw Error('酒馆助手消息修改接口未就绪');
      const current=cleanupMessages();if(adapter.busy()||!C.equal(cleanupToken(current),base.token)||!C.equal(current,base.messages))throw Error('聊天或消息已变化，请重新点击一键删除');
      const patches=changes.map(change=>{const original=base.messages.find(m=>m.message_id===change.message_id);if(!original||(!options.allowLatest&&change.message_id>=base.token.message_id))throw Error('清理范围包含最新楼，已拒绝');const patch={message_id:change.message_id,swipe_id:original.swipe_id??0};for(const key of ['swipes','swipes_data','swipes_info'])if(Array.isArray(original[key]))patch[key]=C.clone(original[key]);for(const key of ['swipes','swipes_data','swipes_info'])if(Object.prototype.hasOwnProperty.call(change,key))patch[key]=C.clone(change[key]);if(Object.prototype.hasOwnProperty.call(change,'swipes')){patch.swipe_id=change.swipe_id??original.swipe_id;if(!Object.prototype.hasOwnProperty.call(change,'swipes_data'))patch.swipes_data=C.clone(original.swipes_data);if(!Object.prototype.hasOwnProperty.call(change,'swipes_info'))patch.swipes_info=C.clone(original.swipes_info);}return patch;});
      const expected=C.clone(base.messages);for(const patch of patches)Object.assign(expected.find(m=>m.message_id===patch.message_id),patch);
      updating=true;signal();try{await setter(patches,{refresh:'none'});
        const ctx=context();if(typeof ctx.saveChat==='function')await ctx.saveChat();
        const actualMessages=cleanupMessages();if(!C.equal(cleanupToken(actualMessages),cleanupToken(expected)))throw Error('写入期间聊天变化，部分内容可能已删除，请检查备份');
        for(const patch of patches){const actual=actualMessages.find(m=>m.message_id===patch.message_id);if(!actual||Object.keys(patch).some(key=>key!=='message_id'&&!C.equal(actual[key],patch[key])))throw Error('清理后核对失败，部分内容可能已删除，请检查备份');}
      }finally{updating=false;signal();}
    }
  };
  function openCleanup(){try{if(!cleanupApp){if(!globalThis.MvuViewerCleanup?.mount)throw Error('聊天瘦身模块未加载，请更新并刷新');const page=createPage('mvu-viewer-cleanup');try{cleanupApp=globalThis.MvuViewerCleanup.mount(page,cleanupAdapter);}catch(e){page.remove();throw e;}}cleanupApp.open();}catch(e){showError(e);}}
  const galleryAdapter={subscribe:adapter.subscribe,read:async()=>{const result=await adapter.read(-1);if(!C.equal(result.token,token(-1)))throw Error('聊天已变化，请刷新');const stat=result.table?.stat_data;if(!stat||typeof stat!=='object'||Array.isArray(stat))throw Error('最新楼层没有 MVU 数据');const ctx=context();const identity=ctx.groupId?'group:'+ctx.groupId:ctx.characters?.[ctx.characterId]?.avatar?'character:'+ctx.characters[ctx.characterId].avatar:'chat:'+result.token.chat_id;return {stat,scope:identity,title:'最新楼 #'+result.token.message_id+' · '+result.token.chat_id};}};
  function openGallery(){if(disposed)return;try{if(!galleryApp){if(!globalThis.MvuViewerGallery?.mount)throw Error('角色图鉴模块未加载，请更新并刷新');const page=createPage('mvu-viewer-gallery');try{galleryApp=globalThis.MvuViewerGallery.mount(page,C,galleryAdapter);}catch(e){page.remove();throw e;}}galleryApp.open();}catch(e){showError(e);}}
  async function openWorldbooks(){if(disposed)return;try{if(!worldbooksApp){if(!globalThis.MvuViewerWorldbooks?.mount)throw Error('世界书管理模块未加载，请更新并刷新');const {createWorldbookAdapter}=await import('./worldbooks-native.mjs?v=1.6.3');if(disposed)return;if(!worldbooksApp)worldbooksApp=globalThis.MvuViewerWorldbooks.mount(createPage('mvu-viewer-worldbooks'),createWorldbookAdapter());}await worldbooksApp.open();}catch(e){showError(e);}}
  function ensureDrawer(){
    if(disposed||drawer?.isConnected)return;
    const container=target.document.querySelector('#extensions_settings2, #extensions_settings');if(!container)return;
    drawer=target.document.createElement('div');drawer.id='mvu-viewer-extension';drawer.className='extension_container';
    const inline=target.document.createElement('div');inline.className='inline-drawer';
    const heading=target.document.createElement('div');heading.className='inline-drawer-toggle inline-drawer-header';
    const title=target.document.createElement('strong');title.textContent='MVU 数据查看器';
    const icon=target.document.createElement('div');icon.className='inline-drawer-icon fa-solid fa-circle-chevron-down down';heading.append(title,icon);
    const content=target.document.createElement('div');content.className='inline-drawer-content';
    const menuButton=(text,action)=>{const button=target.document.createElement('button');button.type='button';button.className='menu_button mvu-viewer-menu-button';button.textContent=text;button.style.width='100%';button.style.maxWidth='100%';button.style.minWidth='0';button.style.boxSizing='border-box';button.style.justifyContent='flex-start';button.style.textAlign='left';button.style.whiteSpace='normal';button.onclick=action;return button;};
    const launch=menuButton('读取 / 刷新当前 MVU 数据',open);launch.setAttribute('aria-label','读取或刷新当前 MVU 数据');
    const cleanup=menuButton('聊天瘦身 · 编辑删除规则',openCleanup);
    const gallery=menuButton('角色图鉴',openGallery);const worldbooks=menuButton('世界书管理 · 批量导出 / 删除',openWorldbooks);content.append(launch,cleanup,gallery,worldbooks,host);inline.append(heading,content);drawer.append(inline);container.append(drawer);
  }
  function showError(e){
    const launch=drawer?.querySelector('button');if(launch){launch.textContent='MVU 数据查看器 · 启动失败';launch.title=e.message||String(e);}
    if(app){host.hidden=false;const s=app.shadow.querySelector('.status');s.textContent=e.message||String(e);s.className='status error';return;}
    errorPanel?.remove();errorPanel=target.document.createElement('div');errorPanel.setAttribute('role','alert');
    Object.assign(errorPanel.style,{position:'fixed',inset:'20% 12px auto',zIndex:'2147483001',padding:'18px',border:'1px solid #cbb',borderRadius:'10px',background:'#fff',color:'#8b2424',whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:'14px'});
    const text=target.document.createElement('p');text.textContent='MVU 查看器启动失败：'+(e.message||String(e));const close=target.document.createElement('button');close.textContent='关闭';close.onclick=()=>{errorPanel?.remove();errorPanel=null;};errorPanel.append(text,close);target.document.body.append(errorPanel);
  }
  async function open(){if(disposed)return;try{
      ensureDrawer();if(!drawer)throw Error('扩展设置列表尚未就绪，请稍后重试');errorPanel?.remove();errorPanel=null;host.hidden=false;
    if(!app){if(!C||!globalThis.MvuViewerUI?.mount)throw Error('核心或界面模块未加载，请更新扩展后完整刷新');
      try{app=globalThis.MvuViewerUI.mount(host,C,adapter,{version:'1.6.3',inline:true,onCleanup:openCleanup,onGallery:openGallery});}catch(e){host.remove();host=target.document.createElement('div');host.id='tw-mvu-viewer-v1';host.hidden=true;drawer?.querySelector('.inline-drawer-content')?.append(host);throw e;}}
    await app.open();const launch=drawer?.querySelector('button');if(launch)launch.textContent='刷新当前 MVU 数据';
  }catch(e){showError(e);}}
  ensureDrawer();
  let eventsBound=false;
  function bindEvents(){if(eventsBound)return;
    if(native){const ctx=context();H.tv={...target.TavernHelper?.tavern_events,...target.tavern_events,...ctx.event_types,...ctx.eventTypes};if(!H.tv.GENERATION_STARTED||!H.tv.GENERATION_ENDED)throw Error('宿主缺少生成事件，暂时只能查看，不能保存');}
    const start=disposers.length;
    try{if(H.append&&H.button&&H.event){H.append([{name:'MVU 数据',visible:true}]);listen(H.button('MVU 数据'),open);}
      for(const k of ['CHAT_CHANGED','MESSAGE_SWIPED','MESSAGE_SENT','MESSAGE_RECEIVED','MESSAGE_DELETED','MESSAGE_UPDATED','MESSAGE_EDITED'])listen(H.tv[k],signal);
      listen(H.tv.GENERATION_STARTED,()=>{generating=true;signal();});listen(H.tv.GENERATION_ENDED,()=>{generating=false;signal();});listen(H.tv.GENERATION_STOPPED,()=>{generating=false;updating=false;signal();});eventsBound=true;
    }catch(e){for(const f of disposers.splice(start))f();throw e;}}
  try{bindEvents();}catch(_){}
  // 不复制事件字符串；使用实际安装导出的常量。
  const poll=setInterval(()=>{ensureDrawer();if(!eventsBound)try{bindEvents();signal();}catch(_){}try{const v=mvu();if(v===mvuBound)return;mvuBound=v;listen(v.events?.VARIABLE_UPDATE_STARTED,()=>{updating=true;signal();});listen(v.events?.VARIABLE_UPDATE_ENDED,()=>{updating=false;setTimeout(signal,120);});}catch(_){}},1000);
  const api={open,openCleanup,openGallery,openWorldbooks,dispose(){if(disposed)return;disposed=true;clearInterval(poll);for(const f of disposers)f();listeners.clear();app?.dispose();cleanupApp?.dispose();galleryApp?.dispose();worldbooksApp?.dispose();if(!app)host.remove();errorPanel?.remove();drawer?.remove();window.removeEventListener('pagehide',api.dispose);if(target[KEY]===api)delete target[KEY];}};
  target[KEY]=api;window.addEventListener('pagehide',api.dispose);
  };
  globalThis.MvuViewerHostStart();
})();
