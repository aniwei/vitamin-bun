# Design: BunTS ESM Execution & Interop

## Goals
- 正确执行 ESM 模块（`import`/`export`）
- 支持 CJS `require()` 与 ESM `import` 的互操作
- 保持模块缓存与循环依赖语义

## Execution Strategy
1. **ESM 转译**：将 ESM 代码转译为内部 ModuleRecord（包含 `imports`/`exports`）
2. **Module Graph**：构建依赖图并拓扑执行
3. **Interop**：
   - CJS -> ESM: `require()` 返回 `module.default ?? module`
   - ESM -> CJS: `import` 生成默认导出与命名导出映射

## Non-Goals
- 完整 Node ESM loader hooks
- import assertions / import maps
