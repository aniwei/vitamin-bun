# Vitamin-Bun：TypeScript 全量实现路线

> **核心结论**：技术方案切换为 **纯 TypeScript 实现 Bun 全部功能**（BunTS）。
> 不再以 WASM 迁移 Bun 本体为主线，而是基于浏览器原生 JS 引擎实现 **Bun CLI、运行时 API、包管理器、构建器与测试框架**。

---

## 1. 目标与范围

### 1.1 目标

在浏览器中实现 **Bun 全量功能集**，以 TypeScript 为主实现语言，面向以下能力：

- `bun run` / `bun test` / `bun build` / `bun install`
- Bun 运行时 API（`Bun.*`）
- Node 兼容核心模块（`fs`/`path`/`url`/`http`/`crypto`/`buffer`/`process`）
- 模块系统（ESM + CJS 混合）
- 开发服务器与本地网络代理

### 1.2 边界与约束

浏览器环境不可避免的限制仍需明确：

- **无原生 TCP/UDP**，网络能力以 `fetch`/`WebSocket` 为基础
- **文件系统受限**，需使用 VFS/IndexedDB/OPFS
- **多线程受限**，依赖 `SharedArrayBuffer + Atomics` 的跨域隔离

> **原则**：在浏览器允许范围内做到 Bun 语义全覆盖；浏览器不可实现的能力提供等价替代或受限实现，并明确行为差异。

---

## 2. 总体路线：BunTS（纯 TS 运行时）

### 2.1 高层架构

```
┌──────────────────────────────────────────────────────────┐
│                 Browser Runtime (BunTS)                  │
│                                                          │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │ Transpiler │  │ ModuleLoader│  │ Runtime Polyfill │   │
│  │ (TS/JSX)   │  │ (ESM/CJS)   │  │ Bun + Node APIs  │   │
│  └─────┬──────┘  └──────┬──────┘  └────────┬─────────┘   │
│        │               │                  │             │
│  ┌─────▼──────────┐     │          ┌──────▼──────────┐  │
│  │ Package Manager│     │          │ Test Runner      │  │
│  │ (registry, lock)|    │          │ (discover/run)   │  │
│  └─────┬──────────┘     │          └──────┬──────────┘  │
│        │                │                  │             │
│  ┌─────▼──────────┐     │          ┌──────▼──────────┐  │
│  │ Bundler/Builder│     │          │ Dev Server/SW    │  │
│  │ (graph, output)│     │          │ (localhost proxy)│  │
│  └────────────────┘     │          └──────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐   │
│  │ VFS + Storage Backends (Memory/IndexedDB/OPFS)     │   │
│  │ Network Proxy (fetch/WebSocket)                    │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 2.2 关键原则

1. **纯 TS 实现**：不依赖 JSC 或 WASM 运行时
2. **渐进交付**：每阶段都有可运行的 SDK API 与示例
3. **能力分层**：运行时 → 包管理 → 构建 → 测试 → 生态兼容

---

## 3. 核心模块设计

### 3.1 Transpiler / Compiler

- 目标：TS/JSX/TSX → JS
- 方案：使用 TypeScript 编译器（JS 运行时版本）或纯 TS 转译器
- 输出：标准 ESM/CJS 兼容 JS

### 3.2 Module Loader（ESM/CJS）

- 统一模块解析与执行：
  - ESM：使用 `import()` + 手工链接（或虚拟模块系统）
  - CJS：通过 `Function` 包裹与 `require` polyfill
- 支持 `node_modules` 解析与路径映射

### 3.3 Runtime Polyfill（Bun + Node API）

- `Bun.*` API：`file`, `write`, `serve`, `spawn`, `env`, `sleep` 等
- Node 核心模块：`fs`, `path`, `url`, `http`, `crypto`, `buffer`, `process`
- 依赖 VFS + 网络代理 + Web APIs 实现

### 3.4 Package Manager

- 解析 npm registry 元数据
- 处理 semver / peer deps / workspace protocol
- 将依赖写入 VFS + lockfile 生成

### 3.5 Bundler / Builder

- 依赖图构建、tree-shaking、输出格式（ESM/CJS）
- 支持 `bun build` 的关键参数与输出行为

### 3.6 Test Runner

- 测试发现、并发执行、reporter
- 与 `bun test` 语义对齐

### 3.7 Dev Server / Service Worker

- 使用 Service Worker 拦截 `localhost` 请求
- 支持 `bun --watch` 和 HMR 基础路径

---

## 4. 分阶段路线与时间线

### Phase 0：基础设施（2-3 周）

**目标**：支撑 TS 运行时的基础设施稳定可用

- 完成 VFS 后端（Memory/IndexedDB/OPFS）
- 网络代理层（HTTP/WebSocket）稳定可用
- Worker 生命周期与 SAB 桥接完善

**验收标准**：
- SDK 能创建容器并执行纯 JS 代码（非 Bun 语义）
- VFS/网络代理单元测试全覆盖

### Phase 1：运行时内核（4-6 周）

**目标**：实现 BunTS 的最小可运行版本

- Transpiler 支持 TS/JSX 转译
- Module Loader 支持 ESM + CJS 混合解析
- 运行时 polyfill 实现核心 Bun/Node API

**验收标准**：
- `bun run` 可执行 TS 文件（含 import/require）
- `Bun.file()` / `Bun.write()` / `process.env` 生效

### Phase 2：包管理器（4-8 周）

**目标**：实现 `bun install`

- Registry client + 依赖解析
- lockfile 生成
- `node_modules` 写入 VFS

**验收标准**：
- 运行 `bun install` 可正确写入 `node_modules`
- 可加载常见库（如 lodash / react）

### Phase 3：构建器（4-8 周）

**目标**：实现 `bun build`

- 依赖图 + tree-shaking
- 目标输出格式与 sourcemap

**验收标准**：
- `bun build` 可输出可运行 bundle

### Phase 4：测试框架（3-6 周）

**目标**：实现 `bun test`

- 测试发现 / runner / reporter
- 与 Bun 的测试语义保持一致

**验收标准**：
- `bun test` 可执行 Vitest/ Jest 风格测试集

### Phase 5：兼容性与性能（持续）

- 性能优化（缓存、增量编译）
- Bun API/Node API 完整性提升
- 文档与生态适配

---

## 5. SDK 与 API 形态

### 5.1 核心 API（保持不变）

```ts
import { createBunContainer } from '@vitamin-ai/sdk'

