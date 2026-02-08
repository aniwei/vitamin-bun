# Change: Add internal plugins package with Sass WASM interceptor

## Why
当前缺少内置插件层来统一拦截模块与资源类型，导致像 Sass 这类样式模块无法在浏览器运行时被自动处理。

## What Changes
- 新增 packages/internal-plugins 作为内置插件集合。
- 提供 Sass 模块拦截插件：拦截 .sass/.scss 请求并通过 WASM Sass 编译为 CSS。
- 记录浏览器限制与 WASM 资源加载方式。

## Impact
- Affected specs: internal-plugins
- Affected code: packages/internal-plugins/*, packages/bunts-runtime (plugin registration), docs/BUN_API_CATALOG.md
