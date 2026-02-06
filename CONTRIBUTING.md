# 贡献指南

感谢你对 vitamin-bun 的关注！我们欢迎各种形式的贡献。

## 行为准则

请遵守我们的行为准则，保持友好和尊重。

## 如何贡献

### 报告 Bug

如果你发现了 bug，请：

1. 检查是否已有相关 issue
2. 如果没有，创建新的 issue
3. 提供详细的复现步骤
4. 包含环境信息（Bun 版本、OS 等）

使用 [Bug 报告模板](./.github/ISSUE_TEMPLATE/bug_report.md)。

### 提出功能请求

如果你有新功能的想法：

1. 检查是否已有相关 issue 或 RFC
2. 创建功能请求 issue
3. 详细描述使用场景和预期行为

使用 [功能请求模板](./.github/ISSUE_TEMPLATE/feature_request.md)。

### 提交代码

#### 开发流程

1. **Fork 仓库**

   ```bash
   # Fork 到你的账号
   # 克隆到本地
   git clone https://github.com/YOUR_USERNAME/vitamin-bun.git
   cd vitamin-bun
   ```

2. **安装依赖**

   ```bash
   bun install
   ```

3. **创建分支**

   ```bash
   git checkout -b feature/my-feature
   # or
   git checkout -b fix/my-bug-fix
   ```

4. **进行修改**

   - 遵循代码规范
   - 添加测试
   - 更新文档

5. **运行测试**

   ```bash
   bun test
   bun run typecheck
   bun run lint
   ```

6. **提交代码**

   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

   提交信息格式：
   - `feat:` 新功能
   - `fix:` Bug 修复
   - `docs:` 文档更新
   - `style:` 代码格式调整
   - `refactor:` 重构
   - `test:` 测试相关
   - `chore:` 构建/工具相关

7. **推送并创建 PR**

   ```bash
   git push origin feature/my-feature
   ```

   在 GitHub 上创建 Pull Request。

#### 代码规范

- 使用 TypeScript strict mode
- 遵循 Biome 配置的代码风格
- 为公共 API 添加 JSDoc 注释
- 保持函数简洁，单一职责
- 避免使用 `any` 类型

#### 测试要求

- 新功能必须包含测试
- Bug 修复应包含回归测试
- 测试覆盖率应保持或提高
- 使用 Bun test runner

示例测试：

```typescript
import { describe, it, expect } from 'bun:test'
import { Application } from '@vitamin-bun/core'

describe('Application', () => {
  it('should create an instance', () => {
    const app = new Application()
    expect(app).toBeDefined()
  })
})
```

#### 文档要求

- API 变更必须更新文档
- 新功能需要添加使用示例
- 更新相关的 README 和规范文档
- 文档使用中文，代码注释使用英文

## 项目结构

```
vitamin-bun/
├── packages/          # 核心包
├── apps/             # 应用示例
├── specs/            # 项目规范
├── docs/             # 文档
└── .github/          # GitHub 配置
```

## 开发工具

### 推荐的 IDE

- VS Code
- WebStorm
- Cursor

### 推荐的插件

- Biome (VS Code)
- TypeScript and JavaScript Language Features

## 发布流程

发布由维护者处理：

1. 更新版本号
2. 更新 CHANGELOG
3. 创建 Git tag
4. 发布到 npm
5. 创建 GitHub Release

## 获取帮助

如果你有任何问题：

- 查看 [文档](./README.md)
- 搜索现有 [Issues](https://github.com/aniwei/vitamin-bun/issues)
- 创建新的 Discussion
- 加入我们的社区频道

## 许可证

通过贡献代码，你同意你的贡献将在 MIT 许可证下发布。

---

再次感谢你的贡献！ 🎉
