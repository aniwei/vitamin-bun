## 1. zlib core module
- [x] 1.1 Add `zlib` exports and `node:zlib` alias
- [x] 1.2 Provide clear unsupported errors for sync methods

## 2. worker_threads core module
- [x] 2.1 Add `worker_threads` exports and `node:worker_threads` alias
- [x] 2.2 Provide stub `Worker` and base fields (`isMainThread`, `threadId`, `parentPort`)

## 3. stream/web core module
- [x] 3.1 Add `stream/web` exports and `node:stream/web` alias
- [x] 3.2 Re-export Web Streams globals when available

## 4. Tests
- [x] 4.1 zlib stub tests
- [x] 4.2 worker_threads stub tests
- [x] 4.3 stream/web export tests
