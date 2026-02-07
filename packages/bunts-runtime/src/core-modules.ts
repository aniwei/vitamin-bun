import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import { dirname, extname, join, normalizePath } from './path.js'
import type { RuntimePolyfill } from './polyfill.js'
import type { RuntimeCore } from './runtime-core.js'

export type CoreModuleMap = Record<string, unknown>

export function createCoreModules(
  vfs: VirtualFileSystem,
  runtime: RuntimePolyfill,
  runtimeCore?: RuntimeCore,
): CoreModuleMap {
  const fs = createFsModule(vfs)
  const fsPromises = createFsPromisesModule(vfs)
  const timers = createTimersModule()
  const timersPromises = createTimersPromisesModule()
  const events = createEventsModule()
  const crypto = createCryptoModule()
  const assert = createAssertModule()
  const util = createUtilModule()
  const stream = createStreamModule()
  const streamPromises = createStreamPromisesModule(stream)
  const os = createOsModule()
  const path = createPathModule()
  const buffer = createBufferModule()
  const url = createUrlModule()
  const querystring = createQuerystringModule()
  const stringDecoder = createStringDecoderModule()
  const perfHooks = createPerfHooksModule()
  const asyncHooks = createAsyncHooksModule()
  const scheduler = createSchedulerModule()
  const inspector = createInspectorModule()
  const moduleModule = createModuleModule(runtimeCore)
  const tty = createTtyModule()
  const constants = createConstantsModule()
  const punycode = createPunycodeModule()
  const assertStrict = createAssertStrictModule(assert)
  const diagnosticsChannel = createDiagnosticsChannelModule()

  return {
    fs,
    'fs/promises': fsPromises,
    timers,
    'timers/promises': timersPromises,
    events,
    crypto,
    assert,
    util,
    stream,
    'stream/promises': streamPromises,
    os,
    path,
    'path/posix': path,
    'path/win32': path,
    buffer,
    url,
    querystring,
    string_decoder: stringDecoder,
    perf_hooks: perfHooks,
    async_hooks: asyncHooks,
    scheduler,
    inspector,
    module: moduleModule,
    tty,
    constants,
    punycode,
    'assert/strict': assertStrict,
    diagnostics_channel: diagnosticsChannel,
    process: runtime.process,
  }
}

function createFsModule(vfs: VirtualFileSystem) {
  return {
    readFileSync(path: string, encoding?: string): string | Uint8Array {
      if (encoding === 'utf8' || encoding === 'utf-8') return vfs.readFile(path)
      return vfs.readFileBytes(path)
    },
    async readFile(path: string, encoding?: string): Promise<string | Uint8Array> {
      return this.readFileSync(path, encoding)
    },
    writeFileSync(path: string, data: string | Uint8Array): void {
      vfs.writeFile(path, data)
    },
    async writeFile(path: string, data: string | Uint8Array): Promise<void> {
      this.writeFileSync(path, data)
    },
    readdirSync(path: string): string[] {
      return vfs.readdir(path).map((e) => e.name)
    },
    async readdir(path: string): Promise<string[]> {
      return this.readdirSync(path)
    },
    existsSync(path: string): boolean {
      return vfs.exists(path)
    },
    statSync(path: string) {
      return createStats(vfs.stat(path))
    },
    async stat(path: string) {
      return this.statSync(path)
    },
    mkdirSync(path: string, options?: { recursive?: boolean }): void {
      if (options?.recursive) {
        vfs.mkdirp(path)
        return
      }
      vfs.mkdir(path)
    },
    async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
      this.mkdirSync(path, options)
    },
    rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void {
      removePath(vfs, path, options?.recursive ?? false, options?.force ?? false)
    },
    async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
      this.rmSync(path, options)
    },
  }
}

