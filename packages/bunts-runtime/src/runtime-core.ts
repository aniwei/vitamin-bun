import { Evaluator } from './evaluator'
import { createCoreModules } from './core-modules/index'
import { bunInstall } from './bun-install'
import { Transpiler } from './transpiler'
import { ModuleLoader } from './module-loader'
import { createBunxRunner } from './bunx'
import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import type { ModuleRecord } from './module-loader'
import type { RuntimePlugin } from './runtime-plugins'
import type { BunSpawnOptions, BunSpawnResult, BunSpawnSyncResult } from './bun-runtime'

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
  private nextSpawnPid = 1
  private bunxRunner: ReturnType<typeof createBunxRunner>

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
        onSpawn: (spawnOptions) => this.spawn(spawnOptions),
        onSpawnSync: (spawnOptions) => this.spawnSync(spawnOptions),
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
    this.bunxRunner = createBunxRunner({
      vfs: options.vfs,
      runtime: evaluator.runtime,
      install: bunInstall,
      registryUrl:
        options.env?.BUN_INSTALL_REGISTRY ??
        options.env?.NPM_CONFIG_REGISTRY,
    })
  }

  async exec(command: string, args: string[]): Promise<number> {
    try {
      const parsed = this.parseCommand(command, args)
      command = parsed.command
      args = parsed.args
      return await this.runCommand(command, args)
    } catch (err) {
      const message = err instanceof Error ? err.stack ?? err.message : String(err)
      const encoder = new TextEncoder()
      this.options.onStderr?.(encoder.encode(message + '\n'))
      return 1
    }
  }

  private async runCommand(command: string, args: string[]): Promise<number> {
    switch (command) {
      case 'bun':
        return await this.runBunCommand(args)
      case 'bunx':
        return await this.execBunx(args)
      default:
        return await this.runEntryCommand(command, args)
    }
  }

  private async runBunCommand(args: string[]): Promise<number> {
    const subcommand = args[0] ?? 'run'
    switch (subcommand) {
      case 'run':
        return await this.runBunScript(args.slice(1))
      case 'install': {
        this.evaluator.runtime.process.argv = ['bun', 'install', ...args.slice(1)]
        const registryUrl =
          this.options.env?.BUN_INSTALL_REGISTRY ??
          this.options.env?.NPM_CONFIG_REGISTRY
        const progressPrefix = '__BUN_INSTALL_PROGRESS__ '
        const emitProgress = (payload: Record<string, unknown>) => {
          this.evaluator.runtime.process.stdout.write(
            `${progressPrefix}${JSON.stringify(payload)}\n`,
          )
        }

        await bunInstall({
          vfs: this.options.vfs,
          cwd: this.evaluator.runtime.process.cwd(),
          registryUrl,
          stdout: (message) => this.evaluator.runtime.process.stdout.write(message),
          stderr: (message) => this.evaluator.runtime.process.stderr.write(message),
          onProgress: (info) => emitProgress({ type: 'progress', ...info }),
          onPackageCount: (info) => emitProgress({ type: 'count', ...info }),
          onDownloadProgress: (info) => emitProgress({ type: 'download', ...info }),
        })

        return 0
      }
      case 'build':
        return this.reportUnsupportedCli('bun build')
      case 'test':
        return this.reportUnsupportedCli('bun test')
      case 'update':
        return this.reportUnsupportedCli('bun update')
      case 'create':
        return this.reportUnsupportedCli('bun create')
      case 'pm':
        return this.reportUnsupportedCli('bun pm')
      case 'x':
      case 'bunx':
        return await this.execBunx(args.slice(1))
      default:
        return await this.runEntryCommand('bun', args)
    }
  }

  private async runBunScript(args: string[]): Promise<number> {
    const scriptName = args[0]
    
    if (!scriptName) {
      return await this.runEntryCommand('bun', ['run', '/index.ts'])
    }

    const extraArgs = args.slice(1)

    const cwd = this.evaluator.runtime.process.cwd()
    const pkgPath = this.findPackageJsonPath(cwd)
    if (pkgPath) {
      try {
        const pkg = JSON.parse(this.options.vfs.readFile(pkgPath)) as {
          scripts?: Record<string, string>
        }

        const script = pkg.scripts?.[scriptName]
        if (script) {
          return await this.runScriptCommand(script, extraArgs)
        }

      } catch {
        // fall through to entry resolution
      }
    }

    return await this.runEntryCommand('bun', ['run', ...args])
  }

  private async runScriptCommand(script: string, extraArgs: string[] = []): Promise<number> {
    const tokens = tokenizeArgString(script)
    const combined = [...tokens, ...extraArgs]
    if (combined.length === 0) {
      return 0
    }

    const command = combined[0]
    const rest = combined.slice(1)
    const localBin = this.resolveLocalBin(command)

    switch (true) {
      case command === 'bun':
        return await this.runBunCommand(rest)
      case command === 'bunx':
        return await this.execBunx(rest)
      case Boolean(localBin):
        return await this.runEntryCommand(localBin!, rest)
      case command.startsWith('.') ||
        command.startsWith('/') ||
        command.endsWith('.js') ||
        command.endsWith('.ts'):
        return await this.runEntryCommand(command, rest)
      default:
        return await this.execBunx([command, ...rest])
    }
  }

  private async runEntryCommand(command: string, args: string[]): Promise<number> {
    const entry = this.resolveEntry(command, args)
    const extraArgs = this.extractExtraArgs(command, args)
    this.evaluator.runtime.process.argv = ['bun', 'run', entry, ...extraArgs]
    await this.evaluator.run(entry)
    return 0
  }

  private extractExtraArgs(command: string, args: string[]): string[] {
    if (command === 'bun') {
      if (args[0] === 'run') return args.slice(2)
      return args.slice(1)
    }
    return args.slice(1)
  }

  private parseCommand(
    command: string,
    args: string[],
  ): { command: string; args: string[] } {
    const trimmed = command.trim()
    if (!trimmed.includes(' ')) {
      return { command: trimmed, args }
    }

    const tokens = tokenizeArgString(trimmed)
    if (tokens.length === 0) {
      return { command: trimmed, args }
    }
    return {
      command: tokens[0],
      args: [...tokens.slice(1), ...args],
    }
  }

  private spawn(options: BunSpawnOptions): BunSpawnResult {
    const pid = this.nextSpawnPid++
    const exited = new Promise<number>((resolve) => {
      void this.execWithCapture(options).then((result) => {
        resolve(result.exitCode)
        spawnResult.stdout = result.stdout
        spawnResult.stderr = result.stderr
      })
    })

    const spawnResult: BunSpawnResult = {
      pid,
      stdout: new Uint8Array(),
      stderr: new Uint8Array(),
      exited,
    }

    return spawnResult
  }

  private spawnSync(options: BunSpawnOptions): BunSpawnSyncResult {
    const result = this.execWithCaptureSync(options)
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    }
  }

  private async execWithCapture(
    options: BunSpawnOptions,
  ): Promise<{ exitCode: number; stdout: Uint8Array; stderr: Uint8Array }> {
    const stdoutChunks: Uint8Array[] = []
    const stderrChunks: Uint8Array[] = []
    const runtime = this.evaluator.runtime
    const originalStdout = runtime.process.stdout.write
    const originalStderr = runtime.process.stderr.write
    const originalEnv = runtime.process.env

    runtime.process.env = { ...originalEnv, ...(options.env ?? {}) }
    
    runtime.process.stdout.write = (data: string | Uint8Array) => {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
      stdoutChunks.push(bytes)
      originalStdout(data)
    }

    runtime.process.stderr.write = (data: string | Uint8Array) => {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
      stderrChunks.push(bytes)
      originalStderr(data)
    }

    try {
      const exitCode = await this.exec(options.cmd[0] ?? 'bun', options.cmd.slice(1))
      return {
        exitCode,
        stdout: concatBuffers(stdoutChunks),
        stderr: concatBuffers(stderrChunks),
      }
    } finally {
      runtime.process.stdout.write = originalStdout
      runtime.process.stderr.write = originalStderr
      runtime.process.env = originalEnv
    }
  }

  private execWithCaptureSync(
    options: BunSpawnOptions,
  ): { exitCode: number; stdout: Uint8Array; stderr: Uint8Array } {
    const runtime = this.evaluator.runtime
    const stdoutChunks: Uint8Array[] = []
    const stderrChunks: Uint8Array[] = []
    const originalStdout = runtime.process.stdout.write
    const originalStderr = runtime.process.stderr.write
    const originalEnv = runtime.process.env

    runtime.process.env = { ...originalEnv, ...(options.env ?? {}) }
    runtime.process.stdout.write = (data: string | Uint8Array) => {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
      stdoutChunks.push(bytes)
      originalStdout(data)
    }
    runtime.process.stderr.write = (data: string | Uint8Array) => {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
      stderrChunks.push(bytes)
      originalStderr(data)
    }

    let exitCode = 0
    try {
      const entry = this.resolveEntry(options.cmd[0] ?? 'bun', options.cmd.slice(1))
      runtime.process.argv = ['bun', 'run', entry]
      this.loadSync(entry)
    } catch (err) {
      exitCode = 1
      const message = err instanceof Error ? err.stack ?? err.message : String(err)
      this.options.onStderr?.(new TextEncoder().encode(message + '\n'))
    } finally {
      runtime.process.stdout.write = originalStdout
      runtime.process.stderr.write = originalStderr
      runtime.process.env = originalEnv
    }

    return {
      exitCode,
      stdout: concatBuffers(stdoutChunks),
      stderr: concatBuffers(stderrChunks),
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

  private reportUnsupportedCli(command: string): number {
    const message = `${command} is not available in the browser runtime yet.\n`
    this.evaluator.runtime.process.stderr.write(message)

    return 1
  }

  private async execBunx(args: string[]): Promise<number> {
    const result = await this.bunxRunner.exec(args)

    if (!result.entry || result.exitCode !== 0 || !result.name) {
      return result.exitCode
    }

    this.evaluator.runtime.process.argv = ['bun', 'x', result.name, ...(result.rest ?? [])]
    await this.evaluator.run(result.entry)
    return 0
  }

  private findPackageJsonPath(start: string): string | null {
    let current = start.startsWith('/') ? start : `/${start}`

    while (true) {
      const normalized = current.endsWith('/') ? current.slice(0, -1) : current
      const candidate = `${normalized || ''}/package.json`

      if (this.options.vfs.exists(candidate)) return candidate
      if (normalized === '' || normalized === '/') return null
      
      const parts = normalized.split('/').filter(Boolean)
      parts.pop()
      current = parts.length === 0 ? '/' : `/${parts.join('/')}`
    }
  }

  private resolveLocalBin(command: string): string | null {
    if (!command || command.includes('/')) return null

    const cwd = this.evaluator.runtime.process.cwd()
    let current = cwd.startsWith('/') ? cwd : `/${cwd}`

    while (true) {
      const normalized = current.endsWith('/') ? current.slice(0, -1) : current
      const binPath = `${normalized || ''}/node_modules/.bin/${command}`

      if (this.options.vfs.exists(binPath)) return binPath
      if (normalized === '' || normalized === '/') return null
      
      const parts = normalized.split('/').filter(Boolean)
      parts.pop()
      current = parts.length === 0 ? '/' : `/${parts.join('/')}`
    }
  }
}

function concatBuffers(buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of buffers) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

function tokenizeArgString(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escape = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] ?? ''
    if (escape) {
      current += char
      escape = false
      continue
    }

    if (char === '\\') {
      escape = true
      continue
    }

    if (char === '"' || char === "'") {
      if (quote === char) {
        quote = null
      } else if (!quote) {
        quote = char
      } else {
        current += char
      }
      continue
    }

    if (!quote && /\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (escape) {
    current += '\\'
  }

  if (current.length > 0) {
    tokens.push(current)
  }

  return tokens
}
