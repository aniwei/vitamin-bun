# Change: BunTS ESM 执行语义与 CJS 互操作

## Why
当前 BunTS 仅通过 `Function` + CommonJS 风格执行模块。真实项目需要 ESM 语义（`import`/`export`）与 CJS 互操作，确保 `bun run` 可运行现代前端/库代码。

## What Changes
- 引入 ESM 执行路径：将 ESM 转译为可执行模块图，并保持 ESM 的导出语义。
- 增加 CJS ↔ ESM 互操作规则（默认导出、命名导出映射）。
- 完善动态 import 处理与缓存策略。

## Impact
- 影响包：bunts-runtime、sdk
- 影响模块加载与执行逻辑
- 新增 ESM 语义测试
