## ADDED Requirements

### Requirement: constants 核心模块
系统 SHALL 提供 `constants` 核心模块（最小实现）。

#### Scenario: constants
- **WHEN** 读取 `constants`
- **THEN** 返回对象

### Requirement: node:constants
系统 SHALL 支持 `node:constants` 前缀模块。

#### Scenario: node:constants
- **WHEN** `require('node:constants')`
- **THEN** 返回 constants 模块实现
