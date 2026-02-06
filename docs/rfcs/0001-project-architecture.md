# RFC 0001: vitamin-bun 项目架构

- **状态**: 草案 (Draft)
- **创建日期**: 2026-02-06
- **作者**: aniwei

## 概述

vitamin-bun 是一个基于 Bun 运行时的现代化全栈 Web 框架。本 RFC 描述了项目的整体架构、技术栈选型、核心设计以及实施计划。

### 项目定位

vitamin-bun 定位为：

- **高性能**: 充分利用 Bun 运行时的性能优势，提供业界领先的启动速度和运行时性能
- **现代化**: 拥抱最新的 Web 标准和 ECMAScript 特性
- **类型安全**: TypeScript-first 设计，提供完整的类型推导和检查
- **开发友好**: 极简的 API 设计，优秀的开发者体验
- **模块化**: 可组合的包架构，按需使用

## 动机

### 为什么需要 vitamin-bun？

#### 1. Bun 的原生能力

Bun 是一个快速的 JavaScript 运行时，提供了：

- **极快的启动速度**: 比 Node.js 快 4 倍
- **内置工具链**: 原生的打包器、测试运行器、包管理器
- **Web 标准兼容**: 原生支持 Fetch API、WebSocket 等
- **高性能**: 基于 JavaScriptCore 引擎，性能优异

然而，Bun 生态系统还处于早期阶段，缺少一个专为 Bun 设计的全栈框架。

#### 2. 现有框架的局限性

- **Express/Koa**: 为 Node.js 设计，无法充分利用 Bun 的能力
- **Next.js/Nuxt.js**: 重量级框架，依赖复杂
- **Hono**: 轻量级但功能有限，主要面向边缘计算

#### 3. 开发体验的重要性

现代 Web 开发需要：

- 快速的热重载
- 完善的类型支持
- 简洁的 API
- 丰富的工具链

vitamin-bun 旨在提供最佳的开发体验，同时保持高性能。

## 技术栈选型

### 运行时

**选择**: Bun v1.0+

**理由**:
- 极快的性能
- 内置工具链
- 原生 TypeScript 支持
- Web 标准兼容

**权衡**:
- 生态系统相对较新
- 部分 npm 包可能存在兼容性问题

### 开发语言

**选择**: TypeScript (strict mode)

**理由**:
- 类型安全
- 更好的 IDE 支持
- 自文档化代码
- 易于重构

**配置**:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler"
  }
}
```

### 包管理

**选择**: Bun workspaces

**理由**:
- 与 Bun 原生集成
- 极快的安装速度
- 内置的 workspace 支持

### 构建工具

**选择**: Bun bundler

**理由**:
- 原生集成
- 极快的构建速度
- 无需额外配置

### 测试框架

**选择**: Bun test runner

**理由**:
- 内置支持
- 快速执行
- 简单的 API
- 内置代码覆盖率

### Lint 和 Format

**选择**: Biome

**理由**:
- 统一的 lint 和 format 工具
- 极快的速度（比 ESLint + Prettier 快 100 倍）
- 更好的错误信息
- 与 Bun 生态契合

**替代方案**: ESLint + Prettier（更成熟但速度慢）

### CI/CD

**选择**: GitHub Actions

**理由**:
- 广泛使用
- 易于配置
- 免费额度充足
- 与 GitHub 无缝集成

## 架构设计

### Monorepo 结构

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
│   └── docs/            # 文档站点
├── specs/                # OpenSpec 规范
├── docs/                 # 文档
└── .github/              # GitHub 配置
```

### 核心包设计

#### @vitamin-bun/core

**职责**: 框架核心运行时和基础抽象

**主要模块**:

```typescript
// Application - 应用实例
export class Application {
  use(middleware: Middleware): this
  onError(handler: ErrorHandler): this
  listen(port: number): Server
}

// Context - 请求上下文
export interface Context {
  request: Request
  response: Response
  params: Record<string, string>
  query: Record<string, string>
  state: any
  
  json(data: any): void
  text(data: string): void
  html(data: string): void
}

// Middleware - 中间件类型
export type Middleware = (
  ctx: Context,
  next: Next
) => Promise<void> | void
```

