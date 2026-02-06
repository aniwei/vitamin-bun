# @vitamin-bun/server

HTTP 服务器抽象。

## 安装

```bash
bun add @vitamin-bun/server
```

## 功能

- ✅ Bun.serve 封装
- ✅ 开发/生产模式
- ⏳ WebSocket 支持（计划中）
- ⏳ 静态文件服务（计划中）
- ⏳ 请求日志（计划中）

## 使用示例

```typescript
import { Server } from '@vitamin-bun/server'
import { Application } from '@vitamin-bun/core'

const app = new Application()
const server = new Server({
  port: 3000,
  development: true,
  logging: true
})

// 启动服务器
await server.start()

// WebSocket 支持
server.websocket('/ws', {
  message(ws, message) {
    ws.send(`Echo: ${message}`)
  },
  open(ws) {
    console.log('WebSocket connected')
  }
})

// 静态文件服务
server.static('/public', {
  root: './public',
  index: 'index.html'
})
```

## API 文档

详见 [项目文档](https://github.com/aniwei/vitamin-bun)。

## License

MIT © aniwei
