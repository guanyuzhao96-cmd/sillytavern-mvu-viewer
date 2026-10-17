// Native host modules are loaded once by SillyTavern itself. No external service.
import * as script from '../../../../script.js';
import * as groups from '../../../../scripts/group-chats.js';
import { getContext } from '../../../st-context.js';
import { createNativeBridge } from './native-bridge.mjs?v=1.5.3';
import './core.js?v=1.5.3';
import './ui.js?v=1.5.3';
import './cleanup.js?v=1.5.3';
import './gallery-model.js?v=1.5.3';
import './gallery.js?v=1.5.3';

globalThis.MvuViewerNativeBridge=createNativeBridge(script,groups,getContext);
await import('./host.js?v=1.5.3');

export function disable(){window.__tw_mvu_viewer_v1__?.dispose?.();}
export function clean(){disable();}
export function enable(){if(!window.__tw_mvu_viewer_v1__)globalThis.MvuViewerHostStart?.();}
