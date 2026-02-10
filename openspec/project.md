# Project Context

## Purpose
Vitamin-Bun 将 Bun JavaScript 运行时编译为 WebAssembly，并在浏览器中运行，让 `bun install` / `bun build` / `bun test` 等能力可在浏览器内完成。核心目标是：使用浏览器原生 JS 引擎与宿主提供的文件系统、网络与 JS 上下文桥接，避免在 WASM 内嵌完整 JS 引擎，降低体积并提升可用性。

## Tech Stack
- TypeScript (ES2022, `strict: true`)
- WebAssembly (Bun 编译为 `wasm32-wasi`)
- Browser Web APIs (Web Worker, SharedArrayBuffer, Service Worker, fetch, WebSocket)
- WASI Preview 1 接口与自定义宿主导入
- Monorepo: npm workspaces + Turborepo
- Testing: Vitest
- Formatting: Prettier
- Runtime: Node.js >= 18（构建/工具链）

## Project Conventions

### Code Style
- TypeScript 严格模式，模块目标为 ESNext，模块解析采用 `bundler`。
- 输出目录为 `dist/`，源码在各 package 的 `src/` 下。
- 命名与目录结构遵循包边界：`packages/<capability>/src`。
- 使用 Prettier 统一格式（以根 `package.json`/工具链为准）。

### Architecture Patterns
- 分层包结构：
	- `@vitamin-ai/wasm-host`：WASI 与宿主导入实现（FS/网络/JS 上下文）
	- `@vitamin-ai/virtual-fs`：内存 VFS 与可插拔后端（Memory/IndexedDB/OPFS）
	- `@vitamin-ai/network-proxy`：HTTP/WS 代理与 Service Worker
	- `@vitamin-ai/browser-runtime`：Worker 生命周期、SAB 桥接
	- `@vitamin-ai/sdk`：对外 API（`createBunContainer()` 等）
- 主线程/Worker 分离：WASM 运行在专用 Worker 中。
- 同步 WASI 调用通过 SharedArrayBuffer + Atomics 桥接异步浏览器 API。
- 网络与文件系统能力通过宿主提供，并以 WASI 接口对 WASM 暴露。

### Testing Strategy
- 使用 Vitest。
- 单元测试位于 `__tests__` 目录（如 `packages/virtual-fs/src/__tests__`）。
- 通过 Turborepo 统一运行：`turbo run test`。

### Git Workflow
- 当前仓库未定义专门的分支/提交规范。
- 建议保持主分支可构建，功能使用短分支或 PR 方式合并。

## Domain Context
- 目标是在浏览器内运行 Bun，而非在服务器端。
- WASM 中的 JS 执行通过宿主桥接（handle 表）委托给浏览器 JS 引擎。
- VFS 为 POSIX 风格，供 WASI `fd_*` 导入使用。
- 网络通过自定义 socket 导入映射到浏览器 `fetch()`/`WebSocket`。
- Service Worker 用于拦截并代理特定请求（如本地开发服务器）。

## Important Constraints
- 需要满足浏览器安全限制：SAB 需 `COOP/COEP`，否则降级为异步模式。
- WASI Preview 1 语义与浏览器能力存在差异，需要宿主适配。
- WASM 二进制体积受限（目标 < 20MB gzip）。
- 浏览器环境无原生 TLS/底层 socket，需要宿主代理网络。

## External Dependencies
- 浏览器 Web 平台 API：Web Worker、SharedArrayBuffer、Atomics、Service Worker、fetch、WebSocket。
- Bun WASM 构建产物（外部构建流程，`@vitamin-ai/bun-wasm`）。
- 存储后端：IndexedDB、OPFS（可选）。
