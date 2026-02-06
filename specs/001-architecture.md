# 001 - 系统架构设计

## 元数据

- **状态**: 草案 (Draft)
- **创建日期**: 2026-02-06
- **最后更新**: 2026-02-06
- **作者**: aniwei
- **依赖规范**: [000-overview.md](./000-overview.md)

## 概述

本文档描述 vitamin-bun 的整体系统架构设计，包括 Monorepo 结构、核心包设计、依赖关系和扩展机制。

## 架构目标

1. **模块化** - 清晰的包边界和职责划分
2. **可扩展** - 支持插件和自定义扩展
3. **类型安全** - 完整的 TypeScript 类型支持
4. **性能优先** - 最小的运行时开销
5. **易于使用** - 简洁的 API 和良好的文档

## Monorepo 结构

```
vitamin-bun/
├── packages/              # 核心包
│   ├── core/             # 核心运行时
│   ├── router/           # 路由系统
│   ├── server/           # HTTP 服务器
│   ├── config/           # 配置管理
│   ├── cli/              # CLI 工具
│   └── create/           # 项目脚手架
├── apps/                 # 应用示例
│   ├── playground/       # 开发调试
│   └── docs/            # 文档站点 (未来)
├── specs/                # OpenSpec 规范
├── docs/                 # 文档
│   └── rfcs/            # RFC 技术方案
├── .github/              # GitHub 配置
└── scripts/              # 构建脚本 (未来)
```

## 核心包设计

### @vitamin-bun/core

**职责**: 框架核心运行时和基础抽象

**主要功能**:
- Application 实例管理
- 请求/响应抽象
- 上下文管理
- 中间件系统
- 错误处理

**依赖**: 无（仅依赖 Bun runtime）

**API 示例**:
```typescript
import { Application } from '@vitamin-bun/core'

const app = new Application()
app.use(async (ctx, next) => {
  // middleware
})
```

### @vitamin-bun/router

**职责**: 路由匹配和参数解析

**主要功能**:
- 路由注册和匹配
- 路径参数提取
- 查询参数解析
- 路由分组
- 中间件绑定

**依赖**: `@vitamin-bun/core`

**API 示例**:
```typescript
import { Router } from '@vitamin-bun/router'

const router = new Router()
router.get('/users/:id', async (ctx) => {
  const { id } = ctx.params
})
```

### @vitamin-bun/server

**职责**: HTTP 服务器抽象层

**主要功能**:
- Bun.serve 封装
- WebSocket 支持
- 静态文件服务
- 请求日志
- 性能监控

**依赖**: `@vitamin-bun/core`

**API 示例**:
```typescript
import { Server } from '@vitamin-bun/server'

const server = new Server({
  port: 3000,
  development: true
})
```

### @vitamin-bun/config

**职责**: 配置加载和管理

**主要功能**:
- 配置文件加载（.js, .ts, .json）
- 环境变量支持
- 配置验证
- 配置合并和覆盖
- 类型安全的配置访问

**依赖**: 无

**API 示例**:
```typescript
import { defineConfig } from '@vitamin-bun/config'

export default defineConfig({
  server: { port: 3000 },
  dev: { hot: true }
})
```

### @vitamin-bun/cli

**职责**: 命令行工具

**主要功能**:
- 项目初始化
- 开发服务器
- 构建命令
- 类型检查
- 代码生成

**依赖**: `@vitamin-bun/core`, `@vitamin-bun/config`, `@vitamin-bun/server`

**命令示例**:
```bash
vitamin dev           # 启动开发服务器
vitamin build         # 构建生产版本
vitamin typecheck     # 类型检查
```

### @vitamin-bun/create

**职责**: 项目脚手架

**主要功能**:
- 项目模板管理
- 交互式创建流程
- 依赖安装
- Git 初始化

**依赖**: 无

**使用示例**:
```bash
bun create vitamin my-app
```

## 依赖关系图

```
┌─────────────────┐
│ @vitamin/create │ (独立)
└─────────────────┘

┌─────────────────┐
│ @vitamin/config │ (独立)
└─────────────────┘

┌─────────────────┐
│ @vitamin/core   │ (基础)
└────────┬────────┘
         │
    ┌────┴────┬────────────┐
    │         │            │
┌───▼────┐ ┌──▼──────┐ ┌──▼──────┐
│ router │ │ server  │ │   ...   │
└────────┘ └─────────┘ └─────────┘
              │
         ┌────┴────┐
         │         │
      ┌──▼───┐ ┌──▼────┐
      │ cli  │ │  ...  │
      └──────┘ └───────┘
```

## 中间件系统

### 中间件架构

vitamin-bun 采用洋葱模型的中间件系统：

```typescript
type Middleware<T = any> = (
  ctx: Context<T>,
  next: Next
) => Promise<void> | void

type Next = () => Promise<void>
```

### 中间件执行流程

