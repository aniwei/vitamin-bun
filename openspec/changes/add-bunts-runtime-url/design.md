# Design: BunTS url 模块扩展

## 范围
在现有 `url` 模块基础上补充 Node.js 常用路径转换函数。

## API
- `pathToFileURL(path)`：返回 `file://` URL
- `fileURLToPath(url)`：从 `file://` URL 还原路径

## 模块暴露
- `url` 与 `node:url` 指向相同实现。
