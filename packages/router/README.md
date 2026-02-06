# @vitamin-bun/router

路由系统。

## 安装

```bash
bun add @vitamin-bun/router
```

## 功能

- ✅ 路由注册（GET, POST, PUT, DELETE, PATCH）
- ✅ 路径参数提取 `/users/:id`
- ✅ 路由分组
- ⏳ 通配符路由（计划中）
- ⏳ 路由中间件（计划中）

## 使用示例

```typescript
import { Application } from '@vitamin-bun/core'
import { Router } from '@vitamin-bun/router'

const app = new Application()
const router = new Router()

// 基础路由
router.get('/hello', (ctx) => {
  ctx.json({ message: 'Hello!' })
})

// 路径参数
router.get('/users/:id', (ctx) => {
  const { id } = ctx.params
  ctx.json({ id })
})

// 路由分组
router.group('/api/v1', (api) => {
  api.get('/users', listUsers)
  api.post('/users', createUser)
})

app.use(router.routes())
app.listen(3000)
```

## API 文档

详见 [项目文档](https://github.com/aniwei/vitamin-bun)。

## License

MIT © aniwei