function createFsPromisesModule(vfs: VirtualFileSystem) {
  return {
    async readFile(path: string, encoding?: string): Promise<string | Uint8Array> {
      if (encoding === 'utf8' || encoding === 'utf-8') return vfs.readFile(path)
      return vfs.readFileBytes(path)
    },
    async writeFile(path: string, data: string | Uint8Array): Promise<void> {
      vfs.writeFile(path, data)
    },
    async readdir(path: string): Promise<string[]> {
      return vfs.readdir(path).map((e) => e.name)
    },
    async stat(path: string) {
      return createStats(vfs.stat(path))
    },
    async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
      if (options?.recursive) {
        vfs.mkdirp(path)
        return
      }
      vfs.mkdir(path)
    },
    async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
      removePath(vfs, path, options?.recursive ?? false, options?.force ?? false)
    },
  }
}

function createTimersModule() {
  return {
    setTimeout: (handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]) => {
      return setTimeout(handler, timeout, ...args)
    },
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    setInterval: (handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]) => {
      return setInterval(handler, timeout, ...args)
    },
    clearInterval: (id: ReturnType<typeof setInterval>) => clearInterval(id),
    setImmediate: (handler: (...args: unknown[]) => void, ...args: unknown[]) => {
      return setTimeout(handler, 0, ...args)
    },
    clearImmediate: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  }
}

function createTimersPromisesModule() {
  return {
    setTimeout: (timeout = 0, value?: unknown) =>
      new Promise<unknown>((resolve) => {
        setTimeout(() => resolve(value), timeout)
      }),
  }
}

function createPathModule() {
  const parse = (path: string) => {
    const normalized = normalizePath(path)
    const lastSlash = normalized.lastIndexOf('/')
    const base = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized
    const dir = lastSlash >= 0 ? normalized.slice(0, lastSlash) || '/' : ''
    const dot = base.lastIndexOf('.')
    const ext = dot > 0 ? base.slice(dot) : ''
    const name = dot > 0 ? base.slice(0, dot) : base
    return {
      root: normalized.startsWith('/') ? '/' : '',
      dir,
      base,
      ext,
      name,
    }
  }

  const format = (pathObject: { root?: string; dir?: string; base?: string; name?: string; ext?: string }) => {
    const dir = pathObject.dir ?? ''
    const base = pathObject.base ?? `${pathObject.name ?? ''}${pathObject.ext ?? ''}`
    if (!dir) return base
    return normalizePath(`${dir}/${base}`)
  }

  return {
    join: (...parts: string[]) => normalizePath(parts.join('/')),
    dirname,
    extname,
    resolve: (...parts: string[]) => normalizePath(parts.join('/')),
    normalize: normalizePath,
    isAbsolute: (path: string) => path.startsWith('/'),
    parse,
    format,
    basename: (path: string) => {
      const normalized = normalizePath(path)
      const idx = normalized.lastIndexOf('/')
      return idx >= 0 ? normalized.slice(idx + 1) : normalized
    },
  }
}

function createBufferModule() {
  class BufferClass {
    static from(arrayLike: ArrayLike<number>): Uint8Array
    static from<T>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => number, thisArg?: unknown): Uint8Array
    static from(elements: Iterable<number>): Uint8Array
    static from<T>(elements: Iterable<T>, mapfn?: (v: T, k: number) => number, thisArg?: unknown): Uint8Array
    static from(data: string | ArrayBuffer | Uint8Array, encoding?: 'utf8' | 'utf-8'): Uint8Array
    static from(data: unknown, mapfn?: unknown, thisArg?: unknown): Uint8Array {
      if (typeof data === 'string') {
        return new TextEncoder().encode(data)
      }
      if (data instanceof Uint8Array) return new Uint8Array(data)
      if (data instanceof ArrayBuffer) return new Uint8Array(data)
      if (data && typeof (data as Iterable<unknown>)[Symbol.iterator] === 'function') {
        return Uint8Array.from(data as Iterable<number>, mapfn as (v: number, k: number) => number, thisArg as unknown)
      }
      return Uint8Array.from(data as ArrayLike<number>, mapfn as (v: number, k: number) => number, thisArg as unknown)
    }

    static alloc(size: number, fill: number | string = 0): Uint8Array {
      const out = new Uint8Array(size)
      if (typeof fill === 'number') {
        out.fill(fill)
        return out
      }
      const bytes = new TextEncoder().encode(fill)
      if (bytes.length === 0) return out
      for (let i = 0; i < out.length; i += 1) {
        out[i] = bytes[i % bytes.length]
      }
      return out
    }

    static concat(list: Uint8Array[]): Uint8Array {
      const total = list.reduce((sum, item) => sum + item.byteLength, 0)
      const out = new Uint8Array(total)
      let offset = 0
      for (const item of list) {
        out.set(item, offset)
        offset += item.byteLength
      }
      return out
    }

  }

  return { Buffer: BufferClass }
}

