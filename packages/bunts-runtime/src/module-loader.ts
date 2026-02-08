import { Transpiler, type LoaderType } from './transpiler'
import { dirname, extname, join, normalizePath } from './path'
import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'

export interface ModuleRecord {
  id: string
  exports: Record<string, unknown>
}

export interface RuntimeGlobals {
  Bun: unknown
  process: unknown
  console: Console
}

export interface ModuleLoaderOptions {
  vfs: VirtualFileSystem
  transpiler: Transpiler
  runtime: RuntimeGlobals
  coreModules?: Record<string, unknown>
  hooks?: {
    onModuleResolve?: (id: string, parent?: string) => { id?: string; stop?: boolean } | void | Promise<{ id?: string; stop?: boolean } | void>
    onModuleLoad?: (id: string, parent?: string) => { id?: string; exports?: Record<string, unknown>; stop?: boolean } | void | Promise<{ id?: string; exports?: Record<string, unknown>; stop?: boolean } | void>
  }
}

export class ModuleLoader {
  private vfs: VirtualFileSystem
  private transpiler: Transpiler
  private cache = new Map<string, ModuleRecord>()
  private runtime: RuntimeGlobals
  private coreModules: Record<string, unknown>
  private hooks?: ModuleLoaderOptions['hooks']

  constructor(options: ModuleLoaderOptions) {
    this.vfs = options.vfs
    this.transpiler = options.transpiler
    this.runtime = options.runtime
    this.coreModules = options.coreModules ?? {}
    this.hooks = options.hooks
  }

  async load(entry: string, parent?: string): Promise<ModuleRecord> {
    const resolveResult = await this.hooks?.onModuleResolve?.(entry, parent)
    if (resolveResult?.id) {
      entry = resolveResult.id
      if (resolveResult.stop) {
        return { id: resolveResult.id, exports: {} }
      }
    }
    const hookResult = await this.hooks?.onModuleLoad?.(entry, parent)
    if (hookResult?.exports) {
      const id = hookResult.id ?? entry
      return { id, exports: hookResult.exports }
    }
    if (hookResult?.id) {
      entry = hookResult.id
      if (hookResult.stop) {
        return { id: entry, exports: {} }
      }
    }
    const normalizedCore = this.normalizeCoreModuleId(entry)
    if (this.isCoreModule(normalizedCore)) {
      const exports = this.coreModules[normalizedCore] as Record<string, unknown>
      if (isUnavailableModule(exports)) {
        throw new Error(exports.__unavailable)
      }
      return { id: normalizedCore, exports }
    }
    const resolved = this.resolve(entry, parent)
    if (this.cache.has(resolved)) return this.cache.get(resolved)!

    const ext = extname(resolved)
    const loader = this.getLoader(ext)

    if (loader === 'json') {
      const jsonText = this.vfs.readFile(resolved)
      const module: ModuleRecord = { id: resolved, exports: {} }
      module.exports = JSON.parse(jsonText)
      this.cache.set(resolved, module)
      return module
    }

    const source = this.vfs.readFile(resolved)
    const compiled = this.transpiler.compile(source, loader, resolved)
    const code = applySourceMap(compiled.code, compiled.map)

    const module: ModuleRecord = { id: resolved, exports: {} }
    this.cache.set(resolved, module)

    this.preloadDependencies(source, resolved)

    const require = (id: string) => this.loadSync(id, resolved).exports

    const fn = new Function(
      'require',
      'module',
      'exports',
      '__filename',
      '__dirname',
      'Bun',
      'process',
      'console',
      code,
    ) as (
      require: (id: string) => unknown,
      module: { exports: Record<string, unknown> },
      exports: Record<string, unknown>,
      __filename: string,
      __dirname: string,
      Bun: unknown,
      process: unknown,
      console: Console,
    ) => void

    fn(
      require,
      module as { exports: Record<string, unknown> },
      module.exports,
      resolved,
      dirname(resolved),
      this.runtime.Bun,
      this.runtime.process,
      this.runtime.console,
    )

    this.applyInterop(module, resolved, source)

    return module
  }

