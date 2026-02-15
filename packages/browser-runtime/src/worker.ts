import invariant from 'invariant'
import { RuntimeCore } from '@vitamin-ai/vitamin-runtime'
import { VirtualFileSystem, InodeKind } from '@vitamin-ai/virtual-fs'
import { bytesToBase64, base64ToBytes, WorkerChannelPort, encoder } from '@vitamin-ai/shared'
import { IncomingMessage, VfsSnapshot } from './types'
import { ModuleSourceLoader } from './module-source-loader'

declare const self: DedicatedWorkerGlobalScope

function walkVfs(fs: VirtualFileSystem, dir: string, out: Record<string, string>): void {
  const entries = fs.readdir(dir)

  for (const entry of entries) {
    const next = dir === '/' 
      ? `/${entry.name}` 
      : `${dir}/${entry.name}`

    if (entry.kind === InodeKind.Directory) {
      walkVfs(fs, next, out)
    } else if (entry.kind === InodeKind.File) {
      out[next] = bytesToBase64(fs.readFileBytes(next))
    }
  }
}

class Runner extends WorkerChannelPort {
  #runtime: RuntimeCore | null = null
  get runtime() {
    if (!this.#runtime) {
      throw new Error('Runtime is not initialized')
    }
    return this.#runtime
  }

