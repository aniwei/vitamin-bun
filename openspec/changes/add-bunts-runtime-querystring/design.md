# Design: BunTS querystring 模块

## 范围
实现 Node.js `querystring` 的最小子集。

## API
- `parse(str)`：返回对象
- `stringify(obj)`：返回查询字符串

## 模块暴露
- `querystring` 与 `node:querystring` 指向相同实现。
