// Optional native integration, loaded only when the worldbook page is opened.
// Authority: SillyTavern 1.13.4 public/scripts/world-info.js, blob
// 98f51b7315adbf292f3aa3bda16784455ce12e58. Runtime capability checks remain required.
import * as worlds from '../../../world-info.js';
import * as script from '../../../../script.js';
export function createWorldbookAdapter() {
  if (typeof worlds.updateWorldInfoList !== 'function' || typeof script.getRequestHeaders !== 'function') throw Error('当前酒馆缺少世界书管理接口');
  return {
    async list() { await worlds.updateWorldInfoList(); if (!Array.isArray(worlds.world_names)) throw Error('无法读取世界书列表'); return [...worlds.world_names]; },
    async read(name) {
      // Read native JSON fresh: preserves unknown fields and avoids stale editor cache.
      const response = await fetch('/api/worldinfo/get', {method:'POST', headers:script.getRequestHeaders(), body:JSON.stringify({name}), cache:'no-store'});
      if (!response.ok) throw Error('读取失败 HTTP '+response.status);
      const data = await response.json();
      if (!data || typeof data.entries !== 'object' || data.entries === null || Array.isArray(data.entries)) throw Error('世界书不是酒馆原生 JSON 格式');
      return data;
    },
    async remove(name) {
      const helper = globalThis.TavernHelper;
      const fn = typeof helper?.deleteWorldbook === 'function' ? helper.deleteWorldbook.bind(helper) : worlds.deleteWorldInfo;
      if (typeof fn !== 'function') throw Error('当前酒馆缺少世界书删除接口');
      if (await fn(name) !== true) throw Error('宿主未确认删除成功');
    },
  };
}
