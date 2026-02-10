import { ModuleLoader } from './vitamin-module'
import { createVitaminRuntime, type RuntimeEnv, type RuntimeHooks } from './vitamin-runtime'
import { PluginManager, type RuntimePlugin } from './runtime-plugins'
import { createCoreModules } from './core-modules/index'
import { Transpiler } from './transpiler'
import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'

export interface EvaluatorOptions {
  vfs: VirtualFileSystem
  env?: RuntimeEnv
  onStdout?: (data: Uint8Array) => void
  onStderr?: (data: Uint8Array) => void
  runtimeHooks?: RuntimeHooks
  plugins?: RuntimePlugin[]
  pluginTrace?: boolean
}

export class Evaluator {
  private loader: ModuleLoader
  private vitaminRuntime: ReturnType<typeof createVitaminRuntime>
  private runtimeHooks?: RuntimeHooks
  private pluginManager: PluginManager

  constructor(options: EvaluatorOptions) {
    const stdout = options.onStdout ?? (() => {})
    const stderr = options.onStderr ?? (() => {})

    this.runtimeHooks = options.runtimeHooks
    const envVars = options.env?.env ?? {}
    this.pluginManager = new PluginManager(options.vfs, envVars, { trace: options.pluginTrace })
    this.vitaminRuntime = createVitaminRuntime(options.vfs, options.env ?? {}, stdout, stderr, options.runtimeHooks, this.pluginManager)
    this.pluginManager.setRuntime(this.vitaminRuntime)
    const coreModules = createCoreModules(options.vfs, this.vitaminRuntime)
    this.loader = new ModuleLoader({
      vfs: options.vfs,
      transpiler: new Transpiler(),
      runtime: {
        Vitamin: this.vitaminRuntime.Vitamin,
        process: this.vitaminRuntime.process,
        console: this.vitaminRuntime.console,
      },
      coreModules,
      hooks: {
        onResolve: async (id, parent) => {
          const result = await this.pluginManager.runModuleResolve(id, parent)
          return result ?? undefined
        },
        onError: (error, id, parent) => {
          this.runtimeHooks?.onModuleError?.(error, id, parent)
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

  get runtime(): ReturnType<typeof createVitaminRuntime> {
    return this.vitaminRuntime
  }

  async dispose(): Promise<void> {
    await this.pluginManager.dispose()
  }
}