  loadSync(entry: string, parent?: string): ModuleRecord {
    let resolveResult = this.hooks?.onModuleResolve?.(entry, parent)
    if (isPromise(resolveResult)) {
      console.warn('onModuleResolve returned a Promise in loadSync; ignoring async result')
      resolveResult = undefined
    }

    if (resolveResult?.id) {
      entry = resolveResult.id
      if (resolveResult.stop) {
        return { id: resolveResult.id, exports: {} }
      }
    }

    let hookResult = this.hooks?.onModuleLoad?.(entry, parent)
    if (isPromise(hookResult)) {
      console.warn('onModuleLoad returned a Promise in loadSync; ignoring async result')
      hookResult = undefined
    }

    if (hookResult?.exports) {
      const id = hookResult.id ?? entry
      return { id, exports: hookResult.exports }
    }

    if (hookResult?.id) {
      entry = hookResult.id
      if (hookResult.stop) {
        return { id: entry, exports: {} }
      }
    }

    const normalizedCore = this.normalizeCoreModuleId(entry)
    
    if (this.isCoreModule(normalizedCore)) {
      const exports = this.coreModules[normalizedCore] as Record<string, unknown>
      if (isUnavailableModule(exports)) {
        throw new Error(exports.__unavailable)
      }
      return { id: normalizedCore, exports }
    }
    
    const resolved = this.resolve(entry, parent)
    if (this.cache.has(resolved)) return this.cache.get(resolved)!

    const ext = extname(resolved)
    const loader = this.getLoader(ext)

    if (loader === 'json') {
      const jsonText = this.vfs.readFile(resolved)
      const module: ModuleRecord = { id: resolved, exports: {} }
      module.exports = JSON.parse(jsonText)
      this.cache.set(resolved, module)
      return module
    }

    const source = this.vfs.readFile(resolved)
    const compiled = this.transpiler.compile(source, loader, resolved)
    const code = applySourceMap(compiled.code, compiled.map)

    const module: ModuleRecord = { id: resolved, exports: {} }
    this.cache.set(resolved, module)

    this.preloadDependencies(source, resolved)

    const require = (id: string) => this.loadSync(id, resolved).exports

    const fn = new Function(
      'require',
      'module',
      'exports',
      '__filename',
      '__dirname',
      'Bun',
      'process',
      'console',
      code,
    ) as (
      require: (id: string) => unknown,
      module: { exports: Record<string, unknown> },
      exports: Record<string, unknown>,
      __filename: string,
      __dirname: string,
      Bun: unknown,
      process: unknown,
      console: Console,
    ) => void

    fn(
      require,
      module as { exports: Record<string, unknown> },
      module.exports,
      resolved,
      dirname(resolved),
      this.runtime.Bun,
      this.runtime.process,
      this.runtime.console,
    )

    this.applyInterop(module, resolved, source)

    return module
  }

  resolve(entry: string, parent?: string): string {
    const baseDir = parent ? dirname(parent) : '/'
    const normalizedCore = this.normalizeCoreModuleId(entry)
    if (!this.isCoreModule(normalizedCore) && isBareSpecifier(entry)) {
      const nodeResolved = this.resolveNodeModule(entry, baseDir)
      if (nodeResolved) return nodeResolved
    }
    const candidate = parent ? join(baseDir, entry) : normalizePath(entry)

    const resolved = this.resolveWithExtensions(candidate)
    if (resolved) return resolved

    throw new Error(`MODULE_NOT_FOUND: ${entry}`)
  }

  private resolveNodeModule(entry: string, baseDir: string): string | null {
    const { packageName, subpath } = splitPackagePath(entry)
    let current = baseDir

    while (true) {
      const nodeModulesDir = current.endsWith('/') ? `${current}node_modules` : `${current}/node_modules`
      const packageDir = `${nodeModulesDir}/${packageName}`
      if (this.vfs.exists(packageDir)) {
        if (subpath) {
          const target = join(packageDir, subpath)
          const resolved = this.resolveWithExtensions(target)
          if (resolved) return resolved
        } else {
          const resolved = this.resolvePackageEntry(packageDir)
          if (resolved) return resolved
        }
      }

      if (current === '/' || current === '') break
      current = dirname(current)
    }

    return null
  }

  private resolveWithExtensions(path: string): string | null {
    if (this.vfs.exists(path)) {
      const stat = this.vfs.stat(path)
      if (stat.kind === 'directory') {
        const pkgEntry = this.resolvePackageEntry(path)
        if (pkgEntry) return pkgEntry
      } else {
        if (extname(path) === '.node') {
          throw new Error(`Native addon not supported: ${path}`)
        }
        return path
      }
    }

    const nativeCandidate = `${path}.node`
    if (this.vfs.exists(nativeCandidate)) {
      throw new Error(`Native addon not supported: ${nativeCandidate}`)
    }

    const candidates = [
      `${path}.ts`,
      `${path}.tsx`,
      `${path}.js`,
      `${path}.jsx`,
      `${path}.mjs`,
      `${path}.cjs`,
      `${path}.json`,
      `${path}/index.ts`,
      `${path}/index.tsx`,
      `${path}/index.js`,
      `${path}/index.jsx`,
      `${path}/index.mjs`,
      `${path}/index.cjs`,
      `${path}/index.json`,
    ]

    for (const candidate of candidates) {
      if (this.vfs.exists(candidate)) return candidate
    }

    return null
  }

