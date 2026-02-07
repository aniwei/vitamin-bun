# Change: Add BunTS zlib, worker_threads, and stream/web core modules

## Why
Some dependencies import `zlib`, `worker_threads`, or `stream/web`. Missing modules cause runtime load failures in the browser runtime.

## What Changes
- Add minimal `zlib` core module exports with clear unsupported errors
- Add minimal `worker_threads` core module exports with a stub `Worker`
- Add `stream/web` core module that re-exports Web Streams globals
- Support `node:` aliases for these modules

## Impact
- Affected specs: `bunts-runtime-zlib`, `bunts-runtime-worker-threads`, `bunts-runtime-stream-web`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