function createUrlModule() {
  function pathToFileURL(path: string): URL {
    const normalized = path.startsWith('/') ? path : `/${path}`
    return new URL(`file://${normalized}`)
  }

  function fileURLToPath(url: string | URL): string {
    const value = typeof url === 'string' ? new URL(url) : url
    if (value.protocol !== 'file:') {
      throw new Error('Invalid file URL')
    }
    return decodeURIComponent(value.pathname)
  }

  return {
    URL,
    URLSearchParams,
    pathToFileURL,
    fileURLToPath,
  }
}

function createQuerystringModule() {
  function parse(input: string): Record<string, string> {
    const out: Record<string, string> = {}
    if (!input) return out
    const parts = input.split('&')
    for (const part of parts) {
      if (!part) continue
      const [rawKey, rawValue = ''] = part.split('=')
      const key = decodeURIComponent(rawKey.replace(/\+/g, ' '))
      const value = decodeURIComponent(rawValue.replace(/\+/g, ' '))
      out[key] = value
    }
    return out
  }

  function stringify(input: Record<string, unknown>): string {
    return Object.entries(input)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&')
  }

  return { parse, stringify }
}

function createStringDecoderModule() {
  class StringDecoder {
    private decoder: TextDecoder

    constructor(encoding = 'utf-8') {
      this.decoder = new TextDecoder(encoding)
    }

    write(buffer: Uint8Array): string {
      return this.decoder.decode(buffer, { stream: true })
    }

    end(buffer?: Uint8Array): string {
      if (buffer) return this.decoder.decode(buffer)
      return this.decoder.decode()
    }
  }

  return { StringDecoder }
}

function createPerfHooksModule() {
  const perf = globalThis.performance
    ? globalThis.performance
    : {
        now: () => Date.now(),
        timeOrigin: Date.now(),
      }

  return { performance: perf }
}

function createAsyncHooksModule() {
  function createHook() {
    return {
      enable() {
        return this
      },
      disable() {
        return this
      },
    }
  }

  return { createHook }
}

function createSchedulerModule() {
  return {
    now: () => (globalThis.performance ? globalThis.performance.now() : Date.now()),
    yield: () => Promise.resolve(),
  }
}

function createInspectorModule() {
  return {
    open: () => {},
    close: () => {},
    url: () => null,
  }
}

function createModuleModule(runtimeCore?: RuntimeCore) {
  const createRequire = (fromPath: string) => {
    if (!runtimeCore) {
      throw new Error('createRequire is not available without RuntimeCore')
    }
    return runtimeCore.createRequire(fromPath)
  }

  return { createRequire }
}

function createTtyModule() {
  class WriteStream {}
  class ReadStream {}

  return {
    isatty: () => false,
    WriteStream,
    ReadStream,
  }
}

function createConstantsModule() {
  return {
    S_IFREG: 0o100000,
    S_IFDIR: 0o040000,
  }
}

function createPunycodeModule() {
  function toASCII(domain: string): string {
    try {
      const url = new URL(`http://${domain}`)
      return url.hostname
    } catch {
      return domain
    }
  }

  function toUnicode(domain: string): string {
    try {
      const url = new URL(`http://${domain}`)
      return url.hostname
    } catch {
      return domain
    }
  }

  return { toASCII, toUnicode }
}

