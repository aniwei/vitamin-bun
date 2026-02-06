# @vitamin-bun/config

配置管理。

## 安装

```bash
bun add @vitamin-bun/config
```

## 功能

- ✅ 类型安全的配置定义
- ⏳ 配置文件加载（计划中）
- ⏳ 环境变量支持（计划中）
- ⏳ 配置验证（计划中）

## 使用示例

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

```typescript
// 在应用中使用
import { loadConfig } from '@vitamin-bun/config'

const config = await loadConfig()
console.log(config.server?.port) // 3000
```

## API 文档

详见 [项目文档](https://github.com/aniwei/vitamin-bun)。

## License

MIT © aniwei
