# Design: BunTS constants 模块

## 范围
提供最小常量集合，满足依赖加载。

## API
- `constants` 对象（包含 `S_IFREG`/`S_IFDIR` 等可选字段）

## 模块暴露
- `constants` 与 `node:constants` 指向相同实现。