function createAssertStrictModule(assertModule: ReturnType<typeof createAssertModule>) {
  return assertModule
}

function createDiagnosticsChannelModule() {
  type Subscriber = (message: unknown) => void

  const createChannel = () => {
    const subscribers = new Set<Subscriber>()
    return {
      subscribe: (fn: Subscriber) => {
        subscribers.add(fn)
      },
      unsubscribe: (fn: Subscriber) => {
        subscribers.delete(fn)
      },
      publish: (message: unknown) => {
        for (const fn of subscribers) fn(message)
      },
    }
  }

  const channels = new Map<string, ReturnType<typeof createChannel>>()

  return {
    channel: (name: string) => {
      if (!channels.has(name)) {
        channels.set(name, createChannel())
      }
      return channels.get(name)!
    },
  }
}

function createEventsModule() {
  type Listener = (...args: unknown[]) => void

  class EventEmitter {
    private listeners = new Map<string, Set<Listener>>()

    on(event: string, listener: Listener): this {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set())
      }
      this.listeners.get(event)!.add(listener)
      return this
    }

    once(event: string, listener: Listener): this {
      const wrapper: Listener = (...args) => {
        this.off(event, wrapper)
        listener(...args)
      }
      return this.on(event, wrapper)
    }

    off(event: string, listener: Listener): this {
      this.listeners.get(event)?.delete(listener)
      return this
    }

    removeListener(event: string, listener: Listener): this {
      return this.off(event, listener)
    }

    emit(event: string, ...args: unknown[]): boolean {
      const set = this.listeners.get(event)
      if (!set || set.size === 0) return false
      for (const listener of Array.from(set)) {
        listener(...args)
      }
      return true
    }
  }

  const on = (emitter: EventEmitter, event: string, listener: Listener) => emitter.on(event, listener)
  const once = (emitter: EventEmitter, event: string, listener: Listener) => emitter.once(event, listener)

  return { EventEmitter, on, once }
}

function createCryptoModule() {
  const subtle = globalThis.crypto?.subtle

  function randomBytes(size: number): Uint8Array {
    const bytes = new Uint8Array(size)
    globalThis.crypto?.getRandomValues(bytes)
    return bytes
  }

  function createHash(algorithm: 'sha256' | 'sha1') {
    const chunks: Uint8Array[] = []
    return {
      update(data: string | Uint8Array): { digest: (encoding?: 'hex' | 'base64') => string } {
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
        chunks.push(bytes)
        return this
      },
      digest(encoding: 'hex' | 'base64' = 'hex'): string {
        const total = concatChunks(chunks)
        const digestPromise = subtle?.digest({ name: algorithm.toUpperCase() }, total)

        if (!digestPromise) {
          throw new Error('WebCrypto not available')
        }

        // Warning: sync API with async WebCrypto; this is a temporary shim.
        // For now, we block by throwing if not already resolved.
        // In practice, our tests will use async via helper below.
        throw new Error('createHash().digest is async in BunTS; use digestAsync()')
      },
      async digestAsync(encoding: 'hex' | 'base64' = 'hex'): Promise<string> {
        const total = concatChunks(chunks)
        const digestBuffer = await subtle!.digest({ name: algorithm.toUpperCase() }, total)
        const bytes = new Uint8Array(digestBuffer)
        return encoding === 'base64' ? toBase64(bytes) : toHex(bytes)
      },
    }
  }

  return { randomBytes, createHash, subtle }
}

