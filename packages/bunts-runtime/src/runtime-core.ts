import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import { Evaluator } from './evaluator.js'
import { createCoreModules } from './core-modules.js'
import { Transpiler } from './transpiler.js'
import { ModuleLoader } from './module-loader.js'
import type { ModuleRecord } from './module-loader.js'

export interface RuntimeCoreOptions {
  vfs: VirtualFileSystem
  env?: Record<string, string>
  onStdout?: (data: Uint8Array) => void
  onStderr?: (data: Uint8Array) => void
}

export class RuntimeCore {
  private evaluator: Evaluator
  private options: RuntimeCoreOptions
  private loader: ModuleLoader

  constructor(options: RuntimeCoreOptions) {
    this.options = options
    const stdout = options.onStdout ?? (() => {})
    const stderr = options.onStderr ?? (() => {})
    const evaluator = new Evaluator({
      vfs: options.vfs,
      env: {
        env: options.env ?? {},
        cwd: '/',
        argv: [],
      },
      onStdout: stdout,
      onStderr: stderr,
    })
    this.evaluator = evaluator
    const coreModules = createCoreModules(options.vfs, evaluator.runtime, this)
    this.loader = new ModuleLoader({
      vfs: options.vfs,
      transpiler: new Transpiler(),
      runtime: {
        Bun: evaluator.runtime.Bun,
        process: evaluator.runtime.process,
        console: evaluator.runtime.console,
      },
      coreModules,
    })
  }

  async exec(command: string, args: string[]): Promise<number> {
    try {
      const entry = this.resolveEntry(command, args)
      this.evaluator.runtime.process.argv = ['bun', 'run', entry]
      await this.evaluator.run(entry)
      return 0
    } catch (err) {
      const message = err instanceof Error ? err.stack ?? err.message : String(err)
      const encoder = new TextEncoder()
      this.options.onStderr?.(encoder.encode(message + '\n'))
      return 1
    }
  }

  createRequire(fromPath: string): (id: string) => unknown {
    return (id: string) => {
      const record = this.loadSync(id, fromPath)
      return record.exports
    }
  }

  loadSync(entry: string, parent?: string): ModuleRecord {
    return this.loader.loadSync(entry, parent)
  }

  private resolveEntry(command: string, args: string[]): string {
    if (command === 'bun') {
      if (args[0] === 'run') {
        return args[1] ?? '/index.ts'
      }
      return args[0] ?? '/index.ts'
    }
    return command
  }
}
