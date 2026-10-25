// Optional native integration, loaded only when the worldbook page is opened.
// Authority: SillyTavern 1.13.4 public/scripts/world-info.js, blob
// 98f51b7315adbf292f3aa3bda16784455ce12e58. Runtime capability checks remain required.
import * as worlds from '../../../world-info.js';
import * as script from '../../../../script.js';
import {planImports,equalJson} from './worldbooks-import.mjs?v=1.6.3';
import {deleteBatch} from './worldbooks-batch.mjs?v=1.6.3';
export function createWorldbookAdapter() {
  if (typeof worlds.updateWorldInfoList !== 'function' || typeof script.getRequestHeaders !== 'function') throw Error('当前酒馆缺少世界书管理接口');
  const adapter = {
    async list() { await worlds.updateWorldInfoList(); if (!Array.isArray(worlds.world_names)) throw Error('无法读取世界书列表'); return [...worlds.world_names]; },
    async read(name) {
      // Read native JSON fresh: preserves unknown fields and avoids stale editor cache.
      const response = await fetch('/api/worldinfo/get', {method:'POST', headers:script.getRequestHeaders(), body:JSON.stringify({name}), cache:'no-store'});
      if (!response.ok) throw Error('读取失败 HTTP '+response.status);
      const data = await response.json();
      if (!data || typeof data.entries !== 'object' || data.entries === null || Array.isArray(data.entries)) throw Error('世界书不是酒馆原生 JSON 格式');
      return data;
    },
    async importMany(books,policy,onProgress) {
      const {plans,skipped}=planImports(books,await adapter.list(),policy);
      if(plans.some(p=>p.overwrite)&&typeof worlds.worldInfoCache?.delete!=='function')throw Error('当前宿主缺少覆盖后的缓存同步接口，请选择跳过或另存副本');
      const results=await deleteBatch(plans.map((_,i)=>String(i)),async index=>{
        const book=plans[Number(index)],form=new FormData();
        form.append('avatar',new File([JSON.stringify(book.data)],book.name+'.json',{type:'application/json'}));
        const headers=new Headers(script.getRequestHeaders());headers.delete('content-type');
        const response=await fetch('/api/worldinfo/import',{method:'POST',headers,body:form,cache:'no-store'});
        if(!response.ok)throw Error('导入失败 HTTP '+response.status);
        const result=await response.json();if(result.name!==book.name)throw Error('服务器返回的世界书名称与预期不一致');
        // Fresh server JSON, not just an acknowledgement or a cached name.
        if(!equalJson(await adapter.read(book.name),book.data))throw Error('导入后内容核对不一致');
      },{concurrency:3,stopOnError:false,onProgress});
      let remaining,syncError='';
      try{remaining=await adapter.list();}catch(e){syncError='刷新列表失败：'+e.message;}
      for(const book of plans)worlds.worldInfoCache?.delete?.(book.name);
      if(typeof globalThis.jQuery==='function')globalThis.jQuery('#world_editor_select').trigger('change');
      return {results:results.map(r=>({...r,name:plans[Number(r.name)].name})),skipped,remaining,syncError};
    },
    async removeMany(names,onProgress) {
      const jq=globalThis.jQuery;
      // Match native deleteWorldInfo side effects. Missing pieces use the native
      // serial path; never run its shared DOM/state updates concurrently.
      const fast=typeof jq==='function' && typeof worlds.worldInfoCache?.delete==='function'
        && Array.isArray(worlds.selected_world_info) && typeof worlds.setWorldInfoButtonClass==='function'
        && typeof script.saveSettingsDebounced==='function' && typeof script.saveCharacterDebounced==='function';
      const attempted=[];let results,remaining,syncError='';
      try {
        results=await deleteBatch(names,async name=>{
          attempted.push(name);
          if(!fast)return adapter.remove(name);
          const response=await fetch('/api/worldinfo/delete',{method:'POST',headers:script.getRequestHeaders(),body:JSON.stringify({name})});
          if(!response.ok)throw Error('删除失败 HTTP '+response.status);
        },{concurrency:fast?3:1,onProgress});
      } finally {
        // Includes uncertain transport failures: final server list is authoritative.
        try { remaining=await adapter.list(); }
        catch(error){syncError='刷新核对失败：'+(error.message||error);}
        if(fast){
          try {
            const removed=attempted.filter(name=>remaining?!remaining.includes(name):results?.some(r=>r.name===name&&r.ok));
            for(const name of attempted)worlds.worldInfoCache.delete(name);
            let settingsChanged=false;
            for(const name of removed){
              const i=worlds.selected_world_info.indexOf(name);
              if(i!==-1){worlds.selected_world_info.splice(i,1);settingsChanged=true;}
            }
            if(settingsChanged)script.saveSettingsDebounced();
            // Same native editor/character handlers, dispatched once per batch.
            jq('#world_editor_select').trigger('change');
            if(removed.includes(jq('#character_world').val())){
              jq('#character_world').val('').trigger('change');
              worlds.setWorldInfoButtonClass(undefined,false);
              if(script.menu_type!=='create')script.saveCharacterDebounced();
            }
          }catch(error){syncError+=(syncError?'；':'')+'宿主状态同步失败：'+(error.message||error);}
        }
      }
      return {results,remaining,syncError,mode:fast?'batch':'compatible'};
    },
    async remove(name) {
      const helper = globalThis.TavernHelper;
      const fn = typeof helper?.deleteWorldbook === 'function' ? helper.deleteWorldbook.bind(helper) : worlds.deleteWorldInfo;
      if (typeof fn !== 'function') throw Error('当前酒馆缺少世界书删除接口');
      if (await fn(name) !== true) throw Error('宿主未确认删除成功');
    },
  };
  return adapter;
}
