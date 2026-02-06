
# Vitamin-Bun：技术设计 — 将 Bun 编译为 WebAssembly

## 1. 概述

Vitamin-Bun 是一个将 [Bun](https://bun.sh) JavaScript 运行时编译为 WebAssembly（WASM）并在浏览器中运行的项目。受 [WebContainers](https://webcontainers.io/) 启发，宿主环境（浏览器）提供 JavaScript 执行上下文、虚拟文件系统和网络栈，使 Bun 的核心工具（打包器、包管理器、测试运行器、转译器）能够在浏览器内完整运行而无需远程服务器。

### 目标

| 目标 | 描述 |
|------|------|
| **在浏览器原生运行 Bun** | 在浏览器标签页中运行 `bun install`、`bun build`、`bun test` 等命令。 |
| **宿主提供 JS 上下文** | 将 JS 求值委托给浏览器自带的 V8/JSC 引擎，而非在 WASM 中携带完整的 JS 引擎。 |
| **虚拟文件系统** | 通过兼容 WASI 的 `fd_*` 导入，向 WASM 二进制呈现内存中的文件系统。 |
| **网络代理** | 将来自 WASM 的 HTTP / WebSocket 请求转发到浏览器的 `fetch()` / `WebSocket`。 |
| **尽量小的二进制体积** | 去除嵌入的 JavaScriptCore 和其他不必要的本地代码，使 `.wasm` 制品尽可能小（目标 < 20 MB gzip）。 |

---

## 2. 架构

```
┌──────────────────────────────────────────────────────────┐
│                     浏览器标签页                         │
│                                                          │
│  ┌─────────────┐   ┌──────────────────────────────────┐  │
│  │  主线程      │   │         Web Worker               │  │
│  │             │   │  ┌────────────────────────────┐  │  │
│  │  SDK / UI层  │◄──┼─►│   Bun WASM 模块             │  │  │
│  │             │   │  │                            │  │  │
│  │             │   │  │  ┌──────┐ ┌─────┐ ┌─────┐ │  │  │
│  └──────┬──────┘   │  │  │Bundler│ │ PM  │ │Test │ │  │  │
│         │          │  │  └──┬───┘ └──┬──┘ └──┬──┘ │  │  │
│         │          │  │     │        │       │    │  │  │
│         │          │  │  ┌──▼────────▼───────▼──┐ │  │  │
│         │          │  │  │   WASI 接口             │ │  │  │
│         │          │  │  └──────────┬────────────┘ │  │  │
│         │          │  └─────────────┼──────────────┘  │  │
│         │          │                │                  │  │
│         │          │  ┌─────────────▼──────────────┐  │  │
│         │          │  │    宿主绑定层               │  │  │
│         │          │  │  ┌──────┐┌─────┐┌────────┐ │  │  │
│         │          │  │  │ VFS  ││ Net ││ JS 上下文│ │  │  │
│         │          │  │  └──────┘└─────┘└────────┘ │  │  │
│         │          │  └────────────────────────────┘  │  │
│  ┌──────▼──────┐   └──────────────────────────────────┘  │
│  │服务工作线程  │                                        │
│  │（网络代理）  │                                        │
│  └──────────────┘                                        │
└──────────────────────────────────────────────────────────┘
```

### 2.1 层级摘要

| 层 | 包 | 职责 |
|----|-----|------|
| **WASM 模块** | `@vitamin-ai/bun-wasm`（外部构建） | 将 Bun 编译为 `wasm32-wasi`，移除内部 JS 引擎。 |
| **宿主绑定** | `@vitamin-ai/wasm-host` | 实现 WASI 导入（`fd_read`、`fd_write`、`sock_*` 等），并代理到浏览器 API。 |
| **虚拟文件系统** | `@vitamin-ai/virtual-fs` | 内存文件系统，支持分层后端（memory、IndexedDB、OPFS）。 |
| **网络代理** | `@vitamin-ai/network-proxy` | 将 WASI socket 调用翻译为浏览器的 `fetch()` 和 `WebSocket`。 |
| **浏览器运行时** | `@vitamin-ai/browser-runtime` | 管理 Web Worker 生命周期、SharedArrayBuffer 协调、Service Worker 注册。 |
| **SDK** | `@vitamin-ai/sdk` | 提供给嵌入者的公共 API：`createBunContainer()`、终端 I/O、文件挂载等。 |

---

## 3. 将 Bun 编译为 WASM

### 3.1 源码修改

Bun 使用 **Zig** 编写（并包含一些 C/C++ 依赖，包括 JavaScriptCore）。要编译为 `wasm32-wasi`：

1. **移除 JavaScriptCore** — 浏览器已经提供了 JS 引擎，需要将 JSC 的 FFI 调用点替换为跨 WASM 边界的宿主导入存根（host import stubs）。
2. **调整 Zig 构建目标** — 在修补平台相关代码（如 epoll、kqueue、io_uring → WASI poll）后使用 `zig build -Dtarget=wasm32-wasi`。
3. **替换 libc / POSIX 接口** — 将 `pthreads`、`mmap`、信号等替换为 WASI 等价项或在浏览器语义不匹配时作为 no-op。 
4. **去除本地 TLS** — TLS 在浏览器端终止，WASM 二进制只处理明文流。

### 3.2 构建流水线

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
   wasm-opt -Oz --strip   (Binaryen 优化)
          │
          ▼
   bun-core.opt.wasm      （目标 < 20 MB gzip）
```

### 3.3 JS 上下文桥接

不将 JS 引擎嵌入 WASM，而是由宿主执行 JS：

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

宿主侧维护一个 **handle table**，将整数句柄 ↔ JS 对象映射，这样 WASM 端可以通过句柄引用宿主对象而无需直接指针访问。

---

## 4. 虚拟文件系统（VFS）

### 4.1 设计

VFS 提供类 POSIX 的文件系统 API，供 WASI 的 `fd_*` 导入使用。

```
┌────────────────────────────────────────┐
│            VFS 接口                     │
│  open / read / write / stat / readdir   │
├────────────────────────────────────────┤
│          挂载层                         │
│  /project  → MemoryBackend             │
│  /tmp      → MemoryBackend             │
│  /cache    → IndexedDBBackend          │
│  /persist  → OPFSBackend               │
├────────────────────────────────────────┤
│         存储后端                        │
│  ┌──────────┐ ┌───────────┐ ┌──────┐   │
│  │  Memory  │ │ IndexedDB │ │ OPFS │   │
│  └──────────┘ └───────────┘ └──────┘   │
└────────────────────────────────────────┘
```

### 4.2 inode 模型

每个文件/目录由一个 `Inode` 表示：

| 字段 | 类型 | 描述 |
|------|------|------|
| `ino` | `u64` | 唯一的 inode 编号 |
| `kind` | `File \| Dir \| Symlink` | 条目类型 |
| `data` | `Uint8Array` | 文件内容（仅文件） |
| `children` | `Map<string, ino>` | 目录条目（仅目录） |
| `metadata` | `Metadata` | 大小、时间戳、权限 |

### 4.3 WASI fd 映射

| WASI 导入 | VFS 操作 |
|-----------|----------|
| `fd_read` | `vfs.read(fd, buf, len)` |
| `fd_write` | `vfs.write(fd, buf, len)` |
| `fd_seek` | `vfs.seek(fd, offset, whence)` |
| `path_open` | `vfs.open(dirfd, path, flags)` |
| `fd_readdir` | `vfs.readdir(fd)` |
| `fd_filestat_get` | `vfs.stat(fd)` |
| `path_unlink_file` | `vfs.unlink(dirfd, path)` |
| `path_create_directory` | `vfs.mkdir(dirfd, path)` |

---

## 5. 网络代理

### 5.1 架构

WASI 的 socket 操作尚未标准化，因此我们定义自定义的宿主导入：

| 宿主导入 | 浏览器 API |
|----------|------------|
| `sock_open(af, type)` | 分配内部 socket 描述符 |
| `sock_connect(fd, addr, port)` | 对 HTTP 使用 `fetch()`，对 WS 使用 `new WebSocket()` |
| `sock_send(fd, buf, len)` | 缓冲数据，遇分隔符时刷新 |
| `sock_recv(fd, buf, len)` | 返回缓冲的响应字节 |
| `sock_close(fd)` | 调用 `AbortController.abort()` 或 `ws.close()` |

### 5.2 HTTP 请求流程

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

### 5.3 Service Worker 代理

对于需要拦截的请求（例如本地开发服务器 `localhost:3000`），使用 **Service Worker** 拦截嵌入页面的 fetch 请求，并将请求路由到 WASM 运行时内置的 HTTP 服务器。

---

## 6. 浏览器运行时

### 6.1 Web Worker 隔离

WASM 模块在一个 **独立的 Web Worker** 中运行以避免阻塞主线程。通信通过 `postMessage` 和可转移对象（ArrayBuffer）实现零拷贝数据传输。

### 6.2 使用 SharedArrayBuffer 实现同步 I/O

WASI 调用是同步的，但浏览器 API 通常是异步的。我们使用 `SharedArrayBuffer` + `Atomics.wait/notify` 来桥接两者：

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

### 6.3 跨域隔离要求

SharedArrayBuffer 依赖以下响应头：

```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

SDK 会检测这些头部；如果缺失，则回退到单线程的异步模式。

---

## 7. SDK 公共 API

示例用法：

```typescript
import { createBunContainer } from '@vitamin-ai/sdk'

// 启动一个 Bun 容器
const container = await createBunContainer({
   // 预填充虚拟文件系统
   files: {
      'package.json': '{ "name": "demo", "dependencies": { "express": "^4" } }',
      'index.ts': 'console.log("Hello from Bun-in-browser!")',
   },
   // 可选持久化存储
   persistence: 'indexeddb',       // 'memory' | 'indexeddb' | 'opfs'
})

// 运行命令
const install = await container.exec('bun', ['install'])
console.log(install.exitCode)     // 0

// 流式读取 stdout
const run = container.spawn('bun', ['run', 'index.ts'])
run.stdout.on('data', (chunk) => console.log(chunk))

// 访问虚拟文件系统
await container.fs.writeFile('/app/hello.txt', 'world')
const data = await container.fs.readFile('/app/hello.txt', 'utf8')

// 挂载 / 卸载 目录
await container.mount('/external', externalFiles)

// 销毁
await container.destroy()
```

---

## 8. 包结构

```
vitamin-bun/
├── docs/
│   └── TECHNICAL_DESIGN.md        ← 本文档
├── packages/
│   ├── wasm-host/                 ← WASI 宿主导入（FS、net、JS 上下文）
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── wasi.ts            ← WASI 导入实现
│   │   │   ├── js-context.ts      ← JS 上下文桥接
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── virtual-fs/                ← 虚拟文件系统
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── vfs.ts             ← 核心 VFS 引擎
│   │   │   ├── inode.ts           ← Inode 模型
│   │   │   ├── backends/
│   │   │   │   ├── memory.ts
│   │   │   │   ├── indexeddb.ts
│   │   │   │   └── opfs.ts
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── network-proxy/             ← 网络拦截与代理
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── http-proxy.ts
│   │   │   ├── websocket-proxy.ts
│   │   │   ├── service-worker.ts
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── browser-runtime/           ← Worker 生命周期与 SAB 桥接
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── worker.ts
│   │   │   ├── sab-bridge.ts
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── sdk/                       ← 嵌入者用公共 API
│       ├── src/
│       │   ├── index.ts
│       │   ├── container.ts
│       │   └── types.ts
│       ├── package.json
│       └── tsconfig.json
├── package.json                   ← 工作区根
├── tsconfig.base.json
└── turbo.json
```

---

## 9. 里程碑

| 阶段 | 可交付成果 | 关键风险 |
|------|-----------|---------|
| **P0 — 骨架** | Monorepo 脚手架、类型定义、带单元测试的内存 VFS。 | — |
| **P1 — WASM 宿主** | 实现 WASI 导入的 shim，能运行最小的 C/Zig WASM 二进制（尚非 Bun）。 | SharedArrayBuffer 浏览器支持 |
| **P2 — Bun WASM 构建** | Fork Bun，剥离 JSC，交叉编译为 wasm32-wasi。 | Zig 到 WASM 的成熟度 |
| **P3 — JS 上下文桥接** | 将宿主侧的 JS eval 与 WASM Bun 连接起来。 | 语义不一致风险 |
| **P4 — 网络** | 实现 HTTP 代理与 Service Worker 开发服务器。 | CORS / CSP 限制 |
| **P5 — SDK & 示例** | 提供 `createBunContainer()` 公共 API 与示例应用。 | — |

---

## 10. 未决问题

1. **Zig 的 WASM 成熟度** — Zig 的 `wasm32-wasi` 目标在不断改进，但对于大型代码库可能尚未完全生产就绪。需要持续跟踪。
2. **JavaScriptCore 的移除** — JSC 在 Bun 中耦合较深，可能需要逐步迁移：先编译包含 JSC 的 WASM，然后再切换到宿主 JS。 
3. **线程模型** — WASM 线程提案并非普遍可用，需要保留单线程回退路径。
4. **二进制体积** — 即使剥离 JSC 后，Bun 的 WASM 二进制仍可能较大。将子系统（测试运行器、打包器）懒加载可能有助于减小初始下载体积。
5. **WASI 兼容性** — WASI Preview 2（组件模型）仍在发展，先从 Preview 1 开始并在未来迁移是务实的策略。

# Vitamin-Bun：技术设计 — 将 Bun 编译为 WebAssembly

## 1. 概述

Vitamin-Bun 是一个将 [Bun](https://bun.sh) JavaScript 运行时编译为 WebAssembly（WASM），并在浏览器中运行的项目。受 [WebContainers](https://webcontainers.io/) 启发，宿主环境（浏览器）提供 JavaScript 执行上下文、虚拟文件系统和网络栈，使 Bun 的核心工具（打包器、包管理器、测试运行器和转译器）能够在浏览器内完全运行而无需远程服务器。

### 目标

| 目标 | 描述 |
|------|------|
| **原生浏览器中的 Bun** | 在浏览器标签页中运行 `bun install`、`bun build`、`bun test`。 |
| **宿主提供的 JS 上下文** | 将 JS 求值委托给浏览器内置的 V8/JSC 引擎，而不是在 WASM 中携带完整的 JS 引擎。 |
| **虚拟文件系统** | 通过兼容 WASI 的 `fd_*` 导入向 WASM 二进制呈现内存中的文件系统。 |
| **网络代理** | 将来自 WASM 的 HTTP / WebSocket 请求转发到浏览器的 `fetch()` / `WebSocket`。 |
| **尽量小的二进制体积** | 去除嵌入的 JavaScriptCore 引擎和其他不必要的本地代码，使 `.wasm` 制品尽可能小（目标 < 20 MB gzip）。 |

---

## 2. 架构

```
┌──────────────────────────────────────────────────────────┐
│                     浏览器标签页                         │
│                                                          │
│  ┌─────────────┐   ┌──────────────────────────────────┐  │
│  │  主线程      │   │         Web Worker               │  │
│  │             │   │  ┌────────────────────────────┐  │  │
│  │  SDK / UI层  │◄──┼─►│   Bun WASM 模块             │  │  │
│  │             │   │  │                            │  │  │
│  │             │   │  │  ┌──────┐ ┌─────┐ ┌─────┐ │  │  │
│  └──────┬──────┘   │  │  │Bundler│ │ PM  │ │Test │ │  │  │
│         │          │  │  └──┬───┘ └──┬──┘ └──┬──┘ │  │  │
│         │          │  │     │        │       │    │  │  │
│         │          │  │  ┌──▼────────▼───────▼──┐ │  │  │
│         │          │  │  │   WASI 接口             │ │  │  │
│         │          │  │  └──────────┬────────────┘ │  │  │
│         │          │  └─────────────┼──────────────┘  │  │
│         │          │                │                  │  │
│         │          │  ┌─────────────▼──────────────┐  │  │
│         │          │  │    宿主绑定层               │  │  │
│         │          │  │  ┌──────┐┌─────┐┌────────┐ │  │  │
│         │          │  │  │ VFS  ││ Net ││ JS 上下文│ │  │  │
│         │          │  │  └──────┘└─────┘└────────┘ │  │  │
│         │          │  └────────────────────────────┘  │  │
│  ┌──────▼──────┐   └──────────────────────────────────┘  │
```
```

### 2.1 Layer Summary

| Layer | Package | Responsibility |
|-------|---------|----------------|
| **WASM Module** | `@vitamin-ai/bun-wasm` (external build) | Bun compiled to `wasm32-wasi` with JS engine removed. |
| **Host Bindings** | `@vitamin-ai/wasm-host` | Implements WASI imports (`fd_read`, `fd_write`, `sock_*`, …) by delegating to browser APIs. |
| **Virtual FS** | `@vitamin-ai/virtual-fs` | In-memory filesystem with layered backends (memory, IndexedDB, OPFS). |
| **Network Proxy** | `@vitamin-ai/network-proxy` | Translates WASI socket calls to browser `fetch()` and `WebSocket`. |
| **Browser Runtime** | `@vitamin-ai/browser-runtime` | Web Worker lifecycle, SharedArrayBuffer coordination, Service Worker registration. |
| **SDK** | `@vitamin-ai/sdk` | Public API for embedders — `createBunContainer()`, terminal I/O, file mount. |

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
import { createBunContainer } from '@vitamin-ai/sdk'

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
├── packages/
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

