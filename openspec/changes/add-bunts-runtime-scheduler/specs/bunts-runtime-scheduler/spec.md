## ADDED Requirements

### Requirement: scheduler 核心模块
系统 SHALL 提供 `scheduler` 核心模块（最小实现）。

#### Scenario: now
- **WHEN** 调用 `scheduler.now()`
- **THEN** 返回 number

#### Scenario: yield
- **WHEN** 调用 `scheduler.yield()`
- **THEN** 返回 Promise

### Requirement: node:scheduler
系统 SHALL 支持 `node:scheduler` 前缀模块。

#### Scenario: node:scheduler
- **WHEN** `require('node:scheduler')`
- **THEN** 返回 scheduler 模块实现
