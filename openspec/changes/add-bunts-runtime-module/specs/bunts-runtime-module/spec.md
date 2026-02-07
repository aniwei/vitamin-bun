## ADDED Requirements

### Requirement: module 核心模块
系统 SHALL 提供 `module` 核心模块。

#### Scenario: createRequire
- **WHEN** 调用 `createRequire('/index.js')`
- **THEN** 返回函数

### Requirement: node:module
系统 SHALL 支持 `node:module` 前缀模块。

#### Scenario: node:module
- **WHEN** `require('node:module')`
- **THEN** 返回 module 模块实现
