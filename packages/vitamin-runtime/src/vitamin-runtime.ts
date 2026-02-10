import { SimpleEmitter } from './shared/simple-emitter'
import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import type { PluginManager, RuntimePlugin } from './runtime-plugins'

export interface RuntimeEnv {
  env?: Record<string, string>
  cwd?: string
  argv?: string[]
}

export type ServeHandler = (request: Request) => Response | Promise<Response>

export interface ServeOptions {
  fetch: ServeHandler
  port?: number
  hostname?: string
  tls?: boolean
}

export interface ServeHandle {
  port: number
  hostname?: string
  stop: () => void
  reload?: () => void
  ref?: () => void
  unref?: () => void
}

export interface RuntimeHooks {
  onServeRegister?: (port: number) => void
  onServeUnregister?: (port: number) => void
  onModuleRequest?: (id: string, parent?: string) => { id?: string; exports?: Record<string, unknown> } | void
  onModuleLoadError?: (error: Error, id: string, parent?: string) => void
  onSpawn?: (options: SpawnOptions) => SpawnResult
  onSpawnSync?: (options: SpawnOptions) => SpawnSyncResult
}

export type SpawnOptions = {
  cmd: string[]
  env?: Record<string, string>
}

export type SpawnResult = {
  pid: number
  stdout: Uint8Array
  stderr: Uint8Array
  exited: Promise<number>
}

export type SpawnSyncResult = {
  exitCode: number
  stdout: Uint8Array
  stderr: Uint8Array
}

export interface VitaminRuntime {
  Vitamin: {
    env: Record<string, string>
    plugin: (plugin: RuntimePlugin) => void
    plugins: RuntimePlugin[]
    file: (path: string) => {
      text: () => Promise<string>
      json: () => Promise<unknown>
      arrayBuffer: () => Promise<ArrayBuffer>
      bytes: () => Promise<Uint8Array>
      stream: () => ReadableStream<Uint8Array>
      exists: () => Promise<boolean>
      delete: () => Promise<void>
      writer: (options?: FileSinkOptions) => FileSink
    }
    write: (path: string, data: string | Uint8Array | ArrayBuffer | Blob | Response | ReadableStream<Uint8Array>) => Promise<void>
    serve: (options: ServeOptions) => ServeHandle
    spawn: (options: SpawnOptions) => SpawnResult
    spawnSync: (options: SpawnOptions) => SpawnSyncResult
    __dispatchServeRequest: (request: Request) => Promise<Response>
  }
  process: {
    env: Record<string, string>
    argv: string[]
    execArgv: string[]
    execPath: string
    cwd: () => string
    chdir: (path: string) => void
    platform: string
    arch: string
    version: string
    versions: Record<string, string>
    pid: number
    ppid: number
    uptime: () => number
    hrtime: {
      (time?: [number, number]): [number, number]
      bigint: () => bigint
    }
    stdout: { write: (data: string | Uint8Array) => void }
    stderr: { write: (data: string | Uint8Array) => void }
    stdin: {
      isTTY: boolean
      read: () => null
      resume: () => void
      pause: () => void
      on: (event: string, listener: (...args: unknown[]) => void) => void
    }
    exitCode?: number
    exit: (code?: number) => void
    emitWarning: (warning: string | Error) => void
    on: (event: string, listener: (...args: unknown[]) => void) => void
    once: (event: string, listener: (...args: unknown[]) => void) => void
    off: (event: string, listener: (...args: unknown[]) => void) => void
    emit: (event: string, ...args: unknown[]) => boolean
    nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => void
  }
  console: Console
}

