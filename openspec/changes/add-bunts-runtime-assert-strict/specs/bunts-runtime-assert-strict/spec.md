## ADDED Requirements

### Requirement: assert/strict 核心模块
系统 SHALL 提供 `assert/strict` 核心模块。

#### Scenario: assert/strict
- **WHEN** `require('assert/strict')`
- **THEN** 返回 assert 模块实现

### Requirement: node:assert/strict
系统 SHALL 支持 `node:assert/strict` 前缀模块。

#### Scenario: node:assert/strict
- **WHEN** `require('node:assert/strict')`
- **THEN** 返回 assert 模块实现
