## ADDED Requirements

### Requirement: http/https 核心模块
系统 SHALL 提供 `http` 与 `https` 核心模块（最小实现）。

#### Scenario: http.get
- **WHEN** 调用 `http.get('https://example.com')`
- **THEN** 返回可用的请求对象

#### Scenario: https.get
- **WHEN** 调用 `https.get('https://example.com')`
- **THEN** 返回可用的请求对象

### Requirement: node:http
系统 SHALL 支持 `node:http` 前缀模块。

#### Scenario: node:http
- **WHEN** `require('node:http')`
- **THEN** 返回 http 模块实现

### Requirement: node:https
系统 SHALL 支持 `node:https` 前缀模块。

#### Scenario: node:https
- **WHEN** `require('node:https')`
- **THEN** 返回 https 模块实现
