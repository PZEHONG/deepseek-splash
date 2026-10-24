// Optional test against a built upstream checkout; does not touch its profile.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { apply, inject } from '../plugin/index.mjs';
const source = process.env.DSH_SOURCE;
assert.ok(source, 'Set DSH_SOURCE to a built deepseek-harness checkout');
const require = createRequire(resolve(source, 'packages/client/connection/package.json'));
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')));
const { HostConnectionService } = await import(pathToFileURL(resolve(source, 'packages/client/connection/lib/index.js')));
const ctx = new Context();
try {
  const transport = ctx.plugin(owner => { new HostConnectionService(owner, [], { isAuthenticated: () => true }); });
  await transport.await();
  const plugin = ctx.plugin({ name: 'splash-integration', inject, apply });
  await plugin.await();
  const rows = [];
  ctx.emit('webserver/index-inject', rows);
  assert.equal(rows.length, 1);
  const api = ctx.connection.createSharedFetchHandler('/api');
  const response = await api.fetch(new Request('http://localhost/api/deepseek-splash/harness-splash.webm', { headers: { range: 'bytes=0-31' } }));
  assert.equal(response.status, 206);
  assert.equal((await response.arrayBuffer()).byteLength, 32);
  await plugin.dispose();
  assert.equal((await api.fetch(new Request('http://localhost/api/deepseek-splash/harness-splash.webm'))).status, 404);
  const disposedRows = [];
  ctx.emit('webserver/index-inject', disposedRows);
  assert.equal(disposedRows.length, 0);
  console.log('PASS: real Cordis activation, injection, Connection media range and disposal');
} finally { await ctx.fiber.dispose(); }
