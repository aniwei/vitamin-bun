import { Evaluator } from './evaluator'
import { createCoreModules } from './core-modules/index'
import { bunInstall } from './bun-install'
import { Transpiler } from './transpiler'
import { ModuleLoader } from './module-loader'
import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import type { ModuleRecord } from './module-loader'
import type { RuntimePlugin } from './runtime-plugins'

export interface RuntimeCoreOptions {
  vfs: VirtualFileSystem
  env?: Record<string, string>
  onStdout?: (data: Uint8Array) => void
  onStderr?: (data: Uint8Array) => void
  onServeRegister?: (port: number) => void
  onServeUnregister?: (port: number) => void
  onModuleLoad?: (id: string, parent?: string) => { id?: string; exports?: Record<string, unknown> } | void
  plugins?: RuntimePlugin[]
  pluginTrace?: boolean
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
      runtimeHooks: {
        onServeRegister: options.onServeRegister,
        onServeUnregister: options.onServeUnregister,
        onModuleLoad: options.onModuleLoad,
      },
      plugins: options.plugins,
      pluginTrace: options.pluginTrace,
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
      if (command === 'bun' && args[0] === 'install') {
        this.evaluator.runtime.process.argv = ['bun', 'install', ...args.slice(1)]
        const registryUrl =
          this.options.env?.BUN_INSTALL_REGISTRY ??
          this.options.env?.NPM_CONFIG_REGISTRY
        await bunInstall({
          vfs: this.options.vfs,
          cwd: this.evaluator.runtime.process.cwd(),
          registryUrl,
          stdout: (message) => this.evaluator.runtime.process.stdout.write(message),
          stderr: (message) => this.evaluator.runtime.process.stderr.write(message),
        })
        return 0
      }
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

  async dispatchServeRequest(request: Request): Promise<Response> {
    return await this.evaluator.runtime.Bun.__dispatchServeRequest(request)
  }

  async dispose(): Promise<void> {
    await this.evaluator.dispose()
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
