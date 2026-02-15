import { describe, it, expect, afterEach, vi } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { createBunRuntime } from '../vitamin-runtime'
import { createCoreModules } from '../internal-modules/index'
import { ModuleLoader } from '../module-loader'
import { Transpiler } from '../transpiler'
import { createNetModule } from '../internal-modules/net'
import { createTlsModule } from '../internal-modules/tls'

type NetProxyEvent =
  | { type: 'net:connected'; socketId: number }
  | { type: 'net:data'; socketId: number; data: Uint8Array }
  | { type: 'net:closed'; socketId: number }
  | { type: 'net:error'; socketId: number; message: string; code?: string }

type NetProxyBridge = {
  open: (host: string, port: number, tls: boolean) => number
  send: (socketId: number, data: Uint8Array) => void
  close: (socketId: number) => void
  on: (socketId: number, handler: (event: NetProxyEvent) => void) => void
  off: (socketId: number, handler: (event: NetProxyEvent) => void) => void
}

function createLoader(vfs: VirtualFileSystem) {
  const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
  const coreModules = createCoreModules(vfs, polyfill)

  return new ModuleLoader({
    vfs,
    transpiler: new Transpiler(),
    runtime: { Bun: polyfill.Bun, process: polyfill.process, console: polyfill.console },
    coreModules,
  })
}

describe('net/tls modules', () => {
  afterEach(() => {
    delete (globalThis as { __vitaminNetProxy?: NetProxyBridge }).__vitaminNetProxy
  })

  it('connect returns socket with basic methods', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const net = core.net as { connect: () => { on: () => void; write: () => void; end: () => void } }
    const socket = net.connect()
    expect(typeof socket.on).toBe('function')
    expect(typeof socket.write).toBe('function')
    expect(typeof socket.end).toBe('function')
  })

  it('connects via net proxy and relays data/close', () => {
    let nextSocketId = 1
    const handlers = new Map<number, Set<(event: NetProxyEvent) => void>>()
    const sendCalls: Array<{ socketId: number; data: Uint8Array }> = []
    const closeCalls: number[] = []
    const openCalls: Array<{ host: string; port: number; tls: boolean }> = []

    const proxy: NetProxyBridge = {
      open: (host, port, tls) => {
        openCalls.push({ host, port, tls })
        return nextSocketId++
      },
      send: (socketId, data) => {
        sendCalls.push({ socketId, data })
      },
      close: (socketId) => {
        closeCalls.push(socketId)
      },
      on: (socketId, handler) => {
        if (!handlers.has(socketId)) handlers.set(socketId, new Set())
        handlers.get(socketId)!.add(handler)
      },
      off: (socketId, handler) => {
        handlers.get(socketId)?.delete(handler)
      },
    }

    ;(globalThis as { __vitaminNetProxy?: NetProxyBridge }).__vitaminNetProxy = proxy

    const net = createNetModule()
    const socket = net.connect({ host: 'example.com', port: 8080 })

    const onConnect = vi.fn()
    const onReady = vi.fn()
    const onData = vi.fn()
    const onClose = vi.fn()

    socket.on('connect', onConnect)
    socket.on('ready', onReady)
    socket.on('data', onData)
    socket.on('close', onClose)

    const socketId = 1
    for (const handler of handlers.get(socketId) ?? []) {
      handler({ type: 'net:connected', socketId })
    }

    expect(onConnect).toHaveBeenCalledOnce()
    expect(onReady).toHaveBeenCalledOnce()
    expect(openCalls).toEqual([{ host: 'example.com', port: 8080, tls: false }])

    const payload = new Uint8Array([1, 2, 3])
    for (const handler of handlers.get(socketId) ?? []) {
      handler({ type: 'net:data', socketId, data: payload })
    }
    expect(onData).toHaveBeenCalledWith(payload)

    socket.write('ping')
    expect(sendCalls).toHaveLength(1)
    expect(sendCalls[0].socketId).toBe(socketId)
    expect(Array.from(sendCalls[0].data)).toEqual(Array.from(new TextEncoder().encode('ping')))

    socket.end()
    expect(closeCalls).toEqual([socketId])

    for (const handler of handlers.get(socketId) ?? []) {
      handler({ type: 'net:closed', socketId })
    }
    expect(onClose).toHaveBeenCalledOnce()
    expect(socket.destroyed).toBe(true)
    expect(socket.address()).toEqual({ address: '0.0.0.0', port: 0, family: 'IPv4' })
  })

  it('emits secureConnect for tls proxy connections', () => {
    let nextSocketId = 10
    const handlers = new Map<number, Set<(event: NetProxyEvent) => void>>()

    const proxy: NetProxyBridge = {
      open: () => nextSocketId++,
      send: () => {},
      close: () => {},
      on: (socketId, handler) => {
        if (!handlers.has(socketId)) handlers.set(socketId, new Set())
        handlers.get(socketId)!.add(handler)
      },
      off: (socketId, handler) => {
        handlers.get(socketId)?.delete(handler)
      },
    }

    ;(globalThis as { __vitaminNetProxy?: NetProxyBridge }).__vitaminNetProxy = proxy

    const tls = createTlsModule()
    const onSecure = vi.fn()
    const socket = tls.connect({ host: 'example.com', port: 443 }, onSecure)

    const socketId = 10
    for (const handler of handlers.get(socketId) ?? []) {
      handler({ type: 'net:connected', socketId })
    }

    expect(onSecure).toHaveBeenCalledOnce()
    expect((socket as { authorized?: boolean }).authorized).toBe(true)
    socket.end()
  })

  it('sets authorizationError when rejectUnauthorized is false', () => {
    const tls = createTlsModule()
    const socket = tls.connect({ host: 'example.com', port: 443, rejectUnauthorized: false })
    expect((socket as { authorized?: boolean }).authorized).toBe(false)
    expect((socket as { authorizationError?: Error }).authorizationError).toBeInstanceOf(Error)
  })

  it('resolves node:net and node:tls alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = { net: require('node:net'), tls: require('node:tls') }")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    const out = mod.exports as { net: { connect?: unknown }; tls: { connect?: unknown } }
    expect(out.net.connect).toBeTypeOf('function')
    expect(out.tls.connect).toBeTypeOf('function')
  })
})
