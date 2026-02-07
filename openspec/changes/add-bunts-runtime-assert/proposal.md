# Change: 添加 BunTS assert 核心模块

## Why
当前 BunTS 缺少断言工具，阻碍运行常见 Node 风格的测试与库逻辑。

## What Changes
- 新增 `assert` 核心模块与 `node:assert` 别名
- 提供基础断言 API（`ok`/`strictEqual`/`notStrictEqual`/`throws`/`rejects`/`fail`）

## Impact
- Affected specs: `bunts-runtime-assert`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
