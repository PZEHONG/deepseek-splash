/** Runs as a classic script before the shell mounts. Keep this function self-contained. */
export function mountSplash({ template, timeout = 15000 }) {
  if (window.__deepseekSplashMounted) return;
  window.__deepseekSplashMounted = true;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  let host, video, observer, timer;
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
    document.body.append(host);
    timer = setTimeout(close, timeout);
    observer = new MutationObserver(check);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    check();
    video.play()?.catch(close);
  } catch { close(); }
}
