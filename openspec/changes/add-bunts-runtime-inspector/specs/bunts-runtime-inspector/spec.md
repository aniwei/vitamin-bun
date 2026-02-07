## ADDED Requirements

### Requirement: inspector 核心模块
系统 SHALL 提供 `inspector` 核心模块（最小 stub）。

#### Scenario: url
- **WHEN** 调用 `inspector.url()`
- **THEN** 返回 null

### Requirement: node:inspector
系统 SHALL 支持 `node:inspector` 前缀模块。

#### Scenario: node:inspector
- **WHEN** `require('node:inspector')`
- **THEN** 返回 inspector 模块实现
