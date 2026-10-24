import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { mountSplash } from './browser.mjs';

export const name = 'deepseek-splash';
export const inject = ['connection'];
const assetRoot = new URL('../package/', import.meta.url);
const assets = new Map([['harness-splash.webm', 'video/webm'], ['harness-poster.jpg', 'image/jpeg']]);
const prefix = '/api/deepseek-splash/';
const html = readFileSync(new URL('harness-splash.html', assetRoot), 'utf8');
// Scope the original artwork to a shadow root; do not run the native-window script.
const css = html.match(/<style>([\s\S]*?)<\/style>/i)[1]
  .replace(/html,body/g, ':host').replace(/\bbody\b/g, ':host')
  + '\n.skip{animation:none}';
const body = html.match(/<body>([\s\S]*?)<script>/i)[1]
  .replaceAll('harness-poster.jpg', prefix + 'harness-poster.jpg')
  .replaceAll('harness-splash.webm', prefix + 'harness-splash.webm');
const template = `<style>${css}</style>${body}`;

export function createInjection() {
  // Escape '<' so the serialized template can never terminate an HTML script tag.
  const options = JSON.stringify({ template }).replaceAll('<', '\\u003c');
  return { kind: 'script', placement: 'body', text: `(${mountSplash.toString()})(${options});` };
}

/** Only two fixed assets are readable. Range support is needed by Chromium media. */
export async function serveAsset(request, filename) {
  const type = assets.get(filename);
  if (!type) return new Response(null, { status: 404 });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  let bytes;
  try { bytes = await readFile(new URL(filename, assetRoot)); }
  catch { return new Response(null, { status: 404 }); }
  const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-cache', 'content-length': String(bytes.length) };
  if (request.method === 'HEAD') return new Response(null, { headers });
  const range = request.headers.get('range');
  if (!range) return new Response(bytes, { headers });
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  let start = 0, end = bytes.length - 1;
  if (match) {
    start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2]));
    end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
  }
  if (!match || (!match[1] && !match[2]) || (!match[1] && Number(match[2]) === 0) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes.length) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${bytes.length}` } });
  }
  return new Response(bytes.subarray(start, end + 1), { status: 206, headers: { ...headers, 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${bytes.length}` } });
}

export function apply(ctx) {
  for (const filename of assets.keys()) {
    ctx.connection.fetch.register({ path: prefix + filename, methods: ['GET', 'HEAD'], requestBody: 'buffered', fetch: request => serveAsset(request, filename) });
  }
  ctx.on('webserver/index-inject', rows => rows.push(createInjection()));
}