export function createVitaminRuntime(
  vfs: VirtualFileSystem,
  env: RuntimeEnv,
  onStdout: (data: Uint8Array) => void,
  onStderr: (data: Uint8Array) => void,
  hooks: RuntimeHooks = {},
  pluginManager?: PluginManager,
): VitaminRuntime {
  const encoder = new TextEncoder()
  const servers = new Map<number, ServeHandler>()
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

  const vitaminEnv = { ...(env.env ?? {}) }
  let currentCwd = env.cwd ?? '/'
  const processEmitter = new SimpleEmitter()
  let processExitCode: number | undefined
  const startTime = Date.now()

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

  const serve = (options: ServeOptions): ServeHandle => {
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
    Vitamin: {
      env: vitaminEnv,
      plugin(plugin: RuntimePlugin) {
        pluginManager?.register(plugin)
      },
      get plugins() {
        return pluginManager?.list() ?? []
      },
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
          async bytes() {
            return vfs.readFileBytes(path)
          },
          stream() {
            const bytes = vfs.readFileBytes(path)
            return new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(bytes)
                controller.close()
              },
            })
          },
          async exists() {
            return vfs.exists(path)
          },
          async delete() {
            vfs.unlink(path)
          },
          writer(options?: FileSinkOptions) {
            return new FileSink(vfs, path, options)
          },
        }
      },
      async write(
        path: string,
        data: string | Uint8Array | ArrayBuffer | Blob | Response | ReadableStream<Uint8Array>,
      ) {
        const payload = await normalizeWriteData(data)
        vfs.writeFile(path, payload)
      },
      serve,
      spawn(options: SpawnOptions) {
        if (!hooks.onSpawn) {
          console.warn('Vitamin.spawn is not available in this runtime')
          return {
            pid: -1,
            stdout: new Uint8Array(),
            stderr: new Uint8Array(),
            exited: Promise.resolve(1),
          }
        }
        return hooks.onSpawn(options)
      },
      spawnSync(options: SpawnOptions) {
        if (!hooks.onSpawnSync) {
          console.warn('Vitamin.spawnSync is not available in this runtime')
          return {
            exitCode: 1,
            stdout: new Uint8Array(),
            stderr: new Uint8Array(),
          }
        }
        return hooks.onSpawnSync(options)
      },
      __dispatchServeRequest: dispatchServeRequest,
    },
    process: {
      env: vitaminEnv,
      argv: env.argv ?? [],
      execArgv: [],
      execPath: 'vitamin',
      cwd: () => currentCwd,
      chdir: (path: string) => {
        currentCwd = path
      },
      platform: 'browser',
      arch: 'wasm',
      version: '0.0.0',
      versions: {
        vitamin: '0.0.0',
        node: '0.0.0',
      },
      pid: 1,
      ppid: 0,
      uptime: () => (Date.now() - startTime) / 1000,
      hrtime: Object.assign(
        (time?: [number, number]): [number, number] => {
          const origin = (globalThis.performance?.timeOrigin ?? startTime)
          const now = globalThis.performance?.now ? globalThis.performance.now() : Date.now() - origin
          const seconds = Math.floor(now / 1000)
          const nanoseconds = Math.floor((now % 1000) * 1e6)
          if (!time) return [seconds, nanoseconds]
          let diffSeconds = seconds - time[0]
          let diffNanos = nanoseconds - time[1]
          if (diffNanos < 0) {
            diffSeconds -= 1
            diffNanos += 1e9
          }
          return [diffSeconds, diffNanos]
        },
        {
          bigint: () => {
            const origin = (globalThis.performance?.timeOrigin ?? startTime)
            const now = globalThis.performance?.now ? globalThis.performance.now() : Date.now() - origin
            return BigInt(Math.floor(now * 1e6))
          },
        },
      ),
      stdout,
      stderr,
      stdin: {
        isTTY: false,
        read: () => null,
        resume: () => {},
        pause: () => {},
        on: () => {},
      },
      get exitCode() {
        return processExitCode
      },
      set exitCode(value: number | undefined) {
        processExitCode = value
      },
      exit: (code = 0) => {
        const exitCode = Number(code)
        const record = Number.isNaN(exitCode) ? 0 : exitCode
        processExitCode = record
        processEmitter.emit('exit', record)
      },
      emitWarning: (warning: string | Error) => {
        const message = warning instanceof Error ? warning.message : warning
        console.warn(message)
      },
      on: (event: string, listener: (...args: unknown[]) => void) => {
        processEmitter.on(event, listener)
      },
      once: (event: string, listener: (...args: unknown[]) => void) => {
        processEmitter.once(event, listener)
      },
      off: (event: string, listener: (...args: unknown[]) => void) => {
        processEmitter.off(event, listener)
      },
      emit: (event: string, ...args: unknown[]) => processEmitter.emit(event, ...args),
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
      profile: () => {},
      profileEnd: () => {},
      Console:
        (globalThis.console as unknown as { Console?: Console['Console'] })?.Console ??
        (function Console() {} as unknown as Console['Console']),
    },
  }
}

type FileSinkOptions = {
  append?: boolean
  highWaterMark?: number
}

async function normalizeWriteData(
  data: string | Uint8Array | ArrayBuffer | Blob | Response | ReadableStream<Uint8Array>,
): Promise<string | Uint8Array> {
  if (typeof data === 'string' || data instanceof Uint8Array) {
    return data
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }

  if (isReadableStream(data)) {
    return await readReadableStream(data)
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

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  if (!value || typeof value !== 'object') return false
  return typeof (value as ReadableStream<Uint8Array>).getReader === 'function'
}

class FileSink {
  private chunks: Uint8Array[] = []
  private closed = false
  private bufferedBytes = 0
  private readyPromise: Promise<void> = Promise.resolve()
  private readyResolve: (() => void) | null = null
  private append: boolean
  private highWaterMark: number

  constructor(
    private vfs: VirtualFileSystem,
    private path: string,
    options: FileSinkOptions = {},
  ) {
    this.append = options.append ?? false
    this.highWaterMark = options.highWaterMark ?? 64 * 1024
  }

  get ready() {
    return this.readyPromise
  }

  async write(chunk: string | Uint8Array | ArrayBuffer | Blob): Promise<boolean> {
    if (this.closed) throw new Error('FileSink is closed')
      
    const data = await normalizeWriteChunk(chunk)
    this.chunks.push(data)
    this.bufferedBytes += data.byteLength

    if (this.bufferedBytes > this.highWaterMark) {
      if (!this.readyResolve) {
        this.readyPromise = new Promise<void>((resolve) => {
          this.readyResolve = resolve
        })
      }
      return false
    }
    return true
  }

  flush() {
    if (this.closed) return
    if (this.chunks.length === 0) return
    let payload = concatChunks(this.chunks)
    if (this.append) {
      const existing = this.vfs.exists(this.path)
        ? this.vfs.readFileBytes(this.path)
        : new Uint8Array(0)
      payload = concatChunks([existing, payload])
    }
    this.vfs.writeFile(this.path, payload)
    this.chunks = []
    this.bufferedBytes = 0
    if (this.readyResolve) {
      this.readyResolve()
      this.readyResolve = null
      this.readyPromise = Promise.resolve()
    }
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
