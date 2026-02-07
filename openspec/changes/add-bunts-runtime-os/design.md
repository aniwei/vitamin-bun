# Design: BunTS os 模块

## 范围
实现 Node.js `os` 的基础子集，满足常见运行期检测需求。

## API
- `platform()`：返回 `"browser"`
- `arch()`：返回 `"wasm"`
- `cpus()`：返回空数组
- `homedir()`：返回 `"/"`
- `tmpdir()`：返回 `"/tmp"`
- `EOL`：`"\n"`

## 模块暴露
- `os` 与 `node:os` 指向相同实现。