const container = await createBunContainer({
  files: { '/index.ts': 'console.log("hello")' },
})

const result = await container.exec('bun', ['run', '/index.ts'])
console.log(result.stdout)
```

### 5.2 新增能力（逐步上线）

- `container.install()` → 触发 `bun install`
- `container.build()` → 触发 `bun build`
- `container.test()` → 触发 `bun test`

---

## 6. 与既有 WASM 方案的关系

- **WASM 迁移路线不再是主线**
- `@vitamin-ai/wasm-host` 可保留为实验性/兼容层，但不作为核心依赖
- 文档与路线以 BunTS（纯 TS 实现）为准

---

## 7. 风险与缓解

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| TS 实现性能不足 | 中 | 高 | 缓存 + 增量编译 + worker 并发 |
| Node/Bun API 兼容度高成本 | 高 | 高 | 先覆盖高频 API，建立兼容矩阵 |
| 浏览器安全限制 | 中 | 中 | SW 拦截 + 受限网络模型 |
| 生态依赖复杂 | 高 | 中 | 优先支持主流库，逐步扩展 |

---

## 8. 总结

该方案把目标明确为 **“在浏览器中用 TypeScript 复刻 Bun 能力”**，抛弃 WASM 迁移的高成本与不确定性。通过模块化分阶段交付，保证每一阶段都能落地，并在长期迭代中接近 Bun 的全量功能集。
# Vitamin-Bun：可落地实施方案

> **核心结论**：Bun **已经**将其转译器/扫描器子系统编译为 WASM（见 `oven-sh/bun` 仓库的 `packages/bun-wasm/` 和 `src/main_wasm.zig`），这是一个关键的**已验证前提**。本方案基于这个已有基础，设计一个分阶段、可验证的路线来在浏览器中运行 Bun 的核心能力。

---

## 1. 现实评估：Bun WASM 的当前状态

### 1.1 Bun 源码中的 WASM 支撑（已有）

通过分析 `oven-sh/bun` 仓库，发现以下关键事实：

| 发现 | 文件位置 | 含义 |
|------|---------|------|
| **WASM 构建目标已存在** | `src/env.zig` — `BuildTarget = enum { native, wasm, wasi }` | Zig 构建系统已知道 WASM 目标 |
| **WASM 入口点已存在** | `src/main_wasm.zig` — 定义 `console_*` 外部导入、`Uint8Array` 桥接 | Bun 已有 WASM 特定的入口代码 |
| **bun-wasm 包已存在** | `packages/bun-wasm/index.ts` — 完整的 WASI shim + 实例化逻辑 | Bun 的**转译器**已可在浏览器中运行 |
| **build.zig 处理 WASM** | `build.zig` L148-170 — `arch.isWasm()` → `.wasm` OS | 构建系统已处理 WASM 架构检测 |
| **WASM 时跳过 libc** | `build.zig` L780 — `if (opts.os != .wasm) { obj.linkLibC(); }` | WASM 目标不链接 libc |
| **编译目标明确拒绝 WASM** | `src/compile_target.zig` L439 — `"WebAssembly is not supported. Sorry!"` | `bun build --compile` 不支持 WASM，但这只是打包器功能 |

### 1.2 bun-wasm 包已有能力

`packages/bun-wasm/index.ts` 已实现：

```
能力            状态      说明
─────────────   ───────   ──────────────────
转译 (transform) ✅ 可用   JS/TS/JSX/TSX → JS
扫描 (scan)      ✅ 可用   依赖扫描与 import 分析
测试发现         ✅ 可用   获取测试用例列表
WASI shim        ✅ 基础   clock_time_get, environ_*, fd_close, proc_exit
```

**未包含**：包管理器 (bun install)、打包器 (bun build)、测试运行器 (bun test 执行)、HTTP 服务器。

### 1.3 关键技术障碍分析

| 障碍 | 严重度 | 说明 |
|------|--------|------|
| **JavaScriptCore 深度耦合** | 🔴 极高 | JSC 是 Bun 的 JS 引擎，几乎所有功能都通过 JSC FFI 调用，移除意味着重写大量代码 |
| **C/C++ 依赖不支持 WASM** | 🔴 高 | boringssl (TLS)、libarchive、lz4、zstd、libuv 等 C 库需逐一 WASM 移植或替换 |
| **多线程依赖** | 🟡 中 | Bun 大量使用 pthread，WASM 线程支持有限且需 SharedArrayBuffer |
| **二进制体积** | 🟡 中 | 当前 bun-wasm (仅转译器) 已约 40-80MB raw，完整 Bun 会更大 |
| **系统调用** | 🟡 中 | epoll/kqueue/io_uring → WASI poll，mmap → 线性内存 |

---

## 2. 务实的分阶段方案

基于以上分析，**完整复刻 Bun 到 WASM 是一个多年项目**。可落地方案应采用**增量策略**：先利用已有基础快速交付价值，再逐步扩展。

### 总体策略：三层递进

```
╔═══════════════════════════════════════════════════════════════════╗
║  Phase 1: "Bun Transpiler in Browser"                           ║
║  ─────────────────────────────────────                          ║
║  利用已有 bun-wasm (转译器/扫描器)                               ║
║  + 本项目的 VFS + SDK 壳                                        ║
║  → 可在浏览器内做 TS/JSX 转译、依赖扫描                          ║
║  → 预计 2-4 周                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║  Phase 2: "Bun Package Manager in Browser"                      ║
║  ─────────────────────────────────────────                      ║
║  用纯 TypeScript 在宿主侧实现 bun install 的核心逻辑             ║
║  (registry 解析 + VFS 写入 + lockfile)                           ║
║  → 不依赖 WASM，纯浏览器 JS 实现                                ║
║  → 类似 WebContainers 的 turbo npm client 方案                   ║
║  → 预计 4-8 周                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║  Phase 3: "Bun Runtime in Browser"                              ║
║  ────────────────────────────────                               ║
║  将 Bun 更多子系统编译为 WASM                                    ║
║  或用宿主 JS 引擎模拟 Bun 运行时行为                             ║
║  → bun run / bun test (通过浏览器 JS 引擎执行)                   ║
║  → 预计 3-6 月                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## 3. Phase 1：Bun 转译器 In Browser（2-4 周）

