## ADDED Requirements

### Requirement: stream/promises
系统 SHALL 提供 `stream/promises` 核心模块并包含 `pipeline`。

#### Scenario: pipeline
- **WHEN** 使用 `stream/promises`.pipeline 连接流
- **THEN** 返回 resolve 的 Promise

### Requirement: node:stream/promises
系统 SHALL 支持 `node:stream/promises` 前缀模块。

#### Scenario: node:stream/promises
- **WHEN** `require('node:stream/promises')`
- **THEN** 返回 stream/promises 模块实现
