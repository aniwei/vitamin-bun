# Change: 添加 BunTS 运行时内核能力（Phase 1）

## Why
技术路线已切换为 BunTS（纯 TypeScript 实现），需要先落地运行时内核：转译、模块加载与基础运行时 API，以支持 `bun run` 的最小可行功能。

## What Changes
- 新增 BunTS 运行时内核能力（Transpiler / Module Loader / Runtime Polyfill）。
- SDK 增加最小可运行路径（读取 VFS → 转译 → 执行 → stdout/stderr）。
- 引入新的运行时包结构（如 `@vitamin-ai/bunts-runtime`）。

## Impact
- 影响包：sdk / browser-runtime / virtual-fs / network-proxy（集成路径）
- 新增包：bunts-runtime（运行时核心）
- 影响文档：specs 与阶段验收标准