### 3.1 目标

在浏览器中运行 `bun transpile`（TS/JSX → JS 转译）和 `bun scan`（依赖扫描），通过本项目的 SDK 对外暴露。

### 3.2 架构

```
┌────────────────────────────────────────────────────┐
│                  浏览器主线程                        │
│                                                    │
│  ┌──────────────┐                                  │
│  │  SDK          │  container.transpile(code)       │
│  │  (公共 API)   │  container.scan(code)            │
│  └──────┬───────┘                                  │
│         │ postMessage                              │
│  ┌──────▼────────────────────────────────────────┐ │
│  │              Web Worker                        │ │
│  │  ┌─────────────────────────────────────────┐  │ │
│  │  │  bun-wasm (已有, ~2MB gzip)             │  │ │
│  │  │  ┌───────────┐  ┌──────────┐            │  │ │
│  │  │  │ Transpiler │  │ Scanner  │            │  │ │
│  │  │  └───────────┘  └──────────┘            │  │ │
│  │  │                                         │  │ │
│  │  │  WASI Preview 1 shim (已有)             │  │ │
│  │  └─────────────────────────────────────────┘  │ │
│  │                                                │ │
│  │  ┌─────────────────────────────────────────┐  │ │
│  │  │  VFS (本项目, 已实现)                    │  │ │
│  │  └─────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

### 3.3 具体任务

#### 3.3.1 获取 bun-wasm 产物

```bash
# 方案 A: 直接使用 Bun 官方 npm 包（如已发布）
npm install bun-wasm

