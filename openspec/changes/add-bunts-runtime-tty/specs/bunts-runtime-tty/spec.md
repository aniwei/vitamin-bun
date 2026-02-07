## ADDED Requirements

### Requirement: tty 核心模块
系统 SHALL 提供 `tty` 核心模块（最小 stub）。

#### Scenario: isatty
- **WHEN** 调用 `tty.isatty(1)`
- **THEN** 返回 false

### Requirement: node:tty
系统 SHALL 支持 `node:tty` 前缀模块。

#### Scenario: node:tty
- **WHEN** `require('node:tty')`
- **THEN** 返回 tty 模块实现