  private resolvePackageEntry(dirPath: string): string | null {
    const pkgJsonPath = `${dirPath}/package.json`
    if (!this.vfs.exists(pkgJsonPath)) return this.resolveIndex(dirPath)

    try {
      const pkg = JSON.parse(this.vfs.readFile(pkgJsonPath)) as {
        main?: string
        module?: string
        exports?: string | { [key: string]: string | { import?: string; require?: string } }
      }

      const exportsTarget = this.resolveExports(pkg.exports)
      if (exportsTarget) {
        const target = join(dirPath, exportsTarget)
        const resolved = this.resolveWithExtensions(target)
        if (resolved) return resolved
      }

      if (pkg.module) {
        const target = join(dirPath, pkg.module)
        const resolved = this.resolveWithExtensions(target)
        if (resolved) return resolved
      }

      if (pkg.main) {
        const target = join(dirPath, pkg.main)
        const resolved = this.resolveWithExtensions(target)
        if (resolved) return resolved
      }
    } catch {
      return this.resolveIndex(dirPath)
    }

    return this.resolveIndex(dirPath)
  }

  private resolveExports(exportsField?: string | { [key: string]: string | { import?: string; require?: string } }): string | null {
    if (!exportsField) return null
    if (typeof exportsField === 'string') return exportsField
    if (typeof exportsField === 'object' && exportsField['.']) {
      const entry = exportsField['.']
      if (typeof entry === 'string') return entry
      if (entry && typeof entry === 'object') {
        return entry.import ?? entry.require ?? null
      }
    }
    return null
  }

  private resolveIndex(dirPath: string): string | null {
    const candidates = [
      `${dirPath}/index.ts`,
      `${dirPath}/index.tsx`,
      `${dirPath}/index.js`,
      `${dirPath}/index.jsx`,
      `${dirPath}/index.mjs`,
      `${dirPath}/index.cjs`,
      `${dirPath}/index.json`,
    ]

    for (const candidate of candidates) {
      if (this.vfs.exists(candidate)) return candidate
    }

    return null
  }

  private getLoader(ext: string): LoaderType {
    switch (ext) {
      case '.ts':
        return 'ts'
      case '.tsx':
        return 'tsx'
      case '.jsx':
        return 'jsx'
      case '.mjs':
        return 'mjs'
      case '.cjs':
        return 'cjs'
      case '.json':
        return 'json'
      default:
        return 'js'
    }
  }

  private applyInterop(module: ModuleRecord, resolved: string, source: string): void {
    const isEsm = this.isEsmSyntax(source) || ['.mjs', '.ts', '.tsx'].includes(extname(resolved))
    const exportsValue = module.exports as unknown

    if (exportsValue === null || (typeof exportsValue !== 'object' && typeof exportsValue !== 'function')) {
      if (isEsm) {
        module.exports = { default: exportsValue, __esModule: true } as Record<string, unknown>
      }
      return
    }

    let exportsObj = exportsValue as Record<string, unknown>

    const canAssign = (key: string, target: Record<string, unknown>) => {
      const descriptor = Object.getOwnPropertyDescriptor(target, key)
      if (!descriptor) return Object.isExtensible(target)
      if ('writable' in descriptor) return Boolean(descriptor.writable)
      return typeof descriptor.set === 'function'
    }

    const tryAssign = (key: string, value: unknown) => {
      if (canAssign(key, exportsObj)) {
        exportsObj[key] = value
        return
      }

      if (typeof exportsValue === 'object' && exportsValue !== null && typeof exportsValue !== 'function') {
        exportsObj = { ...exportsObj }
        module.exports = exportsObj
        if (canAssign(key, exportsObj)) {
          exportsObj[key] = value
        }
      }
    }

    if (isEsm) {
      if (!('default' in exportsObj) && Object.keys(exportsObj).length === 1 && exportsObj.__esModule) {
        // no-op; already flagged
      }
      tryAssign('__esModule', true)
    } else {
      if (!('default' in exportsObj)) {
        tryAssign('default', exportsObj)
      }
    }
  }

  private isEsmSyntax(source: string): boolean {
    const importExport = /(^|\n)\s*(import|export)\s+/m
    return importExport.test(source)
  }

  private preloadDependencies(source: string, currentPath: string): void {
    const deps = this.scanDependencies(source)
    for (const dep of deps) {
      const normalized = this.normalizeCoreModuleId(dep)
      if (this.isCoreModule(normalized)) continue
      try {
        this.loadSync(dep, currentPath)
      } catch {
        // ignore resolution errors during preload
      }
    }
  }

