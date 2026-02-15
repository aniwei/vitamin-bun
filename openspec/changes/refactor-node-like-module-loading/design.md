## Context
当前模块系统在浏览器环境下运行，需要兼顾 Node.js 语义与 Service Worker 网络代理能力。现有实现存在职责耦合：模块解析、模块源码获取与执行路径混在 `ModuleLoader`，并且执行阶段依赖动态 blob `import()`，不利于控制缓存、错误处理与一致性。

## Goals / Non-Goals
- Goals:
  - 对齐 Node.js 模块加载关键行为（解析优先级、缓存语义、循环依赖可见性）
  - 将“源码获取”能力抽象成可替换的内部加载器
  - 支持缓存优先 + Service Worker 回源
- Non-Goals:
  - 不在本次改动中完整实现 Node 原生 C++ addon (`.node`) 支持
  - 不实现远程 npm registry 的运行时在线解析

## Decisions
- Decision: 引入三层模型
  1) `ModuleResolver`: 纯路径/包解析（无副作用）
  2) `InternalModuleLoader`: 源码获取（cache -> SW fetch -> cache）
  3) `ModuleExecutor`: 转译/执行/导出互操作

- Decision: 模块记录采用状态机
  - `created` -> `resolving` -> `loading` -> `evaluating` -> `evaluated`
  - 任何阶段失败进入 `errored`
  - 在 `evaluating` 阶段将半初始化导出暴露给依赖方，处理循环依赖

- Decision: `InternalModuleLoader` 接口
  - `load(id, parent?) => Promise<SourceRecord>`
  - 内部流程：
    - 先查 `sourceCache`（Key 为 resolved id）
    - 未命中则发起 `module:request` 到 Service Worker
    - 成功后写回缓存并返回

- Alternatives considered:
  - 直接在 `ModuleLoader` 里继续嵌入 SW 通讯：实现快但继续耦合，否决
  - 全量 HTTP fetch 不经 SW：失去统一代理与权限控制，否决

## Risks / Trade-offs
- 风险：Service Worker 未激活时模块回源失败
  - Mitigation：降级到本地 VFS，且在错误中附带诊断信息
- 风险：缓存污染导致热更新不生效
  - Mitigation：增加 `invalidate(id)` 与按前缀批量失效

## Migration Plan
1. 新增 `InternalModuleLoader` 与测试，不接入主链路
2. `ModuleLoader` 改为依赖注入 `internalLoader`
3. 删除旧的 blob 动态导入路径
4. 回归现有示例和测试

## Open Questions
- `module:request` 协议是否需要支持 ETag/版本号
- 是否在 `sourceCache` 中区分 transformed code 与 raw source
