# Change: Add Bun.spawn and Bun.spawnSync APIs

## Why
Some packages rely on Bun's process spawning APIs. The browser runtime currently lacks these entry points.

## What Changes
- Implement `Bun.spawn` and `Bun.spawnSync` in the runtime global using the existing RuntimeCore exec surface.
- Document limitations (no true OS processes, limited stdio, no signals).
- Add tests for basic spawn behavior and error handling.

## Impact
- Affected specs: bunts-runtime-bun
- Affected code: packages/bunts-runtime/src/bun-runtime.ts, packages/bunts-runtime/src/runtime-core.ts, docs/BUN_API_CATALOG.md
