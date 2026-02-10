import { ModuleLoader } from './vitamin-module'
import { createBunRuntime, type RuntimeEnv, type BunRuntimeHooks } from './vitamin-runtime'
import { PluginManager, type RuntimePlugin } from './runtime-plugins'
import { createCoreModules } from './core-modules/index'
import { Transpiler } from './transpiler'
import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'

export interface EvaluatorOptions {
  vfs: VirtualFileSystem
  env?: RuntimeEnv
  onStdout?: (data: Uint8Array) => void
  onStderr?: (data: Uint8Array) => void
  runtimeHooks?: BunRuntimeHooks
  plugins?: RuntimePlugin[]
  pluginTrace?: boolean
}

export class Evaluator {
  private loader: ModuleLoader
  private bunRuntime: ReturnType<typeof createBunRuntime>
  private runtimeHooks?: BunRuntimeHooks
  private pluginManager: PluginManager

  constructor(options: EvaluatorOptions) {
    const stdout = options.onStdout ?? (() => {})
    const stderr = options.onStderr ?? (() => {})

    this.runtimeHooks = options.runtimeHooks
    const envVars = options.env?.env ?? {}
    this.pluginManager = new PluginManager(options.vfs, envVars, { trace: options.pluginTrace })
    this.bunRuntime = createBunRuntime(options.vfs, options.env ?? {}, stdout, stderr, options.runtimeHooks, this.pluginManager)
    this.pluginManager.setRuntime(this.bunRuntime)
    const coreModules = createCoreModules(options.vfs, this.bunRuntime)
    this.loader = new ModuleLoader({
      vfs: options.vfs,
      transpiler: new Transpiler(),
      runtime: {
        Bun: this.bunRuntime.Bun,
        process: this.bunRuntime.process,
        console: this.bunRuntime.console,
      },
      coreModules,
      hooks: {
        onModuleResolve: async (id, parent) => {
          const result = await this.pluginManager.runModuleResolve(id, parent)
          return result ?? undefined
        },
        onModuleRequest: async (id, parent) => {
          const result = await this.pluginManager.runModuleLoad(id, parent)
          if (result) return result
          return this.runtimeHooks?.onModuleRequest?.(id, parent)
        },
        onModuleLoadError: (error, id, parent) => {
          this.runtimeHooks?.onModuleLoadError?.(error, id, parent)
        },
      },
    })

    for (const plugin of options.plugins ?? []) {
      this.pluginManager.register(plugin)
    }
    
    void this.pluginManager.init()
  }

  async run(entry: string): Promise<void> {
    const module = await this.loader.load(entry)
    void module
  }

  get moduleLoader(): ModuleLoader {
    return this.loader
  }

  get runtime(): ReturnType<typeof createBunRuntime> {
    return this.bunRuntime
  }

  async dispose(): Promise<void> {
    await this.pluginManager.dispose()
  }
}
