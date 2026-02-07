# Design: BunTS Runtime Core

## Goals
- 在浏览器内支持 `bun run <entry>` 的最小执行路径
- 支持 TS/JSX 转译、ESM + CJS 模块加载
- 提供核心运行时 polyfill（Bun + Node 兼容子集）

## Architecture

```
SDK.exec('bun', ['run', '/index.ts'])
  -> RuntimeCore.execute(entry)
     -> Transpiler.compile(source, loader)
     -> ModuleLoader.load(entry)
     -> RuntimePolyfill.inject()
     -> Evaluator.run(moduleGraph)
```

### Core Components

1. **Transpiler**
   - 输入：TS/JSX/TSX
   - 输出：JS + source map
   - 可选实现：TypeScript compiler API 或轻量转译器

2. **Module Loader**
   - ESM: 静态分析 + 动态 import 解析
   - CJS: `require` polyfill + 包装执行
   - 解析规则：Node/Bun 风格路径解析 + VFS 支持

3. **Runtime Polyfill**
   - `Bun.file`, `Bun.write`, `Bun.env`
   - `process` / `buffer` / `path` / `fs` 核心 API
   - `console` 输出桥接到 Worker postMessage

4. **Evaluator**
   - 将模块图转换为可执行 JS
   - 通过 `Function` 执行并注入 polyfill

## Non-Goals (Phase 1)
- 完整 `bun install` / `bun build`
- 原生 TCP/UDP socket
- 高度优化的 bundler