**设计要点**:
- 洋葱模型中间件系统
- 类型安全的上下文
- 灵活的错误处理
- 最小的运行时开销

#### @vitamin-bun/router

**职责**: 路由匹配和参数解析

**主要功能**:

```typescript
export class Router {
  get(path: string, handler: Handler): this
  post(path: string, handler: Handler): this
  put(path: string, handler: Handler): this
  delete(path: string, handler: Handler): this
  
  // 路由分组
  group(prefix: string, callback: (router: Router) => void): this
  
  // 中间件
  use(middleware: Middleware): this
}
```

**技术实现**:
- Radix Tree 路由匹配（高性能）
- 支持路径参数 `/users/:id`
- 支持通配符 `/files/*`
- 路由优先级管理

#### @vitamin-bun/server

**职责**: HTTP 服务器抽象

**主要功能**:

```typescript
export class Server {
  constructor(options: ServerOptions)
  
  // 启动服务器
  start(): Promise<void>
  
  // 停止服务器
  stop(): Promise<void>
  
  // WebSocket 支持
  websocket(path: string, handler: WebSocketHandler): void
  
  // 静态文件
  static(path: string, options?: StaticOptions): void
}
```

**特性**:
- 基于 Bun.serve
- WebSocket 支持
- 静态文件服务
- 开发模式热重载
- 请求日志

#### @vitamin-bun/config

**职责**: 配置加载和管理

**主要功能**:

```typescript
// 定义配置
export function defineConfig<T>(config: T): T

// 加载配置
export function loadConfig<T>(
  options?: LoadConfigOptions
): Promise<T>

// 配置文件支持
// - vitamin.config.ts
// - vitamin.config.js
// - vitamin.config.json
```

**特性**:
- TypeScript 配置文件
- 环境变量支持
- 配置验证（Zod）
- 配置合并策略

#### @vitamin-bun/cli

**职责**: 命令行工具

**主要命令**:

```bash
# 开发
vitamin dev [options]

# 构建
vitamin build [options]

# 预览
vitamin preview [options]

# 类型检查
vitamin typecheck

# 测试
vitamin test [options]
```

**特性**:
- 彩色输出
- 进度指示
- 友好的错误信息
- 插件系统

#### @vitamin-bun/create

**职责**: 项目脚手架

**使用方式**:

```bash
bun create vitamin my-app
# or
bunx create-vitamin my-app
```

**模板选项**:
- basic - 基础模板
- full - 完整功能模板
- api - API 服务器模板
- minimal - 最小化模板

### 示例应用

#### apps/playground

开发调试用的 playground，用于：
- 测试新功能
- 性能基准测试
- 示例代码验证
- 开发环境调试

#### apps/docs

文档站点（未来），包含：
- API 文档
- 指南教程
- 示例代码
- 最佳实践

## API 设计草案

### 基础使用

```typescript
import { Application } from '@vitamin-bun/core'
import { Router } from '@vitamin-bun/router'

const app = new Application()
const router = new Router()

// 中间件
app.use(async (ctx, next) => {
  console.log(`${ctx.method} ${ctx.path}`)
  await next()
})

// 路由
router.get('/hello', (ctx) => {
  ctx.json({ message: 'Hello, vitamin!' })
})

router.get('/users/:id', (ctx) => {
  const { id } = ctx.params
  ctx.json({ id, name: 'User' })
})

app.use(router.routes())
app.listen(3000)
```

### 路由分组

```typescript
router.group('/api/v1', (api) => {
  api.get('/users', listUsers)
  api.post('/users', createUser)
  
  api.group('/users/:userId', (user) => {
    user.get('/', getUser)
    user.put('/', updateUser)
    user.delete('/', deleteUser)
  })
})
```

### 中间件使用

```typescript
// 全局中间件
app.use(logger())
app.use(cors())
app.use(bodyParser())

// 路由中间件
router.use(authenticate())
router.get('/protected', authorize('admin'), handler)
```

### 错误处理

