import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(process.env.DSH_TEST_REQUIRE_FROM || new URL('../package.json', import.meta.url));


test('bundle is installable without a build step', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(pkg.scripts?.postinstall, undefined);
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.ok(patch.includes(pkg.name));
  assert.ok(pkg.files.includes('package/harness-splash.webm'));
});

test('media responds with original bytes, HEAD, byte ranges and safe missing errors', async () => {
  const { serveAsset } = await import('../plugin/index.mjs');
  const request = (method = 'GET', range) => new Request('http://localhost/api/deepseek-splash/harness-splash.webm', { method, headers: range ? { range } : {} });
  const full = await serveAsset(request(), 'harness-splash.webm');
  const bytes = Buffer.from(await full.arrayBuffer());
  assert.deepEqual(bytes, await readFile(new URL('../package/harness-splash.webm', import.meta.url)));
  const partial = await serveAsset(request('GET', 'bytes=0-127'), 'harness-splash.webm');
  assert.equal(partial.status, 206);
  assert.deepEqual(Buffer.from(await partial.arrayBuffer()), bytes.subarray(0, 128));
  const suffix = await serveAsset(request('GET', 'bytes=-10'), 'harness-splash.webm');
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), bytes.subarray(-10));
  const head = await serveAsset(request('HEAD'), 'harness-splash.webm');
  assert.equal(head.headers.get('content-length'), String(bytes.length));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal((await serveAsset(request('GET', 'bytes=999999999-'), 'harness-splash.webm')).status, 416);
  assert.equal((await serveAsset(request(), '../.env')).status, 404);
  assert.equal((await serveAsset(request('POST'), 'harness-splash.webm')).status, 405);
});

async function setup({ reduced = false, playReject = false } = {}) {
  const { JSDOM } = require('jsdom');
  const { createInjection } = await import('../plugin/index.mjs');
  const dom = new JSDOM('<!doctype html><body><main id="root"><div data-dsh-boot><i data-dsh-boot-spinner></i></div></main></body>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  win.matchMedia = () => ({ matches: reduced });
  win.HTMLMediaElement.prototype.play = () => playReject ? Promise.reject(new Error('blocked')) : Promise.resolve();
  win.HTMLMediaElement.prototype.pause = () => {};
  win.HTMLMediaElement.prototype.load = () => {};
  const timers = [];
  win.setTimeout = fn => { timers.push(fn); return timers.length; };
  win.clearTimeout = () => {};
  const row = createInjection();
  assert.equal(row.kind, 'script');
  assert.equal(row.placement, 'body');
  assert.ok(!row.text.includes('</script'));
  win.eval(row.text);
  const overlay = () => win.document.getElementById('deepseek-splash');
  return { dom, win, overlay, timers, row };
}

test('ready application stays behind the intro until the full video ends', async () => {
  const { dom, win, overlay } = await setup();
  assert.ok(overlay());
  win.document.getElementById('root').innerHTML = '<button>New chat</button>';
  await new Promise(resolve => setTimeout(resolve, 75));
  assert.ok(overlay(), 'UI readiness must not interrupt the four-second video');
  const video = overlay().shadowRoot.querySelector('video');
  video.dispatchEvent(new win.Event('ended'));
  assert.equal(overlay(), null);
  assert.equal(win.document.querySelector('#root button').textContent, 'New chat');
  dom.window.close();
});

for (const reason of ['escape', 'button', 'media-error', 'timeout', 'boot-failure', 'ended']) {
  test(`overlay releases the UI on ${reason}`, async () => {
    const { dom, win, overlay, timers } = await setup();
    const shadow = overlay().shadowRoot;
    if (reason === 'escape') win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
    if (reason === 'button') shadow.querySelector('button').click();
    if (reason === 'media-error') shadow.querySelector('video').dispatchEvent(new win.Event('error'));
    if (reason === 'ended') shadow.querySelector('video').dispatchEvent(new win.Event('ended'));
    if (reason === 'timeout') timers.forEach(fn => fn());
    if (reason === 'boot-failure') { win.document.querySelector('[data-dsh-boot-spinner]').remove(); await Promise.resolve(); }
    assert.equal(overlay(), null);
    assert.equal(win.document.querySelector('[data-deepseek-splash-caption]'), null, 'Native caption styling must be released with the animation');
    dom.window.close();
  });
}

test('reduced motion and autoplay rejection fail open', async () => {
  for (const options of [{ reduced: true }, { playReject: true }]) {
    const { dom, overlay } = await setup(options);
    await Promise.resolve();
    assert.equal(overlay(), null);
    assert.equal(dom.window.document.querySelector('[data-deepseek-splash-caption]'), null);
    dom.window.close();
  }
});

test('caption styling targets only the desktop theme probe while the splash exists', async () => {
  const { dom, win, overlay } = await setup();
  const root = win.document.documentElement;
  root.dataset.windowsTitlebar = '';
  const probe = win.document.createElement('span');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;background-color:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-primary)';
  const unrelated = win.document.createElement('span');
  unrelated.style.color = 'red';
  win.document.body.append(probe, unrelated);
  const style = win.document.querySelector('[data-deepseek-splash-caption]');
  assert.ok(style, 'Caption suppression must exist while the animation plays');
  const selector = style.sheet.cssRules[0].selectorText;
  assert.equal(probe.matches(selector), true);
  assert.equal(unrelated.matches(selector), false);
  assert.equal(win.document.body.style.length, 0, 'Application palette and user styles must remain untouched');
  overlay().shadowRoot.querySelector('button').click();
  assert.equal(probe.matches(selector), false);
  assert.equal(style.isConnected, false);
  assert.equal(unrelated.style.color, 'red');
  dom.window.close();
});

test('repeated injection neither duplicates nor replays a dismissed intro', async () => {
  const { dom, win, overlay, row } = await setup();
  win.eval(row.text);
  assert.equal(win.document.querySelectorAll('#deepseek-splash').length, 1);
  overlay().shadowRoot.querySelector('button').click();
  win.eval(row.text);
  assert.equal(overlay(), null);
  dom.window.close();
});

