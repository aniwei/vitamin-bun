## ADDED Requirements

### Requirement: EventEmitter
系统 SHALL 提供 EventEmitter。

#### Scenario: on/emit
- **GIVEN** 一个 EventEmitter
- **WHEN** 注册 `on('data', fn)` 并调用 `emit('data')`
- **THEN** `fn` SHALL 被调用

#### Scenario: once
- **GIVEN** 一个 EventEmitter
- **WHEN** 注册 `once('data', fn)` 并多次 `emit('data')`
- **THEN** `fn` SHALL 仅被调用一次

### Requirement: node:events
系统 SHALL 支持 `node:events` 前缀模块。

#### Scenario: node:events
- **WHEN** `require('node:events')`
- **THEN** 返回 events 模块实现