# 方案 B: 从 Bun 源码自行构建
git clone https://github.com/oven-sh/bun vendor/bun
cd vendor/bun
# Bun 的 WASM 构建使用 Zig + 自定义 build.zig
zig build -Dtarget=wasm32-wasi -Doptimize=ReleaseSmall
# 产出 bun-core.wasm → 通过 wasm-opt 优化
wasm-opt -Oz --strip bun-core.wasm -o bun-core.opt.wasm
```

**推荐方案 A**：`bun-wasm` 曾作为 npm 包发布过，优先查找可用版本。如不可用则走方案 B。

#### 3.3.2 创建 `@vitamin-ai/wasm-host` 包

这是整个架构的**核心桥接层**，需要新建。

```
packages/wasm-host/
├── src/
│   ├── index.ts           ← 导出 WasmHost 类
│   ├── wasi-shim.ts       ← WASI Preview 1 导入实现
│   ├── memory.ts          ← WASM 线性内存管理
│   ├── loader.ts          ← fetch + compile + instantiate WASM
│   └── types.ts
├── package.json
└── tsconfig.json
```

**wasi-shim.ts 核心接口**（基于 bun-wasm 已有的 WASI shim 扩展）：

```typescript
export interface WasiImports {
  // 时钟
  clock_time_get(id: number, precision: bigint, out: number): number
  clock_res_get(id: number, out: number): number

  // 文件描述符（连接到 VFS）
  fd_read(fd: number, iovs: number, iovsLen: number, nread: number): number
  fd_write(fd: number, iovs: number, iovsLen: number, nwritten: number): number
  fd_seek(fd: number, offset: bigint, whence: number, newoffset: number): number
  fd_close(fd: number): number
  fd_fdstat_get(fd: number, buf: number): number
  fd_filestat_get(fd: number, buf: number): number
  fd_prestat_get(fd: number, buf: number): number
  fd_prestat_dir_name(fd: number, path: number, pathLen: number): number
  fd_readdir(fd: number, buf: number, bufLen: number, cookie: bigint, used: number): number

