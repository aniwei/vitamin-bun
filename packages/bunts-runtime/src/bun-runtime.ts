import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import type { PluginManager, RuntimePlugin } from './runtime-plugins'

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
  reload?: () => void
  ref?: () => void
  unref?: () => void
}

export interface BunRuntimeHooks {
  onServeRegister?: (port: number) => void
  onServeUnregister?: (port: number) => void
  onModuleLoad?: (id: string, parent?: string) => { id?: string; exports?: Record<string, unknown> } | void
}

export interface BunRuntime {
  Bun: {
    env: Record<string, string>
    plugin: (plugin: RuntimePlugin) => void
    plugins: RuntimePlugin[]
    file: (path: string) => {
      text: () => Promise<string>
      json: () => Promise<unknown>
      arrayBuffer: () => Promise<ArrayBuffer>
      bytes: () => Promise<Uint8Array>
      exists: () => Promise<boolean>
      delete: () => Promise<void>
      writer: () => FileSink
    }
    write: (path: string, data: string | Uint8Array | ArrayBuffer | Blob | Response) => Promise<void>
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
  pluginManager?: PluginManager,
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
      reload: () => {},
      ref: () => {},
      unref: () => {},
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
      plugin(plugin: RuntimePlugin) {
        pluginManager?.register(plugin)
      },
      get plugins() {
        return pluginManager?.list() ?? []
      },
      file(path: string) {
        const sink = new FileSink(vfs, path)
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
          async bytes() {
            return vfs.readFileBytes(path)
          },
          async exists() {
            return vfs.exists(path)
          },
          async delete() {
            vfs.unlink(path)
          },
          writer() {
            return sink
          },
        }
      },
      async write(path: string, data: string | Uint8Array | ArrayBuffer | Blob | Response) {
        const payload = await normalizeWriteData(data)
        vfs.writeFile(path, payload)
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

async function normalizeWriteData(
  data: string | Uint8Array | ArrayBuffer | Blob | Response,
): Promise<string | Uint8Array> {
  if (typeof data === 'string' || data instanceof Uint8Array) {
    return data
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }

  if (data instanceof Response) {
    if (data.body) {
      return await readReadableStream(data.body)
    }
    return new Uint8Array(await data.arrayBuffer())
  }

  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer())
  }

  return String(data)
}

class FileSink {
  private chunks: Uint8Array[] = []
  private closed = false

  constructor(private vfs: VirtualFileSystem, private path: string) {}

  async write(chunk: string | Uint8Array | ArrayBuffer | Blob) {
    if (this.closed) throw new Error('FileSink is closed')
    const data = await normalizeWriteChunk(chunk)
    this.chunks.push(data)
  }

  flush() {
    if (this.closed) return
    if (this.chunks.length === 0) return
    const payload = concatChunks(this.chunks)
    this.vfs.writeFile(this.path, payload)
    this.chunks = []
  }

  end() {
    if (this.closed) return
    this.flush()
    this.closed = true
  }

  close() {
    this.end()
  }
}

async function normalizeWriteChunk(
  chunk: string | Uint8Array | ArrayBuffer | Blob,
): Promise<Uint8Array> {
  if (typeof chunk === 'string') {
    return new TextEncoder().encode(chunk)
  }
  if (chunk instanceof Uint8Array) {
    return chunk
  }
  if (chunk instanceof ArrayBuffer) {
    return new Uint8Array(chunk)
  }
  return new Uint8Array(await chunk.arrayBuffer())
}

async function readReadableStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return concatChunks(chunks)
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 0) return new Uint8Array(0)
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

function getPortFromUrl(url: string): number {
  try {
    const parsed = new URL(url)
    return parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80
  } catch {
    return 80
  }
}
