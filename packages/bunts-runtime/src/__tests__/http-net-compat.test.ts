import { describe, it, expect } from 'vitest'
import * as nodeHttp from 'node:http'
import { createHttpModule } from '../core-modules/http'
import { createNetModule } from '../core-modules/net'
import { createTlsModule } from '../core-modules/tls'
import { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import { createBunRuntime } from '../bun-runtime'

describe('http/https client', () => {
  it('performs a basic GET request', async () => {
    const server = nodeHttp.createServer((req, res) => {
      if (req.url === '/redirect') {
        res.statusCode = 302
        res.setHeader('location', '/ok')
        res.end()
        return
      }
      res.statusCode = 200
      res.setHeader('content-type', 'text/plain')
      res.end('ok')
    })

    await new Promise<void>((resolve) => server.listen(0, resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const http = createHttpModule(undefined, 'http:')
    const text = await new Promise<string>((resolve, reject) => {
      const req = http.get(`http://localhost:${port}/redirect`, (res) => {
        res.text().then(resolve).catch(reject)
      })
      req.on('error', reject)
    })

    server.close()
    expect(text).toBe('ok')
  })
})

describe('http server subset', () => {
  it('handles a request through Bun.serve integration', async () => {
    const vfs = new VirtualFileSystem()
    const runtime = createBunRuntime(vfs, { env: {}, cwd: '/', argv: [] }, () => {}, () => {})
    const http = createHttpModule(runtime, 'http:')
    const server = http.createServer((req, res) => {
      if (req.url.endsWith('/hello')) {
        res.setHeader('x-test', 'ok')
        res.end('hello')
        return
      }
      res.statusCode = 404
      res.end('missing')
    })

    server.listen(3123)
    const response = await runtime.Bun.__dispatchServeRequest(new Request('http://localhost:3123/hello'))
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('x-test')).toBe('ok')
    expect(body).toBe('hello')
    server.close()
  })
})

describe('net/tls sockets', () => {
  it('creates sockets with basic methods', () => {
    const net = createNetModule()
    const tls = createTlsModule()
    const socket = net.connect({ host: 'localhost', port: 1234 })
    const tlsSocket = tls.connect({ host: 'localhost', port: 443 })

    expect(socket).toBeDefined()
    expect(tlsSocket).toBeDefined()
    expect(() => socket.write('ping')).not.toThrow()
    expect(() => socket.end()).not.toThrow()
  })
})