  // 路径操作
  path_open(dirfd: number, dirflags: number, path: number, pathLen: number,
            oflags: number, fsRightsBase: bigint, fsRightsInheriting: bigint,
            fdflags: number, fd: number): number
  path_filestat_get(fd: number, flags: number, path: number, pathLen: number, buf: number): number
  path_create_directory(fd: number, path: number, pathLen: number): number
  path_unlink_file(fd: number, path: number, pathLen: number): number
  path_remove_directory(fd: number, path: number, pathLen: number): number

  // 环境
  environ_get(environ: number, buf: number): number
  environ_sizes_get(countOut: number, sizeOut: number): number
  args_get(argv: number, buf: number): number
  args_sizes_get(argc: number, bufSize: number): number

  // 进程
  proc_exit(code: number): never
  sched_yield(): number
  random_get(buf: number, len: number): number
}
```

#### 3.3.3 连接 VFS → WASI

VFS 已有完整的文件系统操作，需要将 WASI 的 `fd_*` 调用映射到 VFS：

```typescript
// wasi-shim.ts 中的 fd_read 实现示例
fd_read(fd: number, iovs: number, iovsLen: number, nread: number): number {
  const view = new DataView(this.memory.buffer)
  let totalRead = 0

  for (let i = 0; i < iovsLen; i++) {
    const ptr = view.getUint32(iovs + i * 8, true)
    const len = view.getUint32(iovs + i * 8 + 4, true)
    const buf = new Uint8Array(this.memory.buffer, ptr, len)

    const bytesRead = this.vfs.read(fd, buf, len) // ← 调用 VFS
    totalRead += bytesRead
    if (bytesRead < len) break
  }

  view.setUint32(nread, totalRead, true)
  return 0 // ESUCCESS
}
```

#### 3.3.4 更新 SDK API

```typescript
// container.ts - 新增转译能力
export interface BunContainer {
  // Phase 1 能力
  transpile(code: string, loader?: 'ts' | 'tsx' | 'jsx' | 'js'): Promise<string>
  scan(code: string): Promise<ScanResult>

  // VFS 操作（已有）
  fs: ContainerFS

  // Phase 2+ 能力（暂未实现）
  exec(command: string, args: string[]): Promise<ExecResult>
  spawn(command: string, args: string[]): SpawnedProcess
}
```

#### 3.3.5 真正的 Worker 脚本

替换当前占位符 Worker，实现真正的 WASM 加载：

```typescript
// worker-script.ts
import { Bun } from 'bun-wasm' // 或从本地路径加载

self.onmessage = async (e: MessageEvent) => {
  const { type, id, payload } = e.data

  switch (type) {
    case 'init':
      await Bun.init(payload.wasmUrl)
      self.postMessage({ type: 'init-done', id })
      break

    case 'transpile':
      const result = Bun.transformSync(payload.code, payload.loader)
      self.postMessage({ type: 'result', id, payload: result })
      break

    case 'scan':
      const scanResult = Bun.scan(payload.code, payload.path, payload.loader)
      self.postMessage({ type: 'result', id, payload: scanResult })
      break
  }
}
```

### 3.4 Phase 1 验收标准

```typescript
// 用户侧使用示例
import { createBunContainer } from '@vitamin-ai/sdk'

const container = await createBunContainer()

// ✅ 转译 TypeScript
const js = await container.transpile(`
  const greeting: string = "Hello"
  export default greeting
`, 'ts')
// → 'const greeting = "Hello";\nexport default greeting;\n'

// ✅ 扫描依赖
const scan = await container.scan(`
  import React from 'react'
  import { useState } from 'react'
  import('./lazy-module')
`)
// → { imports: ['react', './lazy-module'], exports: [...] }