```typescript
// 自定义错误
class NotFoundError extends Error {
  status = 404
}

// 错误处理器
app.onError((err, ctx) => {
  ctx.status = err.status || 500
  ctx.json({
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  })
})
```

### WebSocket 支持

```typescript
import { Server } from '@vitamin-bun/server'

const server = new Server({ port: 3000 })

server.websocket('/ws', {
  message(ws, message) {
    ws.send(`Echo: ${message}`)
  },
  open(ws) {
    console.log('WebSocket connected')
  },
  close(ws) {
    console.log('WebSocket disconnected')
  }
})
```

### 配置文件

```typescript
// vitamin.config.ts
import { defineConfig } from '@vitamin-bun/config'

export default defineConfig({
  server: {
    port: 3000,
    host: 'localhost'
  },
  dev: {
    hot: true,
    open: true
  },
  build: {
    outDir: 'dist',
    minify: true
  }
})
```

## 实施计划

### Phase 1: 基础框架 (2 周)

**目标**: 搭建 Monorepo 结构，实现核心包基础功能

**任务**:
- [x] 初始化 Monorepo 结构
- [ ] 实现 @vitamin-bun/core 核心功能
  - [ ] Application 类
  - [ ] Context 实现
  - [ ] 中间件系统
  - [ ] 错误处理
- [ ] 实现 @vitamin-bun/router 基础功能
  - [ ] 路由注册
  - [ ] 路径匹配
  - [ ] 参数解析
- [ ] 实现 @vitamin-bun/server 基础功能
  - [ ] Bun.serve 封装
  - [ ] 基础 HTTP 服务器
- [ ] 基础测试和文档

**验收标准**:
- 能够创建一个简单的 HTTP 服务器
- 能够定义路由和处理请求
- 中间件系统正常工作
- 测试覆盖率 > 70%

### Phase 2: 功能完善 (3 周)

**目标**: 完善核心功能，添加配置和 CLI

**任务**:
- [ ] 完善 @vitamin-bun/router
  - [ ] 路由分组
  - [ ] 路由中间件
  - [ ] 高级路径匹配
- [ ] 实现 @vitamin-bun/config
  - [ ] 配置文件加载
  - [ ] 环境变量支持
  - [ ] 配置验证
- [ ] 实现 @vitamin-bun/cli
  - [ ] dev 命令
  - [ ] build 命令
  - [ ] 基础项目模板
- [ ] WebSocket 支持
- [ ] 静态文件服务
- [ ] 完善文档和示例

**验收标准**:
- CLI 工具可用
- 配置系统工作正常
- 支持 WebSocket
- 测试覆盖率 > 80%

### Phase 3: 工具链和生态 (2 周)

**目标**: 完善开发工具和生态系统

**任务**:
- [ ] 实现 @vitamin-bun/create 脚手架
  - [ ] 多种项目模板
  - [ ] 交互式创建流程
- [ ] 开发工具增强
  - [ ] 热重载优化
  - [ ] 性能监控
  - [ ] 开发者工具
- [ ] 插件系统
  - [ ] 插件 API 设计
  - [ ] 官方插件
- [ ] 文档站点
  - [ ] API 文档
  - [ ] 教程和指南
  - [ ] 示例项目

**验收标准**:
- 脚手架工具可用
- 插件系统工作正常
- 文档完善
- 至少 3 个示例项目

### Phase 4: 优化和发布 (2 周)

**目标**: 性能优化，准备发布 v0.1.0

**任务**:
- [ ] 性能优化
  - [ ] 路由匹配优化
  - [ ] 内存优化
  - [ ] 启动速度优化
- [ ] 测试完善
  - [ ] E2E 测试
  - [ ] 性能基准测试
  - [ ] 兼容性测试
- [ ] 文档完善
  - [ ] API 文档完整性
  - [ ] 迁移指南
  - [ ] 最佳实践
- [ ] 发布准备
  - [ ] CHANGELOG
  - [ ] 发布流程
  - [ ] npm 发布

**验收标准**:
- 性能达到预期目标
- 测试覆盖率 > 85%
- 文档完整
- 成功发布到 npm

