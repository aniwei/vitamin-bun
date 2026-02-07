## 1. Scaffolding
- [x] 创建新包 `@vitamin-ai/bunts-runtime`
- [x] 添加基础目录结构（transpiler / loader / polyfill / evaluator）

## 2. Core Runtime
- [x] 实现最小 Transpiler 接口（TS → JS）
- [x] 实现 Module Loader（ESM + CJS）
- [x] 实现 Runtime Polyfill（Bun + Node 子集）
- [x] 实现 Evaluator（执行模块图）

## 3. SDK Integration
- [x] SDK `exec('bun', ['run', ...])` 走 BunTS runtime
- [x] stdout/stderr 通过 Worker 消息回传

## 4. Tests
- [x] 单元测试覆盖：transpiler、loader、polyfill
- [x] 最小 E2E：运行简单 TS 文件
