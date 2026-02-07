import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import { createPolyfill, type RuntimeEnv } from './polyfill.js'
import { createCoreModules } from './core-modules.js'
import { Transpiler } from './transpiler.js'
import { ModuleLoader } from './module-loader.js'

export interface EvaluatorOptions {
  vfs: VirtualFileSystem
  env?: RuntimeEnv
  onStdout?: (data: Uint8Array) => void
  onStderr?: (data: Uint8Array) => void
}

export class Evaluator {
  private loader: ModuleLoader
  private polyfill: ReturnType<typeof createPolyfill>

  constructor(options: EvaluatorOptions) {
    const stdout = options.onStdout ?? (() => {})
    const stderr = options.onStderr ?? (() => {})

    this.polyfill = createPolyfill(options.vfs, options.env ?? {}, stdout, stderr)
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

  get runtime(): ReturnType<typeof createPolyfill> {
    return this.polyfill
  }
}
