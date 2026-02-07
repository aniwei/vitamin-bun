# Change: 完善 BunTS 模块系统与运行时 API（Phase 1.5）

## Why
当前 BunTS 仅支持最小执行路径，模块系统仍缺少 ESM 语义、package.json 解析与 Node/Bun 核心模块的基础兼容层。需要推进模块解析与运行时 API 扩展，保证 `bun run` 能覆盖真实项目结构。

## What Changes
- 扩展 Module Loader：支持 `package.json` 的 `main`/`module`/`exports` 解析
- 增强 ESM 解析（静态依赖扫描 + 规范化加载）
- 增加 Node/Bun 核心模块的基础 polyfill（fs/path/url/process/buffer）

## Impact
- 影响包：bunts-runtime、sdk
- 影响文档：新增模块系统能力需求规格
