## 1. Implementation
- [ ] 1.1 抽离解析器：将 `resolve` 从执行流程中解耦，形成纯解析阶段
- [ ] 1.2 新增模块记录表与状态机，替换当前简单 `cache`
- [ ] 1.3 新增 `InternalModuleLoader`（缓存优先，Service Worker fetch 回源）
- [ ] 1.4 将 `ModuleLoader` 改为通过 `InternalModuleLoader` 获取源码
- [ ] 1.5 适配 Service Worker 消息协议（模块请求/响应）
- [ ] 1.6 增加循环依赖、`exports` 条件解析、缓存命中、回源加载测试
- [ ] 1.7 在 `RuntimeCore`/`Evaluator` 注入新加载组件并回归测试
