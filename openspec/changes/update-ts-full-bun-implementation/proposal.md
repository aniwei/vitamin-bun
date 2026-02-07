# Change: 以 TypeScript 实现 Bun 全量能力的技术方案

## Why
当前 IMPLEMENTATION_PLAN.md 以 WASM 迁移 Bun 为主线，但用户要求将技术方案调整为 **用 TypeScript 在浏览器端实现 Bun 全部能力**。该方向属于架构级变更，需要明确目标、范围与阶段性路径。

## What Changes
- 将技术方案从 “Bun→WASM” 迁移路线改为 “BunTS（纯 TS 运行时）” 路线。
- 重新定义分阶段目标：核心运行时、包管理器、打包器、测试框架与网络/FS 适配。
- 明确不再依赖 JSC/WASM 的运行时执行路径，改为浏览器原生 JS 引擎 + TS 实现。

## Impact
- 影响文档：docs/IMPLEMENTATION_PLAN.md
- 影响架构认知：browser-runtime / sdk / wasm-host 的定位与优先级
- 影响里程碑：将 “WASM 迁移” 改为 “TS 复刻 Bun 能力”

**BREAKING**：技术路线彻底改变，后续实现计划需重新排序与评估。
