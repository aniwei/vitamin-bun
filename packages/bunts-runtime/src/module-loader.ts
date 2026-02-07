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
}

export class ModuleLoader {
  private vfs: VirtualFileSystem
  private transpiler: Transpiler
  private cache = new Map<string, ModuleRecord>()
  private runtime: RuntimeGlobals
  private coreModules: Record<string, unknown>

  constructor(options: ModuleLoaderOptions) {
    this.vfs = options.vfs
    this.transpiler = options.transpiler
    this.runtime = options.runtime
    this.coreModules = options.coreModules ?? {}
  }

  async load(entry: string, parent?: string): Promise<ModuleRecord> {
    const normalizedCore = this.normalizeCoreModuleId(entry)
    if (this.isCoreModule(normalizedCore)) {
      return { id: normalizedCore, exports: this.coreModules[normalizedCore] as Record<string, unknown> }
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
    const { code } = this.transpiler.compile(source, loader, resolved)

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
    const normalizedCore = this.normalizeCoreModuleId(entry)
    if (this.isCoreModule(normalizedCore)) {
      return { id: normalizedCore, exports: this.coreModules[normalizedCore] as Record<string, unknown> }
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
    const { code } = this.transpiler.compile(source, loader, resolved)

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
    const candidate = parent ? join(baseDir, entry) : normalizePath(entry)

    const resolved = this.resolveWithExtensions(candidate)
    if (resolved) return resolved

    throw new Error(`MODULE_NOT_FOUND: ${entry}`)
  }

  private resolveWithExtensions(path: string): string | null {
    if (this.vfs.exists(path)) {
      const stat = this.vfs.stat(path)
      if (stat.kind === 'directory') {
        const pkgEntry = this.resolvePackageEntry(path)
        if (pkgEntry) return pkgEntry
      } else {
        return path
      }
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