## 风险和挑战

### 技术风险

#### 1. Bun 生态成熟度

**风险**: Bun 是相对较新的运行时，生态系统可能不够成熟

**缓解措施**:
- 保持与 Node.js 的兼容性
- 提供兼容性指南
- 积极参与 Bun 社区

#### 2. 依赖包兼容性

**风险**: 部分 npm 包可能与 Bun 不兼容

**缓解措施**:
- 优先使用 Bun 原生 API
- 测试常用依赖包
- 提供替代方案列表

#### 3. 性能目标

**风险**: 可能无法达到预期的性能目标

**缓解措施**:
- 早期进行性能基准测试
- 持续性能监控
- 性能优化预留时间

### 市场风险

#### 1. 市场接受度

**风险**: 用户可能不愿意尝试新框架

**缓解措施**:
- 提供详细的文档和教程
- 创建示例项目
- 积极的社区互动
- 性能数据对比

#### 2. 与成熟框架竞争

**风险**: Express、Koa 等框架已经非常成熟

**缓解措施**:
- 强调性能优势
- 强调开发体验
- 提供迁移工具
- 找准差异化定位

### 维护风险

#### 1. 长期维护

**风险**: 个人项目可能难以长期维护

**缓解措施**:
- 建立贡献者社区
- 详细的贡献指南
- 清晰的代码结构
- 自动化工具支持

#### 2. 版本兼容性

**风险**: API 变更可能破坏现有应用

**缓解措施**:
- 遵循语义化版本
- 详细的 CHANGELOG
- 弃用警告机制
- 提供迁移指南

## 成功指标

### 短期目标（3 个月）

- GitHub Stars > 100
- npm 周下载量 > 100
- 至少 3 个真实项目使用
- 文档完整度 > 90%

### 中期目标（6 个月）

- GitHub Stars > 500
- npm 周下载量 > 1000
- 至少 10 个真实项目使用
- 至少 5 个社区贡献者
- 至少 3 个第三方插件

### 长期目标（1 年）

- GitHub Stars > 2000
- npm 周下载量 > 5000
- 生产环境应用 > 50
- 活跃社区
- 成熟的插件生态

## 替代方案

### 方案 A: 基于现有框架扩展

不创建新框架，而是为现有框架（如 Koa）创建 Bun 适配层。

**优点**:
- 利用现有生态
- 开发成本低
- 用户学习成本低

**缺点**:
- 无法充分利用 Bun 特性
- 受限于原框架设计
- 性能优势有限

**为什么不选**: 无法实现性能和体验的最优化

### 方案 B: 仅提供工具库

不提供完整框架，仅提供一系列工具库。

**优点**:
- 更灵活
- 更轻量
- 学习曲线平缓

**缺点**:
- 缺少统一的体验
- 集成复杂度高
- 不适合快速开发

**为什么不选**: 无法提供一致的开发体验

### 方案 C: 全功能框架

类似 Next.js，提供包括 UI 渲染的完整解决方案。

**优点**:
- 开箱即用
- 功能完整
- 最佳实践内置

**缺点**:
- 过于复杂
- 学习成本高
- 不够灵活

**为什么不选**: 违背轻量化和模块化的设计理念

## 总结

vitamin-bun 旨在成为 Bun 生态系统中的标杆性全栈框架，通过充分利用 Bun 的性能优势和现代化特性，提供极致的开发体验和运行性能。

项目采用 Monorepo 结构，核心包设计清晰，依赖关系简单。通过渐进式的实施计划，在保证质量的前提下快速迭代。

虽然面临技术和市场风险，但通过合理的缓解措施和明确的成功指标，项目有望成为 Bun 生态的重要组成部分。

## 附录

### 参考资料

- [Bun 官方文档](https://bun.sh/docs)
- [Koa.js 设计理念](https://koajs.com/)
- [Hono 架构](https://hono.dev/)
- [Biome 文档](https://biomejs.dev/)

### 相关 Issue

- 待创建

### 修订历史

- 2026-02-06: 初始版本
