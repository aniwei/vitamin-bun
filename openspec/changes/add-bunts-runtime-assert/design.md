# Design: BunTS assert 模块

## 范围
实现 Node.js `assert` 的基础子集，满足常见测试与运行期断言需求。

## API
- `ok(value, message?)`
- `strictEqual(actual, expected, message?)`
- `notStrictEqual(actual, expected, message?)`
- `throws(fn, error?, message?)`
- `rejects(promise, error?, message?)`
- `fail(message?)`

## 错误语义
- 断言失败时抛出 `AssertionError`，包含 `message` 与 `name`。
- `throws`/`rejects` 支持传入 `RegExp` 或断言函数进行匹配。

## 模块暴露
- `assert` 与 `node:assert` 指向相同实现。
