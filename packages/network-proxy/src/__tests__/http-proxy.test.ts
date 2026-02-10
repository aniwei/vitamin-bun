import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HttpProxy } from '../http-proxy'
import { AddressFamily, SocketType, SocketState } from '../types'

describe('HttpProxy', () => {
  let proxy: HttpProxy

  beforeEach(() => {
    proxy = new HttpProxy()
  })

  describe('open', () => {
    it('returns a unique fd', () => {
      const fd1 = proxy.open(AddressFamily.INET, SocketType.STREAM)
      const fd2 = proxy.open(AddressFamily.INET, SocketType.STREAM)
      expect(fd1).toBeGreaterThan(0)
      expect(fd2).toBeGreaterThan(0)
      expect(fd1).not.toBe(fd2)
    })
  })

  describe('connect', () => {
    it('sets target host and port', () => {
      const fd = proxy.open(AddressFamily.INET, SocketType.STREAM)
      // Should not throw
      proxy.connect(fd, 'example.com', 80)
    })

    it('throws for invalid fd', () => {
      expect(() => proxy.connect(999, 'example.com', 80)).toThrow('EBADF')
    })
  })

  describe('allowedHosts policy', () => {
    it('blocks connections to disallowed hosts', () => {
      const restricted = new HttpProxy({ allowedHosts: ['api.example.com'] })
      const fd = restricted.open(AddressFamily.INET, SocketType.STREAM)
      expect(() => restricted.connect(fd, 'evil.com', 443)).toThrow('blocked')
    })

    it('allows connections to permitted hosts', () => {
      const restricted = new HttpProxy({ allowedHosts: ['api.example.com'] })
      const fd = restricted.open(AddressFamily.INET, SocketType.STREAM)
      expect(() => restricted.connect(fd, 'api.example.com', 443)).not.toThrow()
    })
  })

  describe('send', () => {
    it('buffers outgoing data', () => {
      const fd = proxy.open(AddressFamily.INET, SocketType.STREAM)
      proxy.connect(fd, 'example.com', 80)

      const data = new TextEncoder().encode('GET / HTTP/1.1\r\nHost: example.com\r\n\r\n')
      const len = proxy.send(fd, data)
      expect(len).toBe(data.byteLength)
    })
  })

  describe('recv', () => {
    it('returns empty array when no data buffered', () => {
      const fd = proxy.open(AddressFamily.INET, SocketType.STREAM)
      proxy.connect(fd, 'example.com', 80)

      const data = proxy.recv(fd, 1024)
      expect(data.byteLength).toBe(0)
    })
  })

  describe('close', () => {
    it('closes an open socket', () => {
      const fd = proxy.open(AddressFamily.INET, SocketType.STREAM)
      proxy.connect(fd, 'example.com', 80)

      proxy.close(fd)
      // Subsequent operations should fail
      expect(() => proxy.send(fd, new Uint8Array([1]))).toThrow('EBADF')
    })

    it('is a no-op for unknown fd', () => {
      expect(() => proxy.close(999)).not.toThrow()
    })
  })

  describe('flush (with mocked fetch)', () => {
    it('parses HTTP request and calls fetch', async () => {
      const mockResponse = new Response('OK', {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/plain' },
      })
      const originalFetch = globalThis.fetch
      const mockFetch = vi.fn().mockResolvedValue(mockResponse)
      globalThis.fetch = mockFetch

      try {
        const fd = proxy.open(AddressFamily.INET, SocketType.STREAM)
        proxy.connect(fd, 'example.com', 80)

        const request = 'GET /api/test HTTP/1.1\r\nHost: example.com\r\n\r\n'
        proxy.send(fd, new TextEncoder().encode(request))

        await proxy.flush(fd)

        expect(mockFetch).toHaveBeenCalledOnce()
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('http://example.com:80/api/test')
        expect(opts.method).toBe('GET')

        // Response should now be buffered
        const response = proxy.recv(fd, 65536)
        expect(response.byteLength).toBeGreaterThan(0)

        const text = new TextDecoder().decode(response)
        expect(text).toContain('HTTP/1.1 200')
        expect(text).toContain('OK')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('handles POST with body', async () => {
      const mockResponse = new Response('{"ok":true}', {
        status: 201,
        statusText: 'Created',
      })
      const originalFetch = globalThis.fetch
      const mockFetch = vi.fn().mockResolvedValue(mockResponse)
      globalThis.fetch = mockFetch

      try {
        const fd = proxy.open(AddressFamily.INET, SocketType.STREAM)
        proxy.connect(fd, 'api.example.com', 443)

        const body = '{"name":"test"}'
        const request = `POST /items HTTP/1.1\r\nHost: api.example.com\r\nContent-Length: ${body.length}\r\n\r\n${body}`
        proxy.send(fd, new TextEncoder().encode(request))

        await proxy.flush(fd)

        expect(mockFetch).toHaveBeenCalledOnce()
        const [, opts] = mockFetch.mock.calls[0]
        expect(opts.method).toBe('POST')

        const response = proxy.recv(fd, 65536)
        const text = new TextDecoder().decode(response)
        expect(text).toContain('201')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('recv partial read', () => {
    it('returns partial data and preserves remainder', async () => {
      const mockResponse = new Response('0123456789', { status: 200 })
      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse)

      try {
        const fd = proxy.open(AddressFamily.INET, SocketType.STREAM)
        proxy.connect(fd, 'example.com', 80)
        proxy.send(fd, new TextEncoder().encode('GET / HTTP/1.1\r\nHost: example.com\r\n\r\n'))
        await proxy.flush(fd)

        // Read only 5 bytes at a time
        const chunk1 = proxy.recv(fd, 5)
        expect(chunk1.byteLength).toBe(5)

        // Should still have remaining data
        const chunk2 = proxy.recv(fd, 65536)
        expect(chunk2.byteLength).toBeGreaterThan(0)
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })
})
