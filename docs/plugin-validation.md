# Standard plugin validation — 2026-10-24

- `npm test` (v1.0.1): 11/11 passed. Verifies a ready UI remains covered until the four-second clip emits `ended`, then releases it. Also covers package declaration, media bytes/ranges/HEAD, Escape, skip, media failure, timeout, boot failure, reduced motion, autoplay rejection and duplicate injection.
- Package check: 8 required files, approximately 11 MB compressed. No app.asar, credentials or test dependencies in the plugin package.
- Real built upstream checkout `D:/deepseekharness` (package version 0.1.5-rc.2): Cordis activation, body index injection, Connection Fetch 206 media response, route disposal and event disposal passed.
- Integration command: set `DSH_SOURCE`, then run `node tests/integration.mjs`. In this environment some upstream zod files deny access; validation used a readable local `zod@4.4.3` copy via `node --loader ./tests/integration-loader.mjs tests/integration.mjs`. The loader is test-only and not included in the shipped plugin.
- Independent read-only review found no Critical or Important issues and reran all 11 tests successfully.

Remaining: installation through the desktop plugin UI, complete desktop quit/restart, actual Chromium video decoding and visual presentation. No user profile or installed Electron archive was modified.
