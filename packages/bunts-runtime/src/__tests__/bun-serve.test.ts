import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { createBunRuntime } from '../bun-runtime'

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
})
