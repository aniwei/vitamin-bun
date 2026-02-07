# Design: BunTS module 模块

## 范围
提供最小 `createRequire`，复用当前 ModuleLoader。

## API
- `createRequire(filename)`：返回 `require` 函数

## 模块暴露
- `module` 与 `node:module` 指向相同实现。
