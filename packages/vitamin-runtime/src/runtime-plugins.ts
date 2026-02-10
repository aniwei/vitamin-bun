import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import type { VitaminRuntime } from './vitamin-runtime'

export type MaybePromise<T> = T | Promise<T>

export type ModuleResolveResult = {
  id?: string
  stop?: boolean
}

export type ModuleLoadResult = {
  id?: string
  exports?: Record<string, unknown>
  stop?: boolean
}

export type PluginLogger = {
  debug: (message: string) => void
  warn: (message: string) => void
}

export type PluginContext = {
  vfs: VirtualFileSystem
  runtime: VitaminRuntime
  env: Record<string, string>
  logger: PluginLogger
}

export interface RuntimePlugin {
  name: string
  version?: string
  priority?: number
  onRuntimeInit?: (ctx: PluginContext) => MaybePromise<void>
  onRuntimeDispose?: (ctx: PluginContext) => MaybePromise<void>
  onModuleResolve?: (ctx: PluginContext, id: string, parent?: string) => MaybePromise<ModuleResolveResult | void>
  onModuleRequest?: (ctx: PluginContext, id: string, parent?: string) => MaybePromise<ModuleLoadResult | void>
}

export type PluginManagerOptions = {
  logger?: PluginLogger
  trace?: boolean
}

const defaultLogger: PluginLogger = {
  debug: (message: string) => console.debug(message),
  warn: (message: string) => console.warn(message),
}

export class PluginManager {
  private plugins: RuntimePlugin[] = []
  private runtime: VitaminRuntime | null = null
  private vfs: VirtualFileSystem
  private env: Record<string, string>
  private logger: PluginLogger
  private trace: boolean
  private initialized = false

  constructor(vfs: VirtualFileSystem, env: Record<string, string>, options: PluginManagerOptions = {}) {
    this.vfs = vfs
    this.env = env
    this.logger = options.logger ?? defaultLogger
    this.trace = options.trace ?? false
  }

  setRuntime(runtime: VitaminRuntime): void {
    this.runtime = runtime
  }

  register(plugin: RuntimePlugin): void {
    this.plugins.push(plugin)
    this.sortPlugins()
    if (this.runtime && this.initialized && plugin.onRuntimeInit) {
      void this.safeCall(() => plugin.onRuntimeInit!(this.context()), plugin, 'onRuntimeInit')
    }
  }

  list(): RuntimePlugin[] {
    return [...this.plugins]
  }

  async init(): Promise<void> {
    if (!this.runtime) return
    if (this.initialized) return
    this.initialized = true
    
    for (const plugin of this.plugins) {
      if (plugin.onRuntimeInit) {
        await this.safeCall(() => plugin.onRuntimeInit!(this.context()), plugin, 'onRuntimeInit')
      }
    }
  }

  async dispose(): Promise<void> {
    if (!this.runtime) return
    for (const plugin of [...this.plugins].reverse()) {
      if (plugin.onRuntimeDispose) {
        await this.safeCall(() => plugin.onRuntimeDispose!(this.context()), plugin, 'onRuntimeDispose')
      }
    }
    this.initialized = false
  }

  async runModuleResolve(id: string, parent?: string): Promise<ModuleResolveResult | null> {
    let currentId = id
    for (const plugin of this.plugins) {
      if (!plugin.onModuleResolve) continue
      const result = await this.safeCall(() => plugin.onModuleResolve!(this.context(), currentId, parent), plugin, 'onModuleResolve')
      if (!result) continue
      if (result.id) currentId = result.id
      if (result.stop) return { ...result, id: currentId }
    }
    return currentId !== id ? { id: currentId } : null
  }

  async runModuleLoad(id: string, parent?: string): Promise<ModuleLoadResult | null> {
    let currentId = id
    for (const plugin of this.plugins) {
      if (!plugin.onModuleRequest) continue
      const result = await this.safeCall(() => plugin.onModuleRequest!(this.context(), currentId, parent), plugin, 'onModuleRequest')
      if (!result) continue
      if (result.id) currentId = result.id
      if (result.exports) {
        return { ...result, id: currentId, stop: true }
      }
      if (result.stop) return { ...result, id: currentId }
    }
    return currentId !== id ? { id: currentId } : null
  }

  private context(): PluginContext {
    if (!this.runtime) {
      throw new Error('Runtime not initialized for PluginManager')
    }
    return {
      vfs: this.vfs,
      runtime: this.runtime,
      env: this.env,
      logger: this.logger,
    }
  }

  private sortPlugins(): void {
    this.plugins.sort((a, b) => {
      const pa = a.priority ?? 0
      const pb = b.priority ?? 0
      if (pa !== pb) return pb - pa
      return a.name.localeCompare(b.name)
    })
  }

  private async safeCall<T>(fn: () => MaybePromise<T>, plugin: RuntimePlugin, hook: string): Promise<T | null> {
    try {
      if (this.trace) {
        this.logger.debug(`[plugin:${plugin.name}] ${hook}`)
      }
      return await fn()
    } catch (err) {
      this.logger.warn(`[plugin:${plugin.name}] ${hook} failed: ${String(err)}`)
      return null
    }
  }
}
