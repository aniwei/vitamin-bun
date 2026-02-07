# Design: BunTS（纯 TypeScript Bun 运行时）路线

## 概述
该方案将 Bun 的核心能力（运行时 API、包管理器、构建器、测试、HTTP/WebSocket 等）以 **TypeScript + 浏览器原生 JS 引擎** 的方式实现。目标是让浏览器内实现与 Bun CLI 等价的功能集，而非通过 WASM 运行 Bun 本体。

## 关键原则
1. **纯 TS 实现**：不依赖 WASM/JSC，仅使用浏览器原生 JS 引擎与 Web APIs。
2. **可验证阶段交付**：每阶段都有可运行 Demo 与可测试的 SDK API。
3. **可替换底层能力**：FS/网络/进程模型保持可插拔，方便降级或替换。

## 主要子系统
- **Module Loader**：ESM/CJS 解析与执行（基于浏览器 ESM + TS transpile）
- **Transpiler/Compiler**：TS/JSX → JS（TypeScript 编译器或等价纯 TS 实现）
- **Package Manager**：解析 registry、lockfile、node_modules 写入
- **Bundler**：依赖图、tree-shaking、产物输出
- **Test Runner**：测试发现、并发执行、报告
- **Runtime APIs**：Bun/Node 兼容 API（fs, path, process, net, http, timers）

## 风险与约束
- 性能与体积：纯 TS 实现可能性能较慢
- Node 兼容度：Bun API 与 Node API 的完整复刻成本极高
- 浏览器安全限制：网络、文件系统与多线程仍受限
