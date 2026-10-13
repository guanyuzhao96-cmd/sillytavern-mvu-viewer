// Native SillyTavern browser extension entry; no remote scripts are fetched.
import './core.js';
import './ui.js';
import './host.js';

export function disable() {
  window.__tw_mvu_viewer_v1__?.dispose?.();
}
export function clean() {
  disable();
}
export function enable() {
  if (!window.__tw_mvu_viewer_v1__) globalThis.MvuViewerHostStart?.();
}
