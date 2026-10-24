/** Runs as a classic script before the shell mounts. Keep this function self-contained. */
export function mountSplash({ template, timeout = 15000 }) {
  if (window.__deepseekSplashMounted) return;
  window.__deepseekSplashMounted = true;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  let host, video, observer, timer, captionStyle;
  let closed = false;
  const onKey = event => { if (event.key === 'Escape') close(); };
  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    observer?.disconnect();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pagehide', close);
    if (video) { video.pause(); video.removeAttribute('src'); video.querySelector('source')?.removeAttribute('src'); video.load(); }
    host?.remove();
    captionStyle?.remove();
  }
  function check() {
    const root = document.getElementById('root');
    const boot = root?.querySelector('[data-dsh-boot]');
    if (boot && !boot.querySelector('[data-dsh-boot-spinner]')) return close();
    // Let the workspace finish loading underneath, but keep the intro until
    // the actual media ends (or the user explicitly skips it).
  }
  try {
    host = document.createElement('div');
    host.id = 'deepseek-splash';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#05060e;isolation:isolate';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = template;
    video = shadow.querySelector('video');
    video.muted = true;
    shadow.querySelector('button').addEventListener('click', close);
    video.addEventListener('error', close, { once: true });
    video.querySelector('source')?.addEventListener('error', close, { once: true });
    video.addEventListener('ended', close, { once: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', close, { once: true });
    // The desktop preload samples this hidden theme probe to color its native
    // caption overlay. Make only that probe transparent while the intro exists;
    // its head observer restores the current theme when this style is removed.
    captionStyle = document.createElement('style');
    captionStyle.dataset.deepseekSplashCaption = '';
    captionStyle.textContent = '[data-windows-titlebar] body:has(> #deepseek-splash) > span[style*="--dsw-specific-sidebar-fill"][style*="--dsw-alias-label-primary"]{background-color:transparent!important;color:transparent!important}';
    document.head.append(captionStyle);
    document.body.append(host);
    timer = setTimeout(close, timeout);
    observer = new MutationObserver(check);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    check();
    video.play()?.catch(close);
  } catch { close(); }
}
