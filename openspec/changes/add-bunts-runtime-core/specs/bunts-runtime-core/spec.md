## ADDED Requirements

### Requirement: BunTS 运行时核心
系统 SHALL 提供 BunTS 运行时核心，用于在浏览器内执行 `bun run <entry>`。

#### Scenario: 运行单文件 TypeScript
- **GIVEN** VFS 中存在 `/index.ts`
- **WHEN** 用户调用 `container.exec('bun', ['run', '/index.ts'])`
- **THEN** 运行时 SHALL 转译并执行该文件
- **AND** stdout/stderr SHALL 回传到主线程

### Requirement: Transpiler 接口
系统 SHALL 提供可复用的 TS/JSX 转译接口。

#### Scenario: 转译 TS 文件
- **GIVEN** 输入为 TypeScript 源码
- **WHEN** 调用 `transpiler.compile()`
- **THEN** 返回可执行 JavaScript

### Requirement: Module Loader
系统 SHALL 支持 ESM 与 CJS 模块加载，并能从 VFS 解析模块。

#### Scenario: ESM import
- **GIVEN** `/index.ts` 使用 `import './dep'`
- **WHEN** 执行 `/index.ts`
- **THEN** Loader SHALL 解析 `/dep.ts` 并执行

#### Scenario: CJS require
- **GIVEN** `/index.cjs` 使用 `require('./dep')`
- **WHEN** 执行 `/index.cjs`
- **THEN** Loader SHALL 解析 `/dep.cjs` 并执行

### Requirement: Runtime Polyfill
系统 SHALL 提供 Bun 与 Node 核心 API 的子集 polyfill。

#### Scenario: Bun.file
- **GIVEN** VFS 中存在 `/data.txt`
- **WHEN** 运行时执行 `Bun.file('/data.txt').text()`
- **THEN** 返回文件内容

### Requirement: SDK 集成
SDK SHALL 通过 BunTS runtime 执行 `bun run`。

#### Scenario: SDK exec
- **GIVEN** 已创建容器
- **WHEN** 调用 `container.exec('bun', ['run', '/index.ts'])`
- **THEN** 执行路径 SHALL 进入 BunTS runtime
