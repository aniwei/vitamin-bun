import * as ts from 'typescript'
import { Evaluator } from './evaluator'
import { createInternalModules } from './internal-modules/index'
import { install } from './vitamin-install'
import { parseAddArgs } from './vitamin-add/cli'
import { runAddFlow } from './vitamin-add/add-flow'
import { Transpiler } from './transpiler'
import { ModuleLoader } from './vitamin-module'
import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import type { ModuleRecord } from './vitamin-module'
import type { RuntimePlugin } from './runtime-plugins'
import type { SpawnOptions, SpawnResult, SpawnSyncResult } from './vitamin-runtime'

export interface RuntimeCoreOptions {
  vfs: VirtualFileSystem
  env?: Record<string, string>
  onStdout?: (data: Uint8Array) => void
  onStderr?: (data: Uint8Array) => void
  onServeRegister?: (port: number) => void
  onServeUnregister?: (port: number) => void
  onModuleRequest?: (id: string, parent?: string) => { id?: string; exports?: Record<string, unknown> } | void
  onModuleError?: (error: Error, id: string, parent?: string) => void
  plugins?: RuntimePlugin[]
  pluginTrace?: boolean
}

export class RuntimeCore {
  private evaluator: Evaluator
  private options: RuntimeCoreOptions
  private transpiler: Transpiler
  private loader: ModuleLoader
  private nextSpawnPid = 1

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
        onModuleRequest: options.onModuleRequest,
        onModuleError: options.onModuleError,
        onSpawn: (spawnOptions) => this.spawn(spawnOptions),
        onSpawnSync: (spawnOptions) => this.spawnSync(spawnOptions),
      },
      plugins: options.plugins,
      pluginTrace: options.pluginTrace,
    })
    this.evaluator = evaluator
    const internalModules = createInternalModules(options.vfs, evaluator.runtime, this)
    this.transpiler = new Transpiler({
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      prefix: options.env?.VITAMIN_MODULE_PREFIX,
    })
    this.loader = new ModuleLoader({
      vfs: options.vfs,
      transpiler: this.transpiler,
      runtime: {
        Vitamin: evaluator.runtime.Vitamin,
        process: evaluator.runtime.process,
        console: evaluator.runtime.console,
      },
      internalModules,
    })
  }

  async compile(source: string, loader: string, fileName?: string) {
    return this.transpiler.compile(source, loader as any, fileName)
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
      case 'vitamin':
        return await this.runVitaminCommand(args)
      default:
        return await this.runEntryCommand(command, args)
    }
  }

  private async runVitaminCommand(args: string[]): Promise<number> {
    const subcommand = args[0] ?? 'run'
    switch (subcommand) {
      case 'run':
        return await this.runVitaminScript(args.slice(1))
      case 'add':
        return await this.runVitaminAdd(args.slice(1))
      case 'i':
      case 'install': {
        this.evaluator.runtime.process.argv = ['vitamin', 'install', ...args.slice(1)]
        const registryUrl =
          this.options.env?.VITAMIN_INSTALL_REGISTRY ??
          this.options.env?.NPM_CONFIG_REGISTRY
        const progressPrefix = '__VITAMIN_INSTALL_PROGRESS__ '
        const emitProgress = (payload: Record<string, unknown>) => {
          this.evaluator.runtime.process.stdout.write(`${progressPrefix}${JSON.stringify(payload)}\n`)
        }

        await install({
          vfs: this.options.vfs,
          cwd: this.evaluator.runtime.process.cwd(),
          registryUrl,
          stdout: (message) => this.evaluator.runtime.process.stdout.write(message),
          stderr: (message) => this.evaluator.runtime.process.stderr.write(message),
          onStateChange: (info) => emitProgress({ type: 'progress', ...info }),
          onPackageCountChange: (info) => emitProgress({ type: 'count', ...info }),
          onDownloadProgress: (info) => emitProgress({ type: 'download', ...info }),
        })

        return 0
      }
      case 'create':
        return this.reportUnsupportedCli('vitamin create')
      default:
        return await this.runEntryCommand('vitamin', args)
    }
  }

  private async runVitaminAdd(args: string[]): Promise<number> {
    const { options, packages } = parseAddFlags(args)
    if (packages.length === 0) {
      this.reportUnsupportedCli('vitamin add (missing package)')
      return 1
    }

    const cwd = this.evaluator.runtime.process.cwd()
    const requests = parseAddArgs(packages, options)
    await runAddFlow({
      vfs: this.options.vfs,
      cwd,
      requests
    })

    const registryUrl =
      this.options.env?.BUN_INSTALL_REGISTRY ??
      this.options.env?.NPM_CONFIG_REGISTRY

    await install({
      vfs: this.options.vfs,
      cwd,
      registryUrl,
      stdout: (message) => this.evaluator.runtime.process.stdout.write(message),
      stderr: (message) => this.evaluator.runtime.process.stderr.write(message),
    })

    return 0
  }

  private async runVitaminScript(args: string[]): Promise<number> {
    const scriptName = args[0]
    
    if (!scriptName) {
      return await this.runEntryCommand('vitamin', ['run', '/index.ts'])
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

    return await this.runEntryCommand('vitamin', ['run', ...args])
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
      case command === 'vitamin':
        return await this.runVitaminCommand(rest)
      case Boolean(localBin):
        return await this.runEntryCommand(localBin!, rest)
      case command.startsWith('.') ||
        command.startsWith('/') ||
        command.endsWith('.js') ||
        command.endsWith('.ts'):
        return await this.runEntryCommand(command, rest)
      default:
        throw new Error(`Cannot find script command: ${command}`)
    }
  }

  private async runEntryCommand(command: string, args: string[]): Promise<number> {
    const entry = this.resolveEntry(command, args)
    const extraArgs = this.extractExtraArgs(command, args)
    this.evaluator.runtime.process.argv = ['vitamin', 'run', entry, ...extraArgs]
    await this.evaluator.run(entry)
    return 0
  }

  private extractExtraArgs(command: string, args: string[]): string[] {
    if (command === 'vitamin') {
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

  private spawn(options: SpawnOptions): SpawnResult {
    const pid = this.nextSpawnPid++
    const exited = new Promise<number>((resolve) => {
      void this.execWithCapture(options).then((result) => {
        resolve(result.exitCode)
        spawnResult.stdout = result.stdout
        spawnResult.stderr = result.stderr
      })
    })

    const spawnResult: SpawnResult = {
      pid,
      stdout: new Uint8Array(),
      stderr: new Uint8Array(),
      exited,
    }

    return spawnResult
  }

  private spawnSync(options: SpawnOptions): SpawnSyncResult {
    const result = this.execWithCaptureSync(options)
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    }
  }

  private async execWithCapture(
    options: SpawnOptions,
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
      const exitCode = await this.exec(options.cmd[0] ?? 'vitamin', options.cmd.slice(1))
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
    options: SpawnOptions,
  ): { exitCode: number; stdout: Uint8Array; stderr: Uint8Array } {
    const runtime = this.evaluator.runtime
    const env = runtime.process.env

    runtime.process.env = { ...env, ...(options.env ?? {}) }

    const stdoutChunks: Uint8Array[] = []
    const stderrChunks: Uint8Array[] = []
    const stdout = runtime.process.stdout.write
    const stderr = runtime.process.stderr.write

    runtime.process.stdout.write = (data: string | Uint8Array) => {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
      stdoutChunks.push(bytes)
      stdout(data)
    }
    runtime.process.stderr.write = (data: string | Uint8Array) => {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
      stderrChunks.push(bytes)
      stderr(data)
    }

    let exitCode = 0
    try {
      const entry = this.resolveEntry(options.cmd[0] ?? 'vitamin', options.cmd.slice(1))
      runtime.process.argv = ['vitamin', 'run', entry]
      this.loadSync(entry)
    } catch (err) {
      exitCode = 1
      const message = err instanceof Error ? err.stack ?? err.message : String(err)
      this.options.onStderr?.(new TextEncoder().encode(message + '\n'))
    } finally {
      runtime.process.stdout.write = stdout
      runtime.process.stderr.write = stderr
      runtime.process.env = env
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

  async load(id: string, parent?: string): Promise<ModuleRecord> {
    return await this.loader.load(id, parent)
  }

  loadSync(id: string, parent?: string): ModuleRecord {
    return this.loader.loadSync(id, parent)
  }



  async dispatchServeRequest(request: Request): Promise<Response> {
    return await this.evaluator.runtime.Vitamin.__dispatchServeRequest(request)
  }

  async dispose(): Promise<void> {
    await this.evaluator.dispose()
  }

  private resolveEntry(command: string, args: string[]): string {
    if (command === 'vitamin') {
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

function parseAddFlags(args: string[]): { options: { dev?: boolean; peer?: boolean; optional?: boolean; workspace?: boolean }; packages: string[] } {
  const options: { dev?: boolean; peer?: boolean; optional?: boolean; workspace?: boolean } = {}
  const packages: string[] = []

  for (const arg of args) {
    if (arg.startsWith('-')) {
      switch (arg) {
        case '-d':
        case '--dev':
          options.dev = true
          break
        case '-p':
        case '--peer':
          options.peer = true
          break
        case '-O':
        case '--optional':
          options.optional = true
          break
        case '-w':
        case '--workspace':
          options.workspace = true
          break
        default:
          break
      }
    } else {
      packages.push(arg)
    }
  }

  return { options, packages }
}