// ✅ VFS 操作
await container.fs.writeFile('/app/index.ts', 'console.log("hi")')
const code = await container.fs.readFile('/app/index.ts', 'utf8')
```

---

## 4. Phase 2：浏览器端包管理器（4-8 周）

### 4.1 策略选择

**关键洞察**：WebContainers 的 `npm` 客户端是**纯 JavaScript 实现**，并非在 WASM 中运行 npm CLI。同理，我们应该用**纯 TypeScript** 在浏览器宿主侧实现 `bun install` 的核心逻辑，而非等待将 Bun 包管理器编译为 WASM。

理由：
1. Bun 的包管理器深度依赖 JSC、网络栈、文件系统 — 移植成本极高
2. 浏览器已有 `fetch()` — 可以直接访问 npm registry
3. VFS 已实现 — 包文件可直接写入虚拟文件系统
4. WebContainers 已验证此方案可行

### 4.2 架构

```
┌──────────────────────────────────────────────────────────┐
│  @vitamin-ai/package-manager (新包)                       │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Registry    │  │  Resolver    │  │  Installer     │  │
│  │  Client      │  │  (依赖解析)  │  │  (VFS 写入)    │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                │                   │           │
│    fetch() ←─────────────┼───────────────────┘           │
│    npm registry          │                               │
│                    ┌─────▼────────┐                      │
│                    │  Lockfile    │                      │
│                    │  Generator   │                      │
│                    └──────────────┘                      │
│                                                          │
│  输入: package.json (从 VFS 读取)                         │
│  输出: node_modules/ (写入 VFS) + bun.lockb              │
└──────────────────────────────────────────────────────────┘
```

### 4.3 关键模块

#### 4.3.1 Registry Client

```typescript
export class RegistryClient {
  // 通过 CORS proxy 或直接访问 registry
  async getPackageMetadata(name: string): Promise<PackageMetadata> {
    // npm registry 支持 CORS
    const res = await fetch(`https://registry.npmjs.org/${name}`)
    return res.json()
  }

  async downloadTarball(url: string): Promise<ArrayBuffer> {
    // 下载 .tgz 包
    const res = await fetch(url)
    return res.arrayBuffer()
  }
}
```

#### 4.3.2 依赖解析器

```typescript
export class DependencyResolver {
  // 实现 Bun 兼容的解析算法
  // - semver 范围解析
  // - peer dependency 处理
  // - workspace protocol
  async resolve(packageJson: PackageJson): Promise<ResolvedTree> {
    // ...
  }
}
```

#### 4.3.3 安装器

```typescript
export class Installer {
  constructor(private vfs: VFS, private registry: RegistryClient) {}

  async install(resolved: ResolvedTree): Promise<void> {
    for (const pkg of resolved.packages) {
      const tarball = await this.registry.downloadTarball(pkg.dist.tarball)
      const files = await untar(ungzip(tarball))  // 在浏览器中解压

      for (const file of files) {
        await this.vfs.writeFile(
          `/node_modules/${pkg.name}/${file.path}`,
          file.content
        )
      }
    }
  }
}
```

### 4.4 Phase 2 验收标准

```typescript
const container = await createBunContainer({
  files: {
    'package.json': JSON.stringify({
      name: 'demo',
      dependencies: { 'lodash': '^4.17.0' }
    })
  }
})

// ✅ 运行 bun install
const result = await container.exec('bun', ['install'])
console.log(result.exitCode) // 0

