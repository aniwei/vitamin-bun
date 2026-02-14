import invariant from 'invariant'
import { MainChannel, MixinPendingTask, PendingTask } from '@vitamin-ai/shared'
import { SABBridge } from './sab-bridge'
import { ServiceChannel } from './service'
import type {
  BootServiceFS,
  EventMessage,
  IncomingMessage,
  OutgoingMessage,
  ResponseMessage,
  RuntimeOptions,
  StreamMessage,
  VfsSnapshot
} from './types'

export class BootService extends MixinPendingTask(MainChannel as any) implements BootServiceFS {
  #sabBridge: SABBridge | null = null
  get sabBridge() {
    invariant(this.#sabBridge, 'SABBridge is not initialized')
    return this.#sabBridge
  }

  #allowedHosts: Set<string> | null
  get allowedHosts() {
    invariant(this.#allowedHosts, 'Allowed hosts is not defined')
    return this.#allowedHosts
  }

  #service: ServiceChannel | null = null
  get service() {
    invariant(this.#service, 'Service channel is not initialized')
    return this.#service
  }

  constructor(name: string, private options: RuntimeOptions) {
    const { allowedHosts, workerUrl } = options

    const scriptUrl = workerUrl
      ? new URL(workerUrl)
      : new URL('./worker.ts', import.meta.url)

    super(name, scriptUrl)

    this.#allowedHosts = allowedHosts 
      ? new Set(allowedHosts) 
      : null

    this.on('message', this.onMessage.bind(this))
  }

  private isHostAllowed(host: string): boolean {
    if (!this.allowedHosts) return true
    return this.allowedHosts.has(host)
  }

  private response(msg: ResponseMessage): void {
    const pendingTask = this.pendingTasks.get(msg.id)
    if (!pendingTask) {
      console.warn(`No pending task for response with id ${msg.id}`)
    } else if (msg.payload) {
      pendingTask.resolve(msg.payload)
    }
  }
    

  private stream(msg: StreamMessage): void {
    const pendingTask = this.pendingTasks.get(msg.id) as PendingTask
    if (!pendingTask) {
      console.warn(`No pending task for response with id ${msg.id}`)
    } else if (pendingTask.forward) {
      pendingTask.forward(msg)
    } else {
      switch (msg.type) {
        case 'stream:chunk':
          pendingTask.chunks = pendingTask.chunks ?? []
          pendingTask.chunks.push(msg.chunk)
          break
        case 'stream:end': {
          const data = pendingTask.chunks && pendingTask.chunks.length > 0 ? concatChunks(pendingTask.chunks) : new Uint8Array(0)
          pendingTask.resolve(data)
          break
        }
        case 'stream:error':
          pendingTask.reject(new Error(msg.message))
          break
      }
    }
  }

  private onMessage(data: unknown): void {
    const msg = data as OutgoingMessage
    
    switch (msg.type) {
      case 'response': 
        this.response(msg as ResponseMessage)
        break;
      case 'stream:chunk':
      case 'stream:end': 
      case 'stream:error': 
        this.stream(msg as StreamMessage)
        break
      case 'event': {
        const { name, ...rest } = (msg as EventMessage).payload || {}
        this.emit(name, rest)
        break
      }
      default:
        console.warn('Unknown message from worker:', msg)
    }
  }

  async readFile(path: string, encoding?: string): Promise<string | Uint8Array> {
    return this.forwardTo<string | Uint8Array>({
      type: 'vfs:read',
      filename: path,
      encoding
    }).then(data => {
      if (encoding === 'utf8' || encoding === 'utf-8') {
        return new TextDecoder().decode(data as Uint8Array)
      }

      return data as Uint8Array
    })
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<boolean> {
    return this.forwardTo<boolean>({
      type: 'vfs:write',
      path,
      content
    })
  }

  async mkdir(path: string): Promise<boolean> {
    return this.forwardTo<boolean>({
      type: 'vfs:mkdir',
      path
    })
  }

  async readdir(path: string): Promise<string[]> {
    return this.forwardTo<string[]>({
      type: 'vfs:readdir',
      path
    })
  }

  async unlink(path: string): Promise<boolean> {
    return this.forwardTo<boolean>({
      type: 'vfs:unlink',
      path
    })
  }

  async rename(from: string, to: string): Promise<boolean> {
    return this.forwardTo<boolean>({
      type: 'vfs:rename',
      from,
      to
    })
  }

  async exists(path: string): Promise<boolean> {
    return this.forwardTo<boolean>({
      type: 'vfs:exists',
      path
    })
  }

  async save(): Promise<VfsSnapshot> {
    return this.forwardTo<VfsSnapshot>({
      type: 'vfs:save',
    })
  }

  async restore(snapshot: VfsSnapshot): Promise<boolean> {
    return this.forwardTo<boolean>({
      type: 'vfs:restore',
      snapshot
    })
  }

  async request(url: string, options?: RequestInit): Promise<Response> {
    if (!this.isHostAllowed(new URL(url).host)) {
      throw new Error(`Host not allowed: ${new URL(url).host}`)
    }

    return this.forwardTo<Response>({
      type: 'fetch',
      url,
      options
    }, 30000)
  }

  private onService(data: unknown): void {
    const msg = data as IncomingMessage
    switch (msg.type) {
      case 'serve:request': {
        break
      }
      case 'vfs:request':
        this.readFile((msg as any).filename)
        break
    
      default:
        console.warn('Unknown message from service:', data)

    }
  }

  private async register(): Promise<void> {
    const service = new ServiceChannel(this.name)
    service.on('service', this.onService.bind(this))

    await service.register()
    this.#service = service
  }

  kill(): Promise<void> {
    return this.forwardTo<void>({
      type: 'kill'
    })
  }

  exec(command: string, args: string[] = []): Promise<number> {
    const id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)

    return this.forwardTo<void>({ 
      type: 'exec', 
      id,
      command, 
      args
    }).then(() => {
      return id
    })
  }

  async start(files: Record<string, string> = {}): Promise<void> {
    if (this.options.crossOriginIsolated ?? crossOriginIsolated) {
      this.#sabBridge = new SABBridge()
    }

    await super.start()
    this.post({
      type: 'start',
      files,
      env: this.options.env,
      sab: this.sabBridge
    })    

    await this.register()
  }

  dispose(): void {
    super.dispose()
    this.sabBridge?.stopListening()
  }
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
