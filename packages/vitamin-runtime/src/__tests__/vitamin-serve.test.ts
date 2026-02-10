import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { createBunRuntime } from '../vitamin-runtime'

describe('Bun.serve', () => {
  it('registers a handler and dispatches requests', async () => {
    const vfs = new VirtualFileSystem()
    const registered: number[] = []
    const runtime = createBunRuntime(
      vfs,
      {},
      () => {},
      () => {},
      {
        onServeRegister: (port) => registered.push(port),
      },
    )

    const server = runtime.Bun.serve({
      port: 3000,
      fetch: () => new Response('ok'),
    })

    const response = await runtime.Bun.__dispatchServeRequest(new Request('http://localhost:3000/'))
    expect(await response.text()).toBe('ok')
    expect(server.port).toBe(3000)
    expect(registered).toEqual([3000])
  })

  it('returns 404 when no handler is registered', async () => {
    const vfs = new VirtualFileSystem()
    const runtime = createBunRuntime(vfs, {}, () => {}, () => {})

    const response = await runtime.Bun.__dispatchServeRequest(new Request('http://localhost:3000/'))
    expect(response.status).toBe(404)
  })

  it('stops a server and unregisters it', async () => {
    const vfs = new VirtualFileSystem()
    const unregistered: number[] = []
    const runtime = createBunRuntime(
      vfs,
      {},
      () => {},
      () => {},
      {
        onServeUnregister: (port) => unregistered.push(port),
      },
    )

    const server = runtime.Bun.serve({
      port: 3001,
      fetch: () => new Response('ok'),
    })

    server.stop()

    const response = await runtime.Bun.__dispatchServeRequest(new Request('http://localhost:3001/'))
    expect(response.status).toBe(404)
    expect(unregistered).toEqual([3001])
  })

  it('exposes reload/ref/unref lifecycle methods', () => {
    const vfs = new VirtualFileSystem()
    const runtime = createBunRuntime(vfs, {}, () => {}, () => {})

    const server = runtime.Bun.serve({
      port: 3002,
      fetch: () => new Response('ok'),
    })

    expect(typeof server.reload).toBe('function')
    expect(typeof server.ref).toBe('function')
    expect(typeof server.unref).toBe('function')

    server.reload?.()
    server.ref?.()
    server.unref?.()
    server.stop()
  })
})