  private scanDependencies(source: string): string[] {
    const deps = new Set<string>()
    const importFrom = /import\s+[^'"\n]*from\s+['"]([^'"]+)['"]/g
    const importOnly = /import\s+['"]([^'"]+)['"]/g
    const exportFrom = /export\s+[^'"\n]*from\s+['"]([^'"]+)['"]/g
    const dynamicImport = /import\(\s*['"]([^'"]+)['"]\s*\)/g
    const requireCall = /require\(\s*['"]([^'"]+)['"]\s*\)/g

    const patterns = [importFrom, importOnly, exportFrom, dynamicImport, requireCall]
    for (const pattern of patterns) {
      let match: RegExpExecArray | null
      while ((match = pattern.exec(source)) !== null) {
        deps.add(match[1])
      }
    }

    return Array.from(deps)
  }

  private isCoreModule(id: string): boolean {
    return id in this.coreModules
  }

  private normalizeCoreModuleId(id: string): string {
    const raw = id.startsWith('node:') ? id.slice(5) : id
    if (raw.startsWith('timers/promises')) return 'timers/promises'
    if (raw.startsWith('timers')) return 'timers'
    if (raw.startsWith('fs/promises')) return 'fs/promises'
    if (raw.startsWith('path/posix')) return 'path/posix'
    if (raw.startsWith('path/win32')) return 'path/win32'
    if (raw.startsWith('events')) return 'events'
    if (raw.startsWith('crypto')) return 'crypto'
    if (raw.startsWith('assert/strict')) return 'assert/strict'
    if (raw.startsWith('assert')) return 'assert'
    if (raw.startsWith('util')) return 'util'
    if (raw.startsWith('stream/web')) return 'stream/web'
    if (raw.startsWith('stream/promises')) return 'stream/promises'
    if (raw.startsWith('stream')) return 'stream'
    if (raw.startsWith('os')) return 'os'
    if (raw.startsWith('url')) return 'url'
    if (raw.startsWith('buffer')) return 'buffer'
    if (raw.startsWith('path')) return 'path'
    if (raw.startsWith('querystring')) return 'querystring'
    if (raw.startsWith('string_decoder')) return 'string_decoder'
    if (raw.startsWith('perf_hooks')) return 'perf_hooks'
    if (raw.startsWith('async_hooks')) return 'async_hooks'
    if (raw.startsWith('scheduler')) return 'scheduler'
    if (raw.startsWith('inspector')) return 'inspector'
    if (raw.startsWith('module')) return 'module'
    if (raw.startsWith('tty')) return 'tty'
    if (raw.startsWith('constants')) return 'constants'
    if (raw.startsWith('punycode')) return 'punycode'
    if (raw.startsWith('diagnostics_channel')) return 'diagnostics_channel'
    if (raw.startsWith('zlib')) return 'zlib'
    if (raw.startsWith('worker_threads')) return 'worker_threads'
    if (raw.startsWith('https')) return 'https'
    if (raw.startsWith('http')) return 'http'
    if (raw.startsWith('tls')) return 'tls'
    if (raw.startsWith('net')) return 'net'
    return raw
  }
}

function isPromise(value: unknown): value is Promise<unknown> {
  return Boolean(value) && typeof (value as Promise<unknown>).then === 'function'
}

function applySourceMap(code: string, map?: string): string {
  if (!map) return code
  const base64 = encodeBase64(map)
  return `${code}\n//# sourceMappingURL=data:application/json;base64,${base64}`
}

function encodeBase64(input: string): string {
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(input)))
  }
  // Node.js fallback
  return Buffer.from(input, 'utf8').toString('base64')
}

function isUnavailableModule(
  exports: Record<string, unknown> | undefined,
): exports is { __unavailable: string } {
  return typeof exports?.__unavailable === 'string'
}

function isBareSpecifier(id: string): boolean {
  if (!id) return false
  if (id.startsWith('.') || id.startsWith('/') || id.startsWith('node:')) return false
  return true
}

function splitPackagePath(entry: string): { packageName: string; subpath: string | null } {
  if (entry.startsWith('@')) {
    const parts = entry.split('/').filter(Boolean)
    const packageName = parts.slice(0, 2).join('/')
    const subpath = parts.slice(2).join('/')
    return { packageName, subpath: subpath || null }
  }
  const parts = entry.split('/').filter(Boolean)
  const packageName = parts[0] ?? entry
  const subpath = parts.slice(1).join('/')
  return { packageName, subpath: subpath || null }
}
