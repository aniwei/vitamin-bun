# Vitamin-Bun: Technical Design — Compiling Bun to WebAssembly

## 1. Overview

Vitamin-Bun is a project to run the [Bun](https://bun.sh) JavaScript runtime inside
web browsers by compiling it to WebAssembly (WASM). Inspired by
[WebContainers](https://webcontainers.io/), the host environment (browser) provides
the JavaScript execution context, virtual filesystem, and network stack so that Bun's
core tooling — bundler, package manager, test runner, and transpiler — can operate
entirely in-browser without a remote server.

### Goals

| Goal | Description |
|------|-------------|
| **Browser-native Bun** | Run `bun install`, `bun build`, `bun test` in a browser tab. |
| **Host-provided JS context** | Delegate JS evaluation to the browser's own V8/JSC engine rather than shipping a full JS engine inside WASM. |
| **Virtual filesystem** | An in-memory filesystem presented to the WASM binary through WASI-compatible `fd_*` imports. |
| **Network proxy** | HTTP / WebSocket requests from WASM are forwarded through browser `fetch()` / `WebSocket`. |
| **Minimal binary size** | Strip the embedded JavaScriptCore engine and other unnecessary native code to keep the `.wasm` artifact small (target < 20 MB gzipped). |

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Browser Tab                          │
│                                                          │
│  ┌─────────────┐   ┌──────────────────────────────────┐  │
│  │  Main Thread │   │         Web Worker               │  │
│  │             │   │  ┌────────────────────────────┐  │  │
│  │  SDK /      │◄──┼─►│   Bun WASM Module          │  │  │
│  │  UI Layer   │   │  │                            │  │  │
│  │             │   │  │  ┌──────┐ ┌─────┐ ┌─────┐ │  │  │
│  └──────┬──────┘   │  │  │Bundler│ │ PM  │ │Test │ │  │  │
│         │          │  │  └──┬───┘ └──┬──┘ └──┬──┘ │  │  │
│         │          │  │     │        │       │    │  │  │
│         │          │  │  ┌──▼────────▼───────▼──┐ │  │  │
│         │          │  │  │   WASI Interface      │ │  │  │
│         │          │  │  └──────────┬────────────┘ │  │  │
│         │          │  └─────────────┼──────────────┘  │  │
│         │          │                │                  │  │
│         │          │  ┌─────────────▼──────────────┐  │  │
│         │          │  │    Host Bindings Layer      │  │  │
│         │          │  │  ┌──────┐┌─────┐┌────────┐ │  │  │
│         │          │  │  │ VFS  ││ Net ││ JS Ctx │ │  │  │
│         │          │  │  └──────┘└─────┘└────────┘ │  │  │
│         │          │  └────────────────────────────┘  │  │
│  ┌──────▼──────┐   └──────────────────────────────────┘  │
│  │Service Worker│                                        │
│  │(net proxy)   │                                        │
│  └──────────────┘                                        │
└──────────────────────────────────────────────────────────┘
```

### 2.1 Layer Summary

| Layer | Package | Responsibility |
|-------|---------|----------------|
| **WASM Module** | `@aspect-build/bun-wasm` | Bun compiled to `wasm32-wasi` with JS engine removed. Source lives in `vendor/bun` submodule. |
| **Host Bindings** | `@aspect-build/wasm-host` | Implements WASI imports (`fd_read`, `fd_write`, `sock_*`, …) by delegating to browser APIs. |
| **Virtual FS** | `@aspect-build/virtual-fs` | In-memory filesystem with layered backends (memory, IndexedDB, OPFS). |
| **Network Proxy** | `@aspect-build/network-proxy` | Translates WASI socket calls to browser `fetch()` and `WebSocket`. |
| **Browser Runtime** | `@aspect-build/browser-runtime` | Web Worker lifecycle, SharedArrayBuffer coordination, Service Worker registration. |
| **SDK** | `@aspect-build/sdk` | Public API for embedders — `createBunContainer()`, terminal I/O, file mount. |

---

## 3. Compiling Bun to WASM

### 3.1 Source Modifications

Bun is written in **Zig** (with C/C++ dependencies including JavaScriptCore). To
compile to `wasm32-wasi`:

1. **Remove JavaScriptCore** — the host browser already has a JS engine. Replace
   JSC FFI call-sites with *host import stubs* that cross the WASM boundary.
2. **Retarget Zig build** — use `zig build -Dtarget=wasm32-wasi` after patching
   platform-specific code (epoll, kqueue, io_uring → WASI poll).
3. **Stub libc / POSIX** — Replace `pthreads`, `mmap`, signals with WASI
   equivalents or no-ops where browser semantics diverge.
4. **Strip native TLS** — TLS termination happens in the browser; the WASM
   binary only sees plain-text streams.

### 3.2 Build Pipeline

```
bun source (Zig + C)
       │
       ▼
  zig build -Dtarget=wasm32-wasi
       │
       ▼
  bun-core.wasm          (raw, ~40-80 MB)
       │
       ▼
  wasm-opt -Oz --strip   (Binaryen optimisation)
       │
       ▼
  bun-core.opt.wasm      (target < 20 MB gzip)
```

### 3.3 JS Context Bridge

Instead of embedding a JS engine, Bun delegates JS evaluation to the host:

```
WASM (Bun)                         Host (Browser)
───────────                        ──────────────
js_context_eval(code, len) ──────► eval / new Function
js_context_call(fn, args)  ──────► Reflect.apply
js_context_get_property()  ──────► Reflect.get
js_context_set_property()  ──────► Reflect.set
js_context_create_object() ──────► Object.create
js_context_typeof()        ──────► typeof
```

A **handle table** on the host side maps integer handles ↔ JS objects so the WASM
side can reference host objects without direct pointer access.

---

## 4. Virtual Filesystem

### 4.1 Design

The VFS implements a POSIX-like filesystem API consumed by WASI `fd_*` imports.

```
┌────────────────────────────────────────┐
│            VFS Interface               │
│  open / read / write / stat / readdir  │
├────────────────────────────────────────┤
│          Mount Layer                   │
│  /project  → MemoryBackend            │
│  /tmp      → MemoryBackend            │
│  /cache    → IndexedDBBackend         │
│  /persist  → OPFSBackend              │
├────────────────────────────────────────┤
│         Storage Backends               │
│  ┌──────────┐ ┌───────────┐ ┌──────┐  │
│  │  Memory   │ │ IndexedDB │ │ OPFS │  │
│  └──────────┘ └───────────┘ └──────┘  │
└────────────────────────────────────────┘
```

### 4.2 Inode Model

Each file/directory is represented by an `Inode`:

| Field | Type | Description |
|-------|------|-------------|
| `ino` | `u64` | Unique inode number |
| `kind` | `File \| Dir \| Symlink` | Entry type |
| `data` | `Uint8Array` | File content (files only) |
| `children` | `Map<string, ino>` | Directory entries (dirs only) |
| `metadata` | `Metadata` | size, timestamps, permissions |

### 4.3 WASI fd Mapping

| WASI import | VFS operation |
|-------------|---------------|
| `fd_read` | `vfs.read(fd, buf, len)` |
| `fd_write` | `vfs.write(fd, buf, len)` |
| `fd_seek` | `vfs.seek(fd, offset, whence)` |
| `path_open` | `vfs.open(dirfd, path, flags)` |
| `fd_readdir` | `vfs.readdir(fd)` |
| `fd_filestat_get` | `vfs.stat(fd)` |
| `path_unlink_file` | `vfs.unlink(dirfd, path)` |
| `path_create_directory` | `vfs.mkdir(dirfd, path)` |

---

## 5. Network Proxy

### 5.1 Architecture

WASI socket operations are not yet standardised. We define custom host imports:

| Host Import | Browser API |
|-------------|-------------|
| `sock_open(af, type)` | Creates internal socket descriptor |
| `sock_connect(fd, addr, port)` | `fetch()` for HTTP, `new WebSocket()` for WS |
| `sock_send(fd, buf, len)` | Buffers data, flushes on delimiter |
| `sock_recv(fd, buf, len)` | Returns buffered response bytes |
| `sock_close(fd)` | `AbortController.abort()` / `ws.close()` |

### 5.2 HTTP Request Flow

```
WASM Bun                  Host Network Proxy              Browser
─────────                 ──────────────────              ───────
sock_open()  ──────────►  allocate fd
sock_connect(fd, host) ►  store target
sock_send(fd, req)  ───►  parse HTTP request
                          build Request object ─────────► fetch(request)
                          ◄──────────────────────────────  Response
sock_recv(fd, buf)  ◄───  serialize response
sock_close(fd)      ───►  cleanup
```

### 5.3 Service Worker Proxy

For requests that need to be intercepted (e.g. `localhost:3000` dev server), a
**Service Worker** intercepts fetches from iframes and routes them to the WASM
runtime's built-in HTTP server.

---

## 6. Browser Runtime

### 6.1 Web Worker Isolation

The WASM module runs inside a **dedicated Web Worker** to avoid blocking the main
thread. Communication uses `postMessage` with `Transferable` objects (ArrayBuffer)
for zero-copy data transfer.

### 6.2 SharedArrayBuffer for Synchronous I/O

WASI calls are synchronous, but browser APIs are async. We bridge this gap using
`SharedArrayBuffer` + `Atomics.wait/notify`:

```
Worker (WASM)                          Main Thread / Host
─────────────                          ──────────────────
fd_read(fd, buf, len)
  │
  ▼
write request to SharedArrayBuffer
Atomics.wait(sab, IDX) ◄── blocks ──┐
                                     │
                        Atomics.notify(sab, IDX)
                                     │
                        write result to SAB ◄── async fetch
  │
  ▼
read result from SharedArrayBuffer
return to WASM
```

### 6.3 Cross-Origin Isolation

SharedArrayBuffer requires:
```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

The SDK detects these headers and falls back to a single-threaded async mode if
they are absent.

---

## 7. SDK Public API

```typescript
import { createBunContainer } from '@aspect-build/sdk'

// Boot a Bun container
const container = await createBunContainer({
  // Pre-populate the virtual filesystem
  files: {
    'package.json': '{ "name": "demo", "dependencies": { "express": "^4" } }',
    'index.ts': 'console.log("Hello from Bun-in-browser!")',
  },
  // Optional persistent storage
  persistence: 'indexeddb',       // 'memory' | 'indexeddb' | 'opfs'
})

// Run commands
const install = await container.exec('bun', ['install'])
console.log(install.exitCode)     // 0

// Stream stdout
const run = container.spawn('bun', ['run', 'index.ts'])
run.stdout.on('data', (chunk) => console.log(chunk))

// Access the virtual filesystem
await container.fs.writeFile('/app/hello.txt', 'world')
const data = await container.fs.readFile('/app/hello.txt', 'utf8')

// Mount / unmount directories
await container.mount('/external', externalFiles)

// Teardown
await container.destroy()
```

---

## 8. Package Structure

```
vitamin-bun/
├── docs/
│   └── TECHNICAL_DESIGN.md        ← this document
├── vendor/
│   └── bun/                       ← git submodule (https://github.com/oven-sh/bun)
├── packages/
│   ├── bun-wasm/                  ← WASM module loader & build helpers
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── loader.ts          ← fetch / compile / instantiate WASM
│   │   │   ├── compiler.ts        ← zig build & wasm-opt CLI helpers
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── wasm-host/                 ← WASI host imports (FS, net, JS ctx)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── wasi.ts            ← WASI import implementations
│   │   │   ├── js-context.ts      ← JS context bridge
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── virtual-fs/                ← Virtual filesystem
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── vfs.ts             ← Core VFS engine
│   │   │   ├── inode.ts           ← Inode model
│   │   │   ├── backends/
│   │   │   │   ├── memory.ts
│   │   │   │   ├── indexeddb.ts
│   │   │   │   └── opfs.ts
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── network-proxy/             ← Network interception
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── http-proxy.ts
│   │   │   ├── websocket-proxy.ts
│   │   │   ├── service-worker.ts
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── browser-runtime/           ← Worker lifecycle & SAB bridge
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── worker.ts
│   │   │   ├── sab-bridge.ts
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── sdk/                       ← Public API for embedders
│       ├── src/
│       │   ├── index.ts
│       │   ├── container.ts
│       │   └── types.ts
│       ├── package.json
│       └── tsconfig.json
├── package.json                   ← workspace root
├── tsconfig.base.json
└── turbo.json
```

---

## 9. Milestones

| Phase | Deliverable | Key Risk |
|-------|-------------|----------|
| **P0 — Skeleton** | Monorepo scaffold, type definitions, in-memory VFS with unit tests. | — |
| **P1 — WASM Host** | WASI import shim running a minimal C/Zig WASM binary (not yet Bun). | SAB browser support |
| **P2 — Bun WASM Build** | Fork Bun, strip JSC, cross-compile to wasm32-wasi. | Zig → WASM maturity |
| **P3 — JS Context Bridge** | Host-side JS eval connected to WASM Bun. | Semantic mismatch |
| **P4 — Networking** | HTTP proxy + Service Worker dev server. | CORS / CSP policies |
| **P5 — SDK & Demo** | Public `createBunContainer()` API, example app. | — |

---

## 10. Open Questions

1. **Zig WASM maturity** — Zig's `wasm32-wasi` target is improving but not
   production-ready for large codebases. Continuous tracking required.
2. **JavaScriptCore removal** — JSC is deeply integrated in Bun. An incremental
   approach may be needed: first compile *with* JSC-WASM, then swap to host JS.
3. **Thread model** — WASM threads proposal is not universally available.
   Single-threaded fallback must be maintained.
4. **Binary size** — Even after stripping JSC, Bun's WASM binary may be large.
   Lazy loading of subsystems (test runner, bundler) could help.
5. **WASI compatibility** — WASI Preview 2 (component model) is evolving.
   Starting with Preview 1 and migrating later is pragmatic.