function createAssertModule() {
  class AssertionError extends Error {
    constructor(message?: string) {
      super(message ?? 'Assertion failed')
      this.name = 'AssertionError'
    }
  }

  function fail(message?: string): never {
    throw new AssertionError(message)
  }

  function ok(value: unknown, message?: string): void {
    if (!value) fail(message)
  }

  function strictEqual(actual: unknown, expected: unknown, message?: string): void {
    if (actual !== expected) fail(message ?? `Expected ${String(actual)} to strictly equal ${String(expected)}`)
  }

  function notStrictEqual(actual: unknown, expected: unknown, message?: string): void {
    if (actual === expected) fail(message ?? `Expected ${String(actual)} to not strictly equal ${String(expected)}`)
  }

  function matchesError(err: unknown, matcher?: RegExp | ((error: unknown) => boolean) | (new (...args: unknown[]) => unknown)): boolean {
    if (!matcher) return true
    if (matcher instanceof RegExp) {
      return matcher.test((err as { message?: string })?.message ?? String(err))
    }
    if (typeof matcher === 'function') {
      if ('prototype' in matcher) {
        return err instanceof (matcher as new (...args: unknown[]) => unknown)
      }
      return (matcher as (error: unknown) => boolean)(err)
    }
    return false
  }

  function throws(fn: () => unknown, error?: RegExp | ((error: unknown) => boolean) | (new (...args: unknown[]) => unknown), message?: string): void {
    try {
      fn()
    } catch (err) {
      if (!matchesError(err, error)) {
        fail(message ?? 'Thrown error did not match assertion')
      }
      return
    }
    fail(message ?? 'Function did not throw')
  }

  async function rejects(
    promise: Promise<unknown> | (() => Promise<unknown>),
    error?: RegExp | ((error: unknown) => boolean) | (new (...args: unknown[]) => unknown),
    message?: string,
  ): Promise<void> {
    try {
      const target = typeof promise === 'function' ? promise() : promise
      await target
    } catch (err) {
      if (!matchesError(err, error)) {
        fail(message ?? 'Rejected error did not match assertion')
      }
      return
    }
    fail(message ?? 'Promise did not reject')
  }

  return { AssertionError, fail, ok, strictEqual, notStrictEqual, throws, rejects }
}

function createUtilModule() {
  function format(...args: unknown[]): string {
    if (args.length === 0) return ''
    const [first, ...rest] = args
    if (typeof first !== 'string') {
      return [inspect(first), ...rest.map((arg) => inspect(arg))].join(' ')
    }

    let index = 0
    const formatted = first.replace(/%[sdj%]/g, (token) => {
      if (token === '%%') return '%'
      if (index >= rest.length) return token
      const value = rest[index++]
      switch (token) {
        case '%s':
          return String(value)
        case '%d':
          return Number(value).toString()
        case '%j':
          try {
            return JSON.stringify(value)
          } catch {
            return '[Circular]'
          }
        default:
          return token
      }
    })

    const remaining = rest.slice(index).map((arg) => inspect(arg))
    return remaining.length ? `${formatted} ${remaining.join(' ')}` : formatted
  }

  function inspect(value: unknown): string {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
    if (value instanceof Date) return value.toISOString()
    if (value instanceof RegExp) return value.toString()
    if (Array.isArray(value)) return `[${value.map((item) => inspect(item)).join(', ')}]`
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
      const inner = entries.map(([k, v]) => `${k}: ${inspect(v)}`).join(', ')
      return `{ ${inner} }`
    }
    return String(value)
  }

  const types = {
    isDate: (value: unknown): value is Date => value instanceof Date,
    isRegExp: (value: unknown): value is RegExp => value instanceof RegExp,
    isPromise: (value: unknown): value is Promise<unknown> =>
      !!value && (typeof value === 'object' || typeof value === 'function') && typeof (value as Promise<unknown>).then === 'function',
  }

  return { format, inspect, types }
}

function createStats(stat: { kind: string } & Record<string, unknown>) {
  return {
    ...stat,
    isFile: () => stat.kind === 'file',
    isDirectory: () => stat.kind === 'directory',
  }
}