```
请求
  │
  ▼
┌─────────────┐
│ Middleware 1│ ──┐
└─────────────┘   │
       │          │
       ▼          │
┌─────────────┐   │
│ Middleware 2│ ──┼─┐
└─────────────┘   │ │
       │          │ │
       ▼          │ │
┌─────────────┐   │ │
│   Handler   │   │ │
└─────────────┘   │ │
       │          │ │
       ▼          │ │
┌─────────────┐   │ │
│ Middleware 2│ ◀─┘ │
└─────────────┘     │
       │            │
       ▼            │
┌─────────────┐     │
│ Middleware 1│ ◀───┘
└─────────────┘
  │
  ▼
响应
```

## 插件系统

### 插件接口

```typescript
interface Plugin {
  name: string
  version?: string
  install(app: Application, options?: any): void
}
```

### 插件示例

```typescript
const loggingPlugin: Plugin = {
  name: 'logging',
  install(app, options) {
    app.use(async (ctx, next) => {
      const start = Date.now()
      await next()
      console.log(`${ctx.method} ${ctx.path} - ${Date.now() - start}ms`)
    })
  }
}

app.use(loggingPlugin)
```

## 上下文设计

### Context 接口

```typescript
interface Context<T = any> {
  // Request
  request: Request
  method: string
  path: string
  query: Record<string, string>
  params: Record<string, string>
  headers: Headers
  body: any
  
  // Response
  status: number
  set(name: string, value: string): void
  json(data: any): void
  text(data: string): void
  html(data: string): void
  
  // State
  state: T
}
```

## 错误处理

### 错误处理流程

1. 应用级错误处理器
2. 路由级错误处理器
3. 默认错误处理器

### 错误处理示例

```typescript
app.onError((err, ctx) => {
  console.error(err)
  ctx.status = err.status || 500
  ctx.json({
    error: err.message
  })
})
```

## 性能优化策略

### 1. 路由优化

- 使用高效的路由匹配算法（Radix Tree）
- 路由预编译
- 参数缓存

### 2. 中间件优化

- 惰性执行
- 中间件组合优化
- 避免不必要的异步操作

### 3. 内存优化

- 对象池化
- 避免闭包陷阱
- 及时释放资源

### 4. 监控和分析

- 内置性能监控
- 请求追踪
- 内存分析工具

## 类型系统设计

### 类型安全的路由

```typescript
const router = new Router()
  .get('/users/:id', async (ctx) => {
    // ctx.params.id 自动推导为 string
    const { id } = ctx.params
  })
  .post('/users', async (ctx) => {
    // ctx.body 支持泛型
    const user = ctx.body as User
  })
```

### 类型安全的配置

```typescript
const config = defineConfig({
  server: {
    port: 3000, // type: number
    host: 'localhost' // type: string
  }
})

// config.server.port 自动推导为 number
```

## 测试策略

### 单元测试

- 每个包独立的测试套件
- 使用 Bun Test
- 测试覆盖率 > 80%

### 集成测试

- 跨包集成测试
- 真实场景模拟
- 性能基准测试

### E2E 测试

- 完整应用测试
- 使用示例应用验证

## 文档策略

### API 文档

- 从 TypeScript 类型生成
- 包含使用示例
- 版本化文档

### 指南文档

- 快速开始
- 核心概念
- 最佳实践
- 迁移指南

### 示例项目

- 基础示例
- 真实场景示例
- 性能优化示例

## 发布策略

### 版本管理

- 使用语义化版本
- 独立版本 vs 固定版本（待定）
- Changeset 管理变更日志

### 发布流程

1. 代码审查
2. 测试通过
3. 版本更新
4. 生成 CHANGELOG
5. 发布到 npm
6. 创建 GitHub Release

## 兼容性

### Bun 版本

- 最低支持版本: Bun 1.0.0
- 推荐版本: 最新稳定版

### Node.js 兼容性

- 尽可能保持兼容
- 不保证完全兼容
- 提供兼容性指南

## 扩展性考虑

### 预留扩展点

1. 自定义中间件
2. 插件系统
3. 自定义错误处理
4. 自定义配置加载器
5. 自定义路由策略

### 社区包生态

- 鼓励社区开发插件
- 提供插件开发指南
- 维护插件列表

## 安全性

### 安全最佳实践

1. 输入验证
2. XSS 防护
3. CSRF 防护
4. 安全的默认配置
5. 依赖安全审计

## 未来考虑

1. 服务端渲染（SSR）支持
2. 静态站点生成（SSG）支持
3. 边缘运行时支持
4. 微服务架构支持
5. GraphQL 集成
6. gRPC 支持

## 参考资料

- [Koa.js 架构](https://koajs.com/)
- [Express.js 架构](https://expressjs.com/)
- [Hono 架构](https://hono.dev/)
- [Bun HTTP Server](https://bun.sh/docs/api/http)