// ✅ 验证安装结果
const lodashIndex = await container.fs.readFile(
  '/node_modules/lodash/index.js', 'utf8'
)
console.log(lodashIndex.length > 0) // true
```

---

## 5. Phase 3：浏览器端 Bun 运行时（3-6 月）

### 5.1 策略

运行 `bun run index.ts` 需要一个 **JS 执行环境**。两个可选路径：

| 路径 | 描述 | 优势 | 劣势 |
|------|------|------|------|
| **A: 宿主 JS 引擎执行** | 浏览器 JS 引擎直接执行转译后的代码 | 无需 JSC WASM 移植 | 需要模拟 Bun/Node API |
| **B: JSC 编译为 WASM** | 将 JavaScriptCore 也编译为 WASM | Bun 语义完全兼容 | 体积巨大，性能差 |

**推荐路径 A**：参考 WebContainers，使用浏览器原生 JS 引擎 + 运行时 API polyfill。

### 5.2 运行时 API 模拟层

```
┌────────────────────────────────────────────────────────┐
│  @vitamin-ai/runtime-polyfill (新包)                    │
│                                                        │
│  模拟 Bun 全局 API：                                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Bun.file()       → VFS 读取                     │  │
│  │  Bun.write()      → VFS 写入                     │  │
│  │  Bun.serve()      → Service Worker 拦截          │  │
│  │  Bun.build()      → bun-wasm 打包器 (如可用)     │  │
│  │  Bun.spawn()      → 受限的子进程模拟              │  │
│  │  Bun.env          → 虚拟环境变量                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  模拟 Node.js 核心模块：                                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  fs/path/url      → VFS 适配                     │  │
│  │  http/https       → fetch 适配                   │  │
│  │  process          → 虚拟进程对象                  │  │
│  │  child_process    → 受限                         │  │
│  │  crypto           → WebCrypto API                │  │
│  │  buffer           → 浏览器 Buffer polyfill       │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### 5.3 JS 执行流程

```
container.exec('bun', ['run', 'index.ts'])
    │
    ▼
1. 从 VFS 读取 index.ts
    │
    ▼
2. 通过 bun-wasm 转译为 JS
    │
    ▼
3. 注入运行时 polyfill（Bun 全局、Node 模块）
    │
    ▼
4. 解析 import/require 依赖
    │  ├─ 本地模块 → 从 VFS 读取 + 转译
    │  └─ node_modules → 从 VFS 读取
    │
    ▼
5. 构建模块图，按序执行
    │
    ▼
6. 在 Worker 的 JS 上下文中通过 new Function() 或 eval 执行
    │
    ▼
7. 捕获 stdout/stderr，通过 postMessage 返回
```

### 5.4 JS 上下文桥接（对应设计文档 §3.3）

```typescript
export class JSContextBridge {
  private handleTable = new Map<number, unknown>()
  private nextHandle = 1

  // WASM 调用 → 宿主 JS 执行
  jsContextEval(codePtr: number, codeLen: number): number {
    const code = this.readString(codePtr, codeLen)
    try {
      const result = new Function(`return (${code})`)()
      return this.toHandle(result)
    } catch (e) {
      return this.toHandle(e)
    }
  }

  jsContextCall(fnHandle: number, argsHandle: number): number {
    const fn = this.fromHandle(fnHandle) as Function
    const args = this.fromHandle(argsHandle) as unknown[]
    const result = Reflect.apply(fn, undefined, args)
    return this.toHandle(result)
  }

  private toHandle(value: unknown): number {
    const handle = this.nextHandle++
    this.handleTable.set(handle, value)
    return handle
  }

  private fromHandle(handle: number): unknown {
    return this.handleTable.get(handle)
  }
}
```

---

## 6. 与 WebContainers 对比

| 维度 | WebContainers | Vitamin-Bun (本方案) |
|------|--------------|---------------------|
| **目标运行时** | Node.js | Bun |
| **JS 引擎策略** | 浏览器原生 JS 引擎 | 浏览器原生 JS 引擎 ✅ |
| **核心运行时** | 自研 WASM OS（闭源） | Bun WASM (开源基础) + 宿主 polyfill |
| **包管理器** | 纯 JS 实现的 turbo npm | 纯 TS 实现的 bun install 兼容层 |
| **文件系统** | 内存 VFS（闭源） | 内存 VFS（本项目，已有） ✅ |
| **网络** | Service Worker 拦截 | Service Worker 拦截 ✅ |
| **线程模型** | SAB + Atomics | SAB + Atomics ✅ |
| **商业模式** | SaaS API 授权 | 开源 |
| **成熟度** | 生产可用（数百万用户） | 早期阶段 |

