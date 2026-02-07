import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'

export interface RuntimeEnv {
  env?: Record<string, string>
  cwd?: string
  argv?: string[]
}

export type BunServeHandler = (request: Request) => Response | Promise<Response>

export interface BunServeOptions {
  fetch: BunServeHandler
  port?: number
  hostname?: string
  tls?: boolean
}

export interface BunServeHandle {
  port: number
  hostname?: string
  stop: () => void
}

export interface BunRuntimeHooks {
  onServeRegister?: (port: number) => void
  onServeUnregister?: (port: number) => void
}

export interface BunRuntime {
  Bun: {
    env: Record<string, string>
    file: (path: string) => {
      text: () => Promise<string>
      json: () => Promise<unknown>
      arrayBuffer: () => Promise<ArrayBuffer>
    }
    write: (path: string, data: string | Uint8Array) => Promise<void>
    serve: (options: BunServeOptions) => BunServeHandle
    __dispatchServeRequest: (request: Request) => Promise<Response>
  }
  process: {
    env: Record<string, string>
    argv: string[]
    cwd: () => string
    platform: string
    arch: string
    version: string
    versions: Record<string, string>
    stdout: { write: (data: string | Uint8Array) => void }
    stderr: { write: (data: string | Uint8Array) => void }
    nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => void
  }
  console: Console
}

export function createBunRuntime(
  vfs: VirtualFileSystem,
  env: RuntimeEnv,
  onStdout: (data: Uint8Array) => void,
  onStderr: (data: Uint8Array) => void,
  hooks: BunRuntimeHooks = {},
): BunRuntime {
  const encoder = new TextEncoder()
  const servers = new Map<number, BunServeHandler>()
  const onServeRegister = hooks.onServeRegister
  const onServeUnregister = hooks.onServeUnregister

  const stdout = {
    write(data: string | Uint8Array) {
      const bytes = typeof data === 'string' ? encoder.encode(data) : data
      onStdout(bytes)
    },
  }

  const stderr = {
    write(data: string | Uint8Array) {
      const bytes = typeof data === 'string' ? encoder.encode(data) : data
      onStderr(bytes)
    },
  }

  const bunEnv = { ...(env.env ?? {}) }

  const nextTickQueue: Array<() => void> = []
  let nextTickScheduled = false
  const scheduleNextTick = () => {
    if (nextTickScheduled) return
    nextTickScheduled = true
    const enqueue = typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (cb: () => void) => Promise.resolve().then(cb)
    enqueue(() => {
      nextTickScheduled = false
      const tasks = nextTickQueue.splice(0)
      for (const task of tasks) {
        task()
      }
      if (nextTickQueue.length > 0) {
        scheduleNextTick()
      }
    })
  }

  const serve = (options: BunServeOptions): BunServeHandle => {
    const port = options.port ?? 3000
    servers.set(port, options.fetch)
    onServeRegister?.(port)

    return {
      port,
      hostname: options.hostname,
      stop: () => {
        servers.delete(port)
        onServeUnregister?.(port)
      },
    }
  }

  const dispatchServeRequest = async (request: Request): Promise<Response> => {
    const port = getPortFromUrl(request.url)
    const handler = servers.get(port)
    if (!handler) {
      return new Response('Not Found', { status: 404 })
    }
    return await handler(request)
  }

  return {
    Bun: {
      env: bunEnv,
      file(path: string) {
        return {
          async text() {
            return vfs.readFile(path)
          },
          async json() {
            const text = vfs.readFile(path)
            return JSON.parse(text)
          },
          async arrayBuffer() {
            const bytes = vfs.readFileBytes(path)
            return bytes.slice().buffer
          },
        }
      },
      async write(path: string, data: string | Uint8Array) {
        vfs.writeFile(path, data)
      },
      serve,
      __dispatchServeRequest: dispatchServeRequest,
    },
    process: {
      env: bunEnv,
      argv: env.argv ?? [],
      cwd: () => env.cwd ?? '/',
      platform: 'browser',
      arch: 'wasm',
      version: 'v0.0.0-bunts',
      versions: {
        bunts: '0.0.0',
      },
      stdout,
      stderr,
      nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => {
        nextTickQueue.push(() => callback(...args))
        scheduleNextTick()
      },
    },
    console: {
      log: (...args: unknown[]) => stdout.write(args.join(' ') + '\n'),
      info: (...args: unknown[]) => stdout.write(args.join(' ') + '\n'),
      warn: (...args: unknown[]) => stderr.write(args.join(' ') + '\n'),
      error: (...args: unknown[]) => stderr.write(args.join(' ') + '\n'),
      debug: (...args: unknown[]) => stdout.write(args.join(' ') + '\n'),
      trace: (...args: unknown[]) => stderr.write(args.join(' ') + '\n'),
      clear: () => {},
      dir: (...args: unknown[]) => stdout.write(args.join(' ') + '\n'),
      dirxml: (...args: unknown[]) => stdout.write(args.join(' ') + '\n'),
      assert: (condition?: boolean, ...args: unknown[]) => {
        if (!condition) stderr.write(args.join(' ') + '\n')
      },
      count: () => {},
      countReset: () => {},
      group: () => {},
      groupCollapsed: () => {},
      groupEnd: () => {},
      table: (...args: unknown[]) => stdout.write(args.join(' ') + '\n'),
      time: () => {},
      timeEnd: () => {},
      timeLog: () => {},
      timeStamp: () => {},
    },
  }
}

function getPortFromUrl(url: string): number {
  try {
    const parsed = new URL(url)
    return parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80
  } catch {
    return 80
  }
}
