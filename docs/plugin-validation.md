# Standard plugin validation — 2026-10-24

- `npm test` (v1.0.2): 12/12 passed. Verifies a ready UI remains covered until the four-second clip emits `ended`, then releases it. Also covers package declaration, media bytes/ranges/HEAD, Escape, skip, media failure, timeout, boot failure, reduced motion, autoplay rejection and duplicate injection. Caption suppression is scoped to the desktop preload's hidden palette probe and removed on every tested exit path; application palette and unrelated elements remain untouched.
- Package check: 8 required files, approximately 11 MB compressed. No app.asar, credentials or test dependencies in the plugin package.
- Real built upstream checkout `D:/deepseekharness` (package version 0.1.5-rc.2): Cordis activation, body index injection, Connection Fetch 206 media response, route disposal and event disposal passed.
- Integration command: set `DSH_SOURCE`, then run `node tests/integration.mjs`. In this environment some upstream zod files deny access; validation used a readable local `zod@4.4.3` copy via `node --loader ./tests/integration-loader.mjs tests/integration.mjs`. The loader is test-only and not included in the shipped plugin.
- Independent read-only review found no Critical or Important issues and reran all 11 tests successfully.

Windows caption fix verification:

- Reproduced native buttons over the plugin animation using the installed client's actual isolated preload and Electron 44.0.0. Before the fix the native overlay remained opaque; afterward its background and symbols are transparent during playback, then restore the current theme after the full clip ends. Window bounds remain unchanged.
- Updated only the installed plugin's `plugin/browser.mjs` in `D:/deepseekharness/.dsh/profiles/desktop/node_modules/dsh-deepseek-splash`, replacing the directory entry atomically so the pnpm store's hard link stays untouched. The previous file is backed up under this project's D-drive `backup/` folder.
- Actual desktop startup passed: 3840×2160 decoding, transparent caption palette during animation, normal caption palette after animation, unchanged 1280×822 viewport. Native screen captures were visually checked; local screenshots and diagnostic output are not included in the published package.
- Video, poster and HTML artwork hashes remain unchanged. The installed Electron `app.asar` remains the original `983ca71114e6dfd353fc79af5a1f9481a250ee64c2a3c757673029b811b23bc2`; no desktop binary patch was installed.

Installing this change from the public GitHub address has not been retested. Existing local v1.0.1 archives predate this caption fix; the v1.0.2 source and this machine's installed browser module contain it.
