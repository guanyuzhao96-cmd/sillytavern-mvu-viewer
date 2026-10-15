// Native SillyTavern browser extension entry; no remote scripts are fetched.
import './core.js?v=1.4.2';
import './ui.js?v=1.4.2';
import './cleanup.js?v=1.4.2';
import './gallery-model.js?v=1.4.2';
import './gallery.js?v=1.4.2';
import './host.js?v=1.4.2';

export function disable() {
  window.__tw_mvu_viewer_v1__?.dispose?.();
}
export function clean() {
  disable();
}
export function enable() {
  if (!window.__tw_mvu_viewer_v1__) globalThis.MvuViewerHostStart?.();
}
