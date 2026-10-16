import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen } from 'electron';

/** Keep startup behind the intro; a painted application ends it immediately. */
export function createHarnessSplash({ BrowserWindow, assetDirectory = fileURLToPath(new URL('../renderer', import.meta.url)), onEvent = () => {} }) {
  let window;
  let closing = false;
  let interval;
  let deadline;
  let resolveClosed;
  const held = new Map();
  const startedAt = Date.now();
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  const report = (name, extra = {}) => { try { onEvent({ name, elapsedMs: Date.now() - startedAt, ...extra }); } catch {} };
  const close = (reason = 'ready') => {
    if (closing) return;
    closing = true;
    clearInterval(interval);
    clearTimeout(deadline);
    // Reveal the completed UI beneath the intro, then stop the video in this turn.
    for (const [target, state] of held) {
      target.show = state.show;
      target.showInactive = state.showInactive;
      if (target.isDestroyed()) continue;
      if (state.requested === 'active') state.show();
      else if (state.requested === 'inactive') state.showInactive();
      target.webContents.setBackgroundThrottling(true);
      if (state.requested) report('application-shown', { ready: state.ready, fullscreen: target.isFullScreen(), maximized: target.isMaximized(), bounds: target.getBounds(), initialBounds: state.initialBounds, reason });
    }
    held.clear();
    if (window && !window.isDestroyed()) { window.hide(); window.destroy(); }
    report('intro-closed', { reason });
    resolveClosed();
  };
  const workspaceReady = target => {
    const state = held.get(target);
    if (!state || closing) return;
    state.ready = true;
    report('ui-ready');
    if (state.requested) close();
  };
  const hold = (target, { documentReady = false } = {}) => {
    if (closing || held.has(target)) return;
    const state = { show: target.show.bind(target), showInactive: target.showInactive.bind(target), requested: null, ready: false, initialBounds: target.getBounds() };
    held.set(target, state);
    target.setFullScreen(false);
    target.webContents.setBackgroundThrottling(false);
    target.show = () => { state.requested = 'active'; if (state.ready) close(); };
    target.showInactive = () => { state.requested = 'inactive'; if (state.ready) close(); };
    target.once('closed', () => held.delete(target));
    if (documentReady) target.webContents.once('did-finish-load', () => workspaceReady(target));
    report('application-held');
  };
  try {
    const display = screen.getPrimaryDisplay();
    const width = Math.min(960, display.workArea.width);
    const height = Math.min(540, display.workArea.height);
    const introBounds = { x: display.workArea.x + Math.floor((display.workArea.width - width) / 2), y: display.workArea.y + Math.floor((display.workArea.height - height) / 2), width, height };
    window = new BrowserWindow({
      ...introBounds, frame: false,
      fullscreen: false, fullscreenable: false,
      show: false, resizable: false, maximizable: false, minimizable: false,
      skipTaskbar: true, alwaysOnTop: true, backgroundColor: '#05060e',
      title: 'DeepSeek Harness', autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, devTools: false }
    });
    window.setBounds(introBounds, false);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('before-input-event', (_event, input) => { if (input.key === 'Escape') close('skip'); });
    window.webContents.on('render-process-gone', () => close('renderer-failed'));
    window.on('closed', () => { if (!closing) close('window-closed'); });
    window.once('ready-to-show', () => {
      if (!closing && !window.isDestroyed()) {
        window.setBounds(introBounds, false);
        window.show();
        report('intro-shown', { fullscreen: window.isFullScreen(), maximized: window.isMaximized(), bounds: window.getBounds(), expectedBounds: introBounds, contentBounds: window.getContentBounds(), displayBounds: display.bounds, scaleFactor: display.scaleFactor });
      }
    });
    window.loadFile(join(assetDirectory, 'harness-splash.html')).then(() => {
      if (closing || window.isDestroyed()) return;
      interval = setInterval(async () => {
        if (closing || window.isDestroyed()) return;
        try {
          if (await window.webContents.executeJavaScript('window.__harnessSplashSkipRequested === true')) close('skip');
        } catch { close('renderer-failed'); }
      }, 100);
    }).catch(() => close('missing-assets'));
    deadline = setTimeout(() => close('startup-timeout'), 60000);
  } catch { close('window-failed'); }
  return { hold, workspaceReady, finish() { close(); return closed; }, close, closed };
}
