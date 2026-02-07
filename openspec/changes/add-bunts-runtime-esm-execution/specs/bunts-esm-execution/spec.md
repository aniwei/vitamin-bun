## ADDED Requirements

### Requirement: ESM 执行语义
系统 SHALL 支持 ESM 的 import/export 执行语义。

#### Scenario: Named export
- **GIVEN** `/a.ts` 导出 `export const x = 1`
- **WHEN** `/b.ts` 执行 `import { x } from './a'`
- **THEN** `x` SHALL 等于 `1`

#### Scenario: Default export
- **GIVEN** `/a.ts` 导出 `export default function(){}`
- **WHEN** `/b.ts` 执行 `import foo from './a'`
- **THEN** `foo` SHALL 为该函数

### Requirement: CJS ↔ ESM 互操作
系统 SHALL 支持 CJS 与 ESM 互操作。

#### Scenario: CJS require ESM
- **GIVEN** `/a.ts` 为 ESM 模块
- **WHEN** CJS 模块 `require('./a')`
- **THEN** 返回对象包含 `default` 与命名导出

#### Scenario: ESM import CJS
- **GIVEN** `/a.cjs` 使用 `module.exports = { x: 1 }`
- **WHEN** ESM 模块 `import a from './a.cjs'`
- **THEN** `a.x` SHALL 等于 `1`

### Requirement: 动态 import
系统 SHALL 支持 `import()`。

#### Scenario: dynamic import
- **GIVEN** `/a.ts` 存在
- **WHEN** 执行 `await import('./a')`
- **THEN** 返回模块命名空间对象
