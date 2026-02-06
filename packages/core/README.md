# @vitamin-bun/core

核心运行时和框架基础。

## 安装

```bash
bun add @vitamin-bun/core
```

## 功能

- ✅ Application 实例管理
- ✅ Context 上下文抽象
- ✅ Middleware 中间件系统
- ✅ Error 错误处理

## 使用示例

```typescript
import { Application } from '@vitamin-bun/core'

const app = new Application()

// 添加中间件
app.use(async (ctx, next) => {
  console.log(`${ctx.method} ${ctx.path}`)
  await next()
})

// 错误处理
app.onError((err, ctx) => {
  console.error(err)
  ctx.status = 500
  ctx.json({ error: err.message })
})

// 启动服务器
app.listen(3000)
```

## API 文档

详见 [项目文档](https://github.com/aniwei/vitamin-bun)。

## License

MIT © aniwei