function removePath(vfs: VirtualFileSystem, path: string, recursive: boolean, force: boolean): void {
  if (!vfs.exists(path)) {
    if (force) return
    throw new Error(`ENOENT: ${path} not found`)
  }

  const stat = vfs.stat(path)
  if (stat.kind === 'directory') {
    if (recursive) {
      const entries = vfs.readdir(path)
      for (const entry of entries) {
        removePath(vfs, join(path, entry.name), true, force)
      }
    }
    vfs.rmdir(path)
    return
  }

  vfs.unlink(path)
}

function createStreamModule() {
  type Listener = (...args: unknown[]) => void

  class EventEmitter {
    private listeners = new Map<string, Set<Listener>>()

    on(event: string, listener: Listener): this {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set())
      }
      this.listeners.get(event)!.add(listener)
      return this
    }

    once(event: string, listener: Listener): this {
      const wrapper: Listener = (...args) => {
        this.off(event, wrapper)
        listener(...args)
      }
      return this.on(event, wrapper)
    }

    off(event: string, listener: Listener): this {
      this.listeners.get(event)?.delete(listener)
      return this
    }

    emit(event: string, ...args: unknown[]): boolean {
      const set = this.listeners.get(event)
      if (!set || set.size === 0) return false
      for (const listener of Array.from(set)) {
        listener(...args)
      }
      return true
    }
  }

  class Readable extends EventEmitter {
    push(chunk: unknown): void {
      if (chunk === null) {
        this.emit('end')
        return
      }
      this.emit('data', chunk)
    }
  }

  type WritableOptions = {
    write?: (chunk: unknown) => void
    final?: () => void
  }

  class Writable extends EventEmitter {
    private options: WritableOptions

    constructor(options: WritableOptions = {}) {
      super()
      this.options = options
    }

    write(chunk: unknown): boolean {
      this.options.write?.(chunk)
      this.emit('drain')
      return true
    }

    end(chunk?: unknown): void {
      if (chunk !== undefined) this.write(chunk)
      this.options.final?.()
      this.emit('finish')
    }
  }

  type TransformOptions = WritableOptions & {
    transform?: (chunk: unknown) => unknown
  }

  class Transform extends Readable {
    private options: TransformOptions

    constructor(options: TransformOptions = {}) {
      super()
      this.options = options
    }

    write(chunk: unknown): boolean {
      const out = this._transform ? this._transform(chunk) : this.options.transform?.(chunk)
      if (out !== undefined) this.push(out)
      this.emit('drain')
      return true
    }

    end(chunk?: unknown): void {
      if (chunk !== undefined) this.write(chunk)
      this.options.final?.()
      this.push(null)
      this.emit('finish')
    }

    _transform(chunk: unknown): unknown {
      return this.options.transform?.(chunk)
    }
  }

  function pipeline(...streams: Array<Readable | Writable | Transform>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (streams.length < 2) {
        resolve()
        return
      }

      for (let i = 0; i < streams.length - 1; i += 1) {
        const readable = streams[i] as Readable
        const writable = streams[i + 1] as Writable

        readable.on('data', (chunk: unknown) => {
          try {
            writable.write(chunk)
          } catch (err) {
            readable.emit('error', err)
          }
        })
        readable.on('end', () => writable.end())
        readable.on('error', (err) => {
          reject(err)
        })
        writable.on('error', (err) => {
          reject(err)
        })
      }

      const last = streams[streams.length - 1] as Writable
      last.on('finish', () => resolve())
    })
  }

  return { Readable, Writable, Transform, pipeline }
}

function createStreamPromisesModule(stream: { pipeline: (...streams: Array<unknown>) => Promise<void> }) {
  return {
    pipeline: (...streams: Array<unknown>) => stream.pipeline(...streams),
  }
}

function createOsModule() {
  return {
    platform: () => 'browser',
    arch: () => 'wasm',
    cpus: () => [],
    homedir: () => '/',
    tmpdir: () => '/tmp',
    EOL: '\n',
  }
}

function concatChunks(chunks: Uint8Array[]): ArrayBuffer {
  const size = chunks.reduce((sum, b) => sum + b.byteLength, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out.buffer
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}