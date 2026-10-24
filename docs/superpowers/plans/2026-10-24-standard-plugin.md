# Standard Splash Plugin Implementation Plan

> Execute inline with superpowers:executing-plans; verify behavior before completion.

**Goal:** Repository-address installation of the existing animation as a standard DSH bundle.

**Architecture:** Host index injection mounts an isolated overlay before frontend boot. Connection Fetch routes deliver allowlisted media with byte ranges on desktop and Web.

**Tech Stack:** Node ESM, browser DOM, Node test runner, jsdom for browser lifecycle tests.

**Spec:** ../specs/2026-10-24-standard-plugin-design.md

## Global Constraints

- No Electron or user-data modifications; preserve the existing 4K media.
- No runtime dependencies or install scripts; package includes all required assets.
- Fail open; 15-second maximum overlay lifetime; play the complete four-second video unless skipped or playback/boot fails.

## Review Focus

- Desktop has no webServer service: use Connection Fetch routes.
- Native media requests use byte ranges: return 206/416 correctly.
- Failed boot must remain visible under the overlay.
- Duplicate injection must not replay; dispose observers, media and listeners.
- GitHub users need pre-existing files, without a build step.

## Task 1: Bundle, media and browser lifecycle

Files: package.json, cordis.patch.yml, plugin/index.mjs, plugin/browser.mjs, tests/plugin.test.mjs.

Interfaces: `apply(ctx)` registers Connection routes and index injection; `mountSplash(options)` is serialized into a classic browser script.

- [x] Write tests for package wiring, asset range/HEAD/missing responses and browser readiness, errors, skipping, timeout, reduced motion, duplicate mounts.
- [x] Run tests and observe failure before implementing.
- [x] Implement host registration and isolated browser overlay.
- [x] Run `npm test` and verify pack contents with `npm pack --dry-run`.

## Task 2: Documentation and integration verification

Files: README.md, tests/integration.mjs.

- [x] Document address install, restart, disable, native patch migration and startup boundary.
- [x] Activate against real local Cordis/Connection and test actual injected HTML and assets.
- [x] Record validation and any unverified desktop behavior.
