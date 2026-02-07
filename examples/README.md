# Examples

Vitamin Bun 使用示例合集，从入门到进阶。

## 示例列表

| # | 示例 | 说明 | 涉及 API |
|---|------|------|----------|
| 01 | [Hello World](./01-hello-world/) | 最简单的用法：创建容器、执行 TypeScript、获取输出 | `createBunContainer`, `exec` |
| 02 | [Virtual Filesystem](./02-virtual-fs/) | 文件读写、目录创建、批量挂载、目录列举 | `fs.*`, `mount` |
| 03 | [Spawn Process](./03-spawn-process/) | 长时间运行进程，流式 stdout/stderr、stdin 交互 | `spawn`, `writeStdin`, `kill`, `exited` |
| 04 | [Code Editor](./04-code-editor/) | 浏览器内代码编辑器 Playground（带完整 UI） | `createBunContainer`, `fs.writeFile`, `exec` |
| 05 | [Network Sandbox](./05-network-sandbox/) | 网络代理沙箱、`allowedHosts` 策略、Service Worker 拦截 | `allowedHosts`, `serviceWorkerUrl`, `spawn` |
| 06 | [Low-Level API](./06-low-level-api/) | 直接使用 `@vitamin-ai/wasm-host`：WASI shim、WASM 加载、JS Bridge | `WasmHost`, `WasiShim`, `JSContextBridge` |
| 07 | [Bun.serve Basic](./07-bun-serve-basic/) | 最小化 Bun.serve 监听与转发 | `Bun.serve`, `serviceWorkerUrl`, `spawn` |
| 08 | [Bun.serve Routes](./08-bun-serve-routes/) | 路由、Header、JSON 响应 | `Bun.serve`, `Response.json` |
| 09 | [Bun.serve Streaming](./09-bun-serve-streaming/) | 流式响应与 chunk 读取 | `Bun.serve`, `ReadableStream` |
| 10 | [Bun.serve WebSocket](./10-bun-serve-websocket/) | WebSocket 转发 (浏览器内 best-effort) | `Bun.serve`, `WebSocket` |
| 11 | [Bun.serve TLS Proxy](./11-bun-serve-tls/) | 通过 SW 代理 https 请求 | `Bun.serve`, `serviceWorkerUrl` |
| 12 | [Bun Install (Proxy)](./12-bun-install/) | 通过 Vite 代理访问 npm 注册表 | `bun install`, `BUN_INSTALL_REGISTRY` |
| 13 | [Plugin net/http/https](./13-plugin-net-http/) | 使用插件拦截模块加载与网络 API | `Bun.plugin`, `onModuleLoad` |

## 快速开始

```bash
# 1. 在项目根目录安装依赖
pnpm install

# 2. 进入任意示例目录
cd examples/01-hello-world

# 3. 用 Vite 或任何支持 ESM 的 dev server 启动
#    例如使用 npx:
npx vite
```

> **注意**：BunTS 路线下 `bun-core.wasm` **不再是必需**。
> 只有在启用 WASM 兼容层时才需要提供对应的二进制文件。

## 前置要求

### COOP/COEP Headers

SharedArrayBuffer（用于同步 I/O）需要跨域隔离。开发服务器必须返回以下 HTTP 头：

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Vite 配置示例：

```ts
// vite.config.ts
export default {
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
}
```

### TypeScript 路径映射

如果从 monorepo 内部运行示例，确保 bundler 能解析 `@vitamin-ai/*` 包：

```ts
// vite.config.ts
import { resolve } from 'path'

export default {
  resolve: {
    alias: {
      '@vitamin-ai/sdk': resolve(__dirname, '../../packages/sdk/src'),
      '@vitamin-ai/wasm-host': resolve(__dirname, '../../packages/wasm-host/src'),
      '@vitamin-ai/virtual-fs': resolve(__dirname, '../../packages/virtual-fs/src'),
      '@vitamin-ai/browser-runtime': resolve(__dirname, '../../packages/browser-runtime/src'),
      '@vitamin-ai/network-proxy': resolve(__dirname, '../../packages/network-proxy/src'),
    },
  },
}
```

## API 速查

### `createBunContainer(options)`

```ts
import { createBunContainer } from '@vitamin-ai/sdk'

const container = await createBunContainer({
  wasmUrl: '/bun-core.wasm',          // WASM 二进制 URL
  workerUrl: '/worker.js',            // 可选：自定义 Worker 脚本
  serviceWorkerUrl: '/sw.js',         // 可选：Service Worker
  files: { '/index.ts': '...' },      // 初始文件
  env: { NODE_ENV: 'production' },     // 环境变量
  persistence: 'memory',              // 'memory' | 'indexeddb' | 'opfs'
  allowedHosts: ['api.example.com'],   // 网络沙箱白名单
})
```

### Container API

```ts
// 执行命令并等待完成
const { exitCode, stdout, stderr } = await container.exec('bun', ['run', 'index.ts'])

// 启动长时间运行的进程
const proc = container.spawn('bun', ['run', 'server.ts'])
proc.stdout.on('data', (chunk) => console.log(chunk))
proc.writeStdin('input\n')
proc.kill()
const code = await proc.exited

// 文件系统操作
await container.fs.writeFile('/app.ts', 'console.log("hi")')
const content = await container.fs.readFile('/app.ts', 'utf-8')
await container.fs.mkdir('/src')
const entries = await container.fs.readdir('/')
const exists = await container.fs.exists('/app.ts')
await container.fs.unlink('/app.ts')

// 批量挂载文件
await container.mount('/project', {
  'package.json': '{ "name": "app" }',
  'src/index.ts': 'console.log("hello")',
})

// 销毁容器
await container.destroy()
```