  #vfs: VirtualFileSystem | null = null
  get vfs() {
    invariant(this.#vfs, 'VFS is not initialized')
    return this.#vfs
  }

  #moduleSourceLoader: ModuleSourceLoader | null = null
  get moduleSourceLoader() {
    invariant(this.#moduleSourceLoader, 'Module source loader is not initialized')
    return this.#moduleSourceLoader
  }

  constructor() {
    super()
    this.on('message', this.onMessage.bind(this))
  }

  private writeVfs(path: string, content: Uint8Array): void {
    if (!this.vfs) return
    const lastSlash = path.lastIndexOf('/')
    if (lastSlash > 0) {
      this.vfs.mkdirp(path.substring(0, lastSlash))
    }
    this.vfs.writeFile(path, content)
  }

  private exit(id: number, code: number): void {
    this.post({ type: 'event', id, payload: { name: 'exit', code } })
  }

  private throwError(message: string): void {
    this.post({ type: 'error', message })
  }

  private exitWithError(id: number, message: string): void {
    this.throwError(message)
    this.exit(id, 1)
  }

  private async exec(pid: number, command: string, args: string[]): Promise<void> {
    try {
      const exitCode = await this.runtime.exec(command, args)
      this.exit(pid, exitCode)
    } catch (err) {
      this.exitWithError(pid, `Failed to execute command, details: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private kill(id: number): void {
    this.exit(id, 137)
  }

  private async processVfsRequest(id: number, filename: string): Promise<void> {
    try {
      if (this.vfs.exists(filename)) {
        const content = this.vfs.readFile(filename)
        const compiled = await this.runtime.compile(content, this.guessLoader(filename), filename)

        this.post({ type: 'response', id, stream: true })
        this.post({ type: 'stream:chunk', id, chunk: encoder.encode(compiled.code) })
        this.post({ type: 'stream:end', id })
      } else {
        this.throwError(`File not found: ${filename}`)
      }
    } catch (err) {
      this.throwError(`Failed to handle VFS request, details: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async processModuleRequest(id: number, moduleId: string, parent?: string): Promise<void> {
    try {
      const loaded = await this.moduleSourceLoader.load(moduleId, parent)
      this.post({ type: 'response', id, stream: true })
      this.post({ type: 'stream:chunk', id, chunk: encoder.encode(loaded.code) })
      this.post({ type: 'stream:end', id })
    } catch (err) {
      this.throwError(`Failed to handle module request, details: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private guessLoader(path: string): string {
    if (path.endsWith('.ts')) return 'ts'
    if (path.endsWith('.tsx')) return 'tsx'
    if (path.endsWith('.jsx')) return 'jsx'
    if (path.endsWith('.mjs')) return 'mjs'
    if (path.endsWith('.cjs')) return 'cjs'
    if (path.endsWith('.json')) return 'json'
    return 'js'
  }

  private async processServeRequest(
    id: number,
    url: string,
    method: string,
    headers: Record<string, string>,
    body: Uint8Array | null
  ): Promise<void> {
    try {
      const content = body
        ? body.slice().buffer as ArrayBuffer 
        : undefined

      const request = new Request(url, {
        method,
        headers,
        body: content
      })

      const response = await this.runtime.dispatchServeRequest(request)
      const h: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })

      const message = {
        type: 'serve:response',
        id,
        status: response.status,
        headers: h,
        body: null,
        stream: false
      }

      if (!response.body) {
        this.post(message)
      } else {
        const reader = response.body.getReader()
        this.post({
          ...message,
          stream: true
        })

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            this.post({ type: 'serve:chunk', id, chunk: value })
          }
        }

        this.post({ type: 'serve:end', id })
      }
    } catch (err) {
      this.post({ 
        type: 'serve:error', 
        id, 
        message: String(err) 
      })
    }
  }

  private start(files: Record<string, string>, env?: Record<string, string>, sab?: SharedArrayBuffer): void {
    try {
      this.#vfs = new VirtualFileSystem({
        onCreate: (event) => this.post({ 
          type: 'event',
          payload: {
            name: 'vfs:create', 
            path: event.path, 
            kind: event.kind 
          }
        }),
        onDelete: (event) => this.post({ 
          type: 'event',
          payload: {
            name: 'vfs:delete', 
            path: event.path, 
            kind: event.kind 
          }
        }),
        onMove: (event) => this.post({ 
          type: 'event',
          payload: {
            name: 'vfs:move', 
            from: event.from, 
            to: event.to, 
            kind: event.kind 
          }
        })
      })

      const encoder = new TextEncoder()

      for (const [path, content] of Object.entries(files ?? {})) {
        this.writeVfs(path, encoder.encode(content))
      }

      this.#runtime = new RuntimeCore({
        vfs: this.vfs,
        env: {
          HOME: '/',
          PATH: '/usr/local/bin:/usr/bin:/bin',
          TERM: 'xterm-256color',
          VITAMIN_MODULE_PREFIX: env?.VITAMIN_MODULE_PREFIX ?? `/@/${this.name}/module/`,
          ...(env ?? {}),
        },
        onStdout: (data: Uint8Array) => this.post({ 
          type: 'event',
          payload: { name: 'stdout', data }
        }),
        onStderr: (data: Uint8Array) => this.post({ 
          type: 'event',
          payload: { name: 'stderr', data }
        }),
        onServeRegister: (port: number) => this.post({ 
          type: 'event',
          payload: { name: 'serve:register', port }
        }),
        onServeUnregister: (port: number) => this.post({ 
          type: 'event',
          payload: { name: 'serve:unregister', port }
        }),
      })
      this.#moduleSourceLoader = new ModuleSourceLoader(this.vfs, this.runtime)
    } catch (err) {
      this.throwError(`Failed to create runtime core, details: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private processVfsWrite(id: number, path: string, content: string | Uint8Array): void {
    try {
      const bytes = typeof content === 'string' ? base64ToBytes(content) : content
      this.writeVfs(path, bytes)
      this.post({ type: 'response', id, payload: true })
    } catch (err) {
      this.throwError(`Failed to write to VFS, details: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private processVfsMkdir(id: number, path: string): void {
    try {
      this.vfs.mkdirp(path)
      this.post({ type: 'response', id, payload: true })
    } catch (err) {
      this.throwError(`Failed to create directory in VFS, details: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private processVfsReaddir(id: number, path: string): void {
    try {
      const entries = this.vfs.readdir(path).map(e => ({
        name: e.name,
        kind: e.kind
      }))
      this.post({ type: 'response', id, payload: entries })
    } catch (err) {
      this.throwError(`Failed to read directory in VFS, details: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private processVfsUnlink(id: number, path: string): void {
    try {
      this.vfs.unlink(path)
      this.post({ type: 'response', id, payload: true })
    } catch (err) {
      this.throwError(`Failed to unlink in VFS, details: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private processVfsRename(id: number, from: string, to: string): void {
    try {
      this.vfs.rename(from, to)
      this.post({ type: 'response', id, payload: true })
    } catch (err) {
      this.throwError(`Failed to rename in VFS, details: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private processFsExists(id: number, path: string): void {
    try {
      const exists = this.vfs.exists(path)
      this.post({ type: 'response', id, payload: exists })
    } catch (err) {
      this.throwError(`Failed to check existence in VFS, details: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private processVfsDump(id: number): void {
    try {
      const dump: Record<string, string> = {}
      walkVfs(this.vfs, '/', dump)
      this.post({ type: 'response', id, payload: dump })
    } catch (err) {
      this.throwError(`Failed to dump VFS, details: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private processVfsRestore(id: number, snapshot: VfsSnapshot): void {
    try {
      const files = snapshot.files ?? {}
      for (const [path, content] of Object.entries(files)) {
        this.writeVfs(path, encoder.encode(content))
      }

      this.post({ type: 'response', id, payload: true })
    } catch (err) {
      this.throwError(`Failed to restore VFS, details: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async onMessage(event: unknown): Promise<void> {
    const msg = event as IncomingMessage

    switch (msg.type) {
      case 'start':
        await this.start(msg.files, msg.env, msg.sab)
        break
      case 'exec':
        await this.exec(msg.pid, msg.command, msg.args)
        break
      case 'kill':
        await this.kill(msg.id)
        break
      case 'serve:request':
        await this.processServeRequest(msg.id, msg.url, msg.method, msg.headers, msg.body)
        break
      case 'vfs:read':
        await this.processVfsRequest(msg.id, msg.filename)
        break
      case 'vfs:request':
        await this.processVfsRequest(msg.id, msg.filename)
        break
      case 'module:request':
        await this.processModuleRequest(msg.id, msg.module, msg.parent)
        break
      case 'vfs:write':
        await this.processVfsWrite(msg.id, msg.path, msg.content)
        break
      case 'vfs:mkdir':
        await this.processVfsMkdir(msg.id, msg.path)
        break
      case 'vfs:readdir':
        await this.processVfsReaddir(msg.id, msg.path)
        break
      case 'vfs:unlink':
        await this.processVfsUnlink(msg.id, msg.path)
        break
      case 'vfs:rename':
        await this.processVfsRename(msg.id, msg.from, msg.to)
        break
      case 'vfs:exists':
        await this.processFsExists(msg.id, msg.path)
        break
      case 'vfs:dump':
        await this.processVfsDump(msg.id)
        break
      case 'vfs:restore':
        await this.processVfsRestore(msg.id, msg.snapshot)
        break
      default:
        this.throwError(`Unknown message type: ${(msg as { type: string }).type}`)
    }
  }
}

new Runner()

