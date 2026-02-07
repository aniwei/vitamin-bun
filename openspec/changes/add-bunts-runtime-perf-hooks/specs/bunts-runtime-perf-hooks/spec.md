## ADDED Requirements

### Requirement: perf_hooks 核心模块
系统 SHALL 提供 `perf_hooks` 核心模块。

#### Scenario: now
- **WHEN** 调用 `performance.now()`
- **THEN** 返回 number

#### Scenario: timeOrigin
- **WHEN** 读取 `performance.timeOrigin`
- **THEN** 返回 number

### Requirement: node:perf_hooks
系统 SHALL 支持 `node:perf_hooks` 前缀模块。

#### Scenario: node:perf_hooks
- **WHEN** `require('node:perf_hooks')`
- **THEN** 返回 perf_hooks 模块实现