**WebContainers 的核心启示**：
1. **不要把所有东西编译进 WASM** — Node.js 也不是整个编译为 WASM 的，而是用 WASM + 宿主 JS 混合模式
2. **包管理器用纯 JS 重写** — 比移植 npm CLI 到 WASM 更实际
3. **Service Worker 是关键** — 实现 localhost 开发服务器的唯一可行方案
4. **跨域隔离是前提** — COOP/COEP 头是 SAB 的硬性要求

---

## 7. 当前项目需要立即修复的问题

在实施上述任何 Phase 之前，以下基础设施问题需要先解决：

### 7.1 pnpm-workspace.yaml 为空

```yaml
# 当前：空文件
# 修复为：
packages:
  - 'packages/*'
```

### 7.2 缺少 wasm-host 包

这是架构中最关键的包，需要立即创建。

### 7.3 VFS 后端集成断开

`StorageBackend` 接口已定义但 VFS 核心未使用。构造函数接受 mounts 但完全忽略。

### 7.4 Worker 脚本是占位符

当前 Worker 只能回复 echo，需要替换为真正的 WASM 加载逻辑。

### 7.5 SDK 未连接 network-proxy

声明了依赖但从未使用。

---

## 8. 优先级排序与时间线

```
Week 1-2:  基础设施修复
           ├── 修复 pnpm-workspace.yaml
           ├── 创建 wasm-host 包骨架
           ├── 连接 VFS StorageBackend
           └── 补齐测试

Week 3-4:  Phase 1 — 转译能力
           ├── 集成 bun-wasm 产物
           ├── 实现 WASI shim 连接到 VFS
           ├── 替换 Worker 占位符
           └── SDK transpile/scan API

Week 5-8:  Phase 2 — 包管理
           ├── 创建 package-manager 包
           ├── Registry client + tarball 解压
           ├── 依赖解析器
           └── bun install 命令实现

Week 9-12: Phase 2 测试 + 打磨
           ├── lockfile 生成
           ├── workspace protocol 支持
           ├── 缓存策略 (IndexedDB)
           └── 端到端测试

Month 4-6: Phase 3 — 运行时
           ├── 运行时 polyfill 层
           ├── 模块加载器
           ├── JS 上下文桥接
           └── bun run / bun test
```

---

## 9. 技术风险与缓解

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| bun-wasm 产物不稳定/停止维护 | 中 | 高 | 维护自己的 Bun WASM 构建管线，跟踪 Bun 版本 |
| npm registry CORS 限制 | 低 | 高 | 使用 CORS proxy 或通过 Service Worker 中转 |
| SAB 跨域隔离部署复杂 | 中 | 中 | 实现无 SAB 降级模式（纯异步） |
| Bun API 快速迭代导致 polyfill 落后 | 高 | 中 | 先覆盖最常用 API，维护兼容性矩阵 |
| WASM 二进制体积过大 | 中 | 中 | 懒加载子系统、CDN 缓存、增量加载 |
| 浏览器内存限制 | 低 | 高 | 实现 VFS 的 LRU 淘汰、按需加载模块 |

---

## 10. 总结

**这个方案可以落地的原因**：

1. **不是从零开始** — Bun 已经有 WASM 构建目标和 `packages/bun-wasm`
2. **增量交付** — 每个 Phase 都有独立价值，可以单独发布
3. **借鉴已验证方案** — WebContainers 证明了浏览器运行时的可行性
4. **利用已有代码** — 本项目的 VFS、SAB 桥接、网络代理都已有框架

**这个方案的诚实限制**：

1. **不能 100% 兼容 Bun** — 浏览器环境与原生环境差异太大
2. **性能不及本地 Bun** — WASM + VFS + 网络代理都有额外开销
3. **二进制包不能运行** — 只能运行 JS/TS 代码，不能运行 native 模块
4. **网络受浏览器限制** — TCP/UDP 不可用，只有 HTTP(S) + WebSocket

**但这些限制正是 WebContainers 也面临的**，而他们成功构建了数百万用户使用的产品。关键是在限制内找到最大价值的交集。
