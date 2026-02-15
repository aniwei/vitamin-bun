# Change: Refactor module loading to a Node.js-like pipeline

## Why
当前 `ModuleLoader` 混合了解析、执行、网络导入与缓存职责，行为与 Node.js 模块系统有明显偏差，导致可维护性和可预测性不足。

## What Changes
- 重构模块加载链路为 Node.js 风格分层：`resolve -> load -> transform -> instantiate -> evaluate -> cache`。
- 新增 `InternalModuleLoader`，优先命中内存缓存，未命中时通过 Service Worker 拉取模块源码。
- 引入模块记录状态机（`resolving/loading/evaluating/evaluated/errored`）以支持循环依赖与错误回溯。
- 统一 `node:`、内建模块、包导出条件（`imports`/`exports`）和文件扩展名策略。
- **BREAKING**: 移除在 `ModuleLoader.load()` 中直接构造 blob 并 `import()` 的执行路径。

## Impact
- Affected specs: module-loading
- Affected code:
  - packages/vitamin-runtime/src/vitamin-module/module-loader.ts
  - packages/vitamin-runtime/src/vitamin-module/internal-module-loader.ts (new)
  - packages/vitamin-runtime/src/evaluator.ts
  - packages/browser-runtime/src/boot.ts
  - packages/network-proxy/src/service-worker.ts
  - packages/shared/src/types.ts
