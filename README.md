# vitamin-bun

<div align="center">

一个基于 Bun 运行时的现代化全栈 Web 框架

[![CI](https://github.com/aniwei/vitamin-bun/workflows/CI/badge.svg)](https://github.com/aniwei/vitamin-bun/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/bun-%3E%3D1.0.0-black)](https://bun.sh)

</div>

## ✨ 特性

- 🚀 **极致性能** - 充分利用 Bun 运行时的性能优势
- 💎 **TypeScript-first** - 完整的类型支持和推导
- 🎯 **简洁 API** - 直观易用的开发体验
- 📦 **模块化设计** - 可组合的包架构
- 🛠️ **现代化工具链** - Bun 原生工具链支持
- ⚡️ **快速开发** - 热重载和快速构建

## 📦 核心包

| 包 | 版本 | 描述 |
|---|---|---|
| [@vitamin-bun/core](./packages/core) | 0.0.0 | 核心运行时和框架基础 |
| [@vitamin-bun/router](./packages/router) | 0.0.0 | 路由系统 |
| [@vitamin-bun/server](./packages/server) | 0.0.0 | HTTP 服务器抽象 |
| [@vitamin-bun/config](./packages/config) | 0.0.0 | 配置管理 |
| [@vitamin-bun/cli](./packages/cli) | 0.0.0 | CLI 工具 |
| [@vitamin-bun/create](./packages/create) | 0.0.0 | 项目脚手架 |

## 🚀 快速开始

### 安装 Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 创建新项目

```bash
bun create vitamin my-app
cd my-app
bun install
bun run dev
```

### 手动安装

```bash
bun add @vitamin-bun/core @vitamin-bun/router @vitamin-bun/server
```

### 基础示例

```typescript
import { Application } from '@vitamin-bun/core'
import { Router } from '@vitamin-bun/router'

const app = new Application()
const router = new Router()

// 定义路由
router.get('/', (ctx) => {
  ctx.json({ message: 'Hello, vitamin-bun!' })
})

router.get('/users/:id', (ctx) => {
  const { id } = ctx.params
  ctx.json({ id, name: 'User' })
})

// 使用路由
app.use(router.routes())

// 启动服务器
app.listen(3000)
```

## 📖 文档

- [项目愿景](./specs/000-overview.md)
- [架构设计](./specs/001-architecture.md)
- [技术方案 RFC](./docs/rfcs/0001-project-architecture.md)
- [API 文档](./docs/api) (即将推出)

## 🏗️ 项目结构

```
vitamin-bun/
├── packages/          # 核心包
│   ├── core/         # 核心运行时
│   ├── router/       # 路由系统
│   ├── server/       # HTTP 服务器
│   ├── config/       # 配置管理
│   ├── cli/          # CLI 工具
│   └── create/       # 项目脚手架
├── apps/             # 应用示例
│   └── playground/   # 开发调试
├── specs/            # 项目规范
├── docs/             # 文档
└── .github/          # GitHub 配置
```

## 🛠️ 开发

```bash
# 安装依赖
bun install

# 开发模式
bun run dev

# 构建所有包
bun run build

# 运行测试
bun test

# 类型检查
bun run typecheck

# 代码检查
bun run lint

# 代码格式化
bun run format
```

## 🤝 贡献

我们欢迎所有形式的贡献！请查看 [贡献指南](./CONTRIBUTING.md) 了解详情。

### 贡献者

感谢所有贡献者！

## 📄 License

[MIT](./LICENSE) © aniwei

## 🔗 相关链接

- [Bun 官方文档](https://bun.sh/docs)
- [TypeScript 官方文档](https://www.typescriptlang.org/docs/)
- [Biome 官方文档](https://biomejs.dev/)

## 💬 社区

- [GitHub Discussions](https://github.com/aniwei/vitamin-bun/discussions)
- [Issue 追踪](https://github.com/aniwei/vitamin-bun/issues)

---

<div align="center">

**[⭐️ Star on GitHub](https://github.com/aniwei/vitamin-bun)**

用 ❤️ 和 ☕️ 构建

</div>
