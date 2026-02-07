import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import { createBunRuntime, type RuntimeEnv, type BunRuntimeHooks } from './bun-runtime'
import { createCoreModules } from './core-modules/index'
import { Transpiler } from './transpiler'
import { ModuleLoader } from './module-loader'

export interface EvaluatorOptions {
  vfs: VirtualFileSystem
  env?: RuntimeEnv
  onStdout?: (data: Uint8Array) => void
  onStderr?: (data: Uint8Array) => void
  runtimeHooks?: BunRuntimeHooks
}

export class Evaluator {
  private loader: ModuleLoader
  private polyfill: ReturnType<typeof createBunRuntime>

  constructor(options: EvaluatorOptions) {
    const stdout = options.onStdout ?? (() => {})
    const stderr = options.onStderr ?? (() => {})

    this.polyfill = createBunRuntime(options.vfs, options.env ?? {}, stdout, stderr, options.runtimeHooks)
    const coreModules = createCoreModules(options.vfs, this.polyfill)
    this.loader = new ModuleLoader({
      vfs: options.vfs,
      transpiler: new Transpiler(),
      runtime: {
        Bun: this.polyfill.Bun,
        process: this.polyfill.process,
        console: this.polyfill.console,
      },
      coreModules,
    })
  }

  async run(entry: string): Promise<void> {
    const module = await this.loader.load(entry)
    void module
  }

  get moduleLoader(): ModuleLoader {
    return this.loader
  }

  get runtime(): ReturnType<typeof createBunRuntime> {
    return this.polyfill
  }
}
