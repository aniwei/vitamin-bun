import { describe, it, expect } from 'vitest'
import * as nodeHttp from 'node:http'
import { createHttpModule } from '../internal-modules/http'
import { createNetModule } from '../internal-modules/net'
import { createTlsModule } from '../internal-modules/tls'
import { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import { createBunRuntime } from '../vitamin-runtime'

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

  it('supports request with headers and body', async () => {
    let resolveReceived: ((value: { method?: string; header?: string; body: string }) => void) | null = null
    const received = new Promise<{ method?: string; header?: string; body: string }>((resolve) => {
      resolveReceived = resolve
    })

    const server = nodeHttp.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk.toString()
      })
      req.on('end', () => {
        res.statusCode = 201
        res.setHeader('x-echo', '1')
        res.end('created')
        resolveReceived?.({ method: req.method, header: req.headers['x-test'] as string | undefined, body })
      })
    })

    await new Promise<void>((done) => server.listen(0, done))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    try {
      const http = createHttpModule(undefined, 'http:')
      const responseText = await new Promise<string>((resolveResponse, reject) => {
        const req = http.request(
          `http://localhost:${port}/submit`,
          {
            method: 'POST',
            headers: {
              'content-type': 'text/plain',
              'x-test': '1',
            },
          },
          (res) => {
            res.text().then(resolveResponse).catch(reject)
          },
        )
        req.on('error', reject)
        req.write('hello')
        req.end(' world')
      })

      expect(responseText).toBe('created')
      const result = await received
      expect(result.method).toBe('POST')
      expect(result.header).toBe('1')
      expect(result.body).toBe('hello world')
    } finally {
      server.close()
    }
  })

  it('supports options-only request with auth and header helpers', async () => {
    let resolveReceived: ((value: { auth?: string; header?: string }) => void) | null = null
    const received = new Promise<{ auth?: string; header?: string }>((resolve) => {
      resolveReceived = resolve
    })

    const server = nodeHttp.createServer((req, res) => {
      res.statusCode = 200
      res.end('ok')
      resolveReceived?.({
        auth: req.headers.authorization as string | undefined,
        header: req.headers['x-extra'] as string | undefined,
      })
    })

    await new Promise<void>((done) => server.listen(0, done))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    try {
      const http = createHttpModule(undefined, 'http:')
      const req = http.request({ hostname: 'localhost', port, path: '/auth', auth: 'user:pass' }, (res) => {
        res.text().catch(() => {})
      })
      req.setHeader('x-extra', '1')
      req.end()

      const result = await received
      expect(result.header).toBe('1')
      expect(result.auth).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`)
    } finally {
      server.close()
    }
  })

  it('exposes METHODS, STATUS_CODES, and globalAgent', () => {
    const http = createHttpModule(undefined, 'http:')
    expect(http.METHODS).toContain('GET')
    expect(http.STATUS_CODES[200]).toBe('OK')
    expect(http.globalAgent).toBeDefined()
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

  it('streams response chunks and reads request body', async () => {
    const vfs = new VirtualFileSystem()
    const runtime = createBunRuntime(vfs, { env: {}, cwd: '/', argv: [] }, () => {}, () => {})
    const http = createHttpModule(runtime, 'http:')
    const server = http.createServer((req, res) => {
      let payload = ''
      req.on('data', (chunk: unknown) => {
        const data = chunk instanceof Uint8Array ? chunk : new TextEncoder().encode(String(chunk))
        payload += new TextDecoder().decode(data)
      })
      req.on('end', () => {
        res.writeHead(201, { 'x-body': payload })
        res.write('a')
        res.write('b')
        res.end('c')
      })
    })

    server.listen(3124)
    const response = await runtime.Bun.__dispatchServeRequest(
      new Request('http://localhost:3124/stream', { method: 'POST', body: 'ping' }),
    )
    const body = await response.text()

    expect(response.status).toBe(201)
    expect(response.headers.get('x-body')).toBe('ping')
    expect(body).toBe('abc')
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
