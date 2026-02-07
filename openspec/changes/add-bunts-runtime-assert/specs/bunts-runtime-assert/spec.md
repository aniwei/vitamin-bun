## ADDED Requirements

### Requirement: assert 核心模块
系统 SHALL 提供 `assert` 核心模块。

#### Scenario: ok
- **WHEN** 执行 `assert.ok(true)`
- **THEN** 不抛出错误

#### Scenario: strictEqual
- **WHEN** 执行 `assert.strictEqual(1, 1)`
- **THEN** 不抛出错误

#### Scenario: notStrictEqual
- **WHEN** 执行 `assert.notStrictEqual(1, 2)`
- **THEN** 不抛出错误

#### Scenario: throws
- **GIVEN** 一个会抛错的函数
- **WHEN** 执行 `assert.throws(fn)`
- **THEN** 不抛出错误

#### Scenario: rejects
- **GIVEN** 一个会 reject 的 Promise
- **WHEN** 执行 `assert.rejects(promise)`
- **THEN** 不抛出错误

### Requirement: node:assert
系统 SHALL 支持 `node:assert` 前缀模块。

#### Scenario: node:assert
- **WHEN** `require('node:assert')`
- **THEN** 返回 assert 模块实现
