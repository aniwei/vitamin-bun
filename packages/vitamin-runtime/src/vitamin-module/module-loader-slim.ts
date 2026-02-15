import { dirname, extname, join, normalizePath } from '../path'
import { Transpiler, type LoaderType } from '../transpiler'
import { InternalModuleLoader } from './internal-module-loader'
import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'

export interface ModuleRecord {
  id: string
  exports: Record<string, unknown>
}

export interface RuntimeGlobals {
  Vitamin: unknown
  process: { env?: Record<string, string> } | unknown
  console: Console
}

export interface ModuleLoaderOptions {
  vfs: VirtualFileSystem
  transpiler: Transpiler
  runtime: RuntimeGlobals
  internalModules?: Record<string, unknown>
  internalLoader?: InternalModuleLoader
  hooks?: {
    onResolve?: (id: string, parent?: string) => { id?: string; stop?: boolean } | void | Promise<{ id?: string; stop?: boolean } | void>
    onModuleRequest?: (id: string, parent?: string) => { id?: string; exports?: Record<string, unknown> } | void
    onError?: (error: Error, id: string, parent?: string) => void
  }
}

type PackageJson = {
  type?: 'module' | 'commonjs'
  main?: string
  module?: string
}

export class ModuleLoader {
  private readonly vfs: VirtualFileSystem
  private readonly transpiler: Transpiler
  private readonly runtime: RuntimeGlobals
  private readonly internalModules: Record<string, unknown>
  private readonly hooks?: ModuleLoaderOptions['hooks']
  private readonly internalLoader: InternalModuleLoader

  private readonly moduleCache = new Map<string, ModuleRecord>()
  private readonly pendingLoads = new Map<string, Promise<ModuleRecord>>()

  constructor(options: ModuleLoaderOptions) {
    this.vfs = options.vfs
    this.transpiler = options.transpiler
    this.runtime = options.runtime
    this.internalModules = options.internalModules ?? {}
    this.hooks = options.hooks
    this.internalLoader =
      options.internalLoader ??
      new InternalModuleLoader({
        vfs: options.vfs,
        modulePrefix: this.resolveModulePrefix(options.runtime),
      })
  }

  async load(entry: string, parent?: string): Promise<ModuleRecord> {
    try {
      const resolvedByHook = await this.hooks?.onResolve?.(entry, parent)
      if (resolvedByHook?.id) {
        entry = resolvedByHook.id
        if (resolvedByHook.stop) {
          return { id: resolvedByHook.id, exports: {} }
        }
      }

      const requested = this.hooks?.onModuleRequest?.(entry, parent)
      if (requested?.exports) {
        return { id: requested.id ?? entry, exports: requested.exports }
      }

      const coreId = this.normalizeCoreModuleId(entry)
      if (this.isCoreModule(coreId)) {
        return this.loadCoreModule(coreId)
      }

      if (this.canUseBrowserImport()) {
        return await this.loadEntry(entry, parent)
      }

      return this.loadSync(entry, parent)
    } catch (error) {
      this.reportLoadError(error, entry, parent)
      throw error
    }
  }

  async loadEntry(entry: string, parent?: string): Promise<ModuleRecord> {
    const url = this.resolveImportUrl(entry, parent)

    const cached = this.moduleCache.get(url)
    if (cached) return cached

    const pending = this.pendingLoads.get(url)
    if (pending) return await pending

    const task = (async () => {
      const namespace = (await import(/* @vite-ignore */ url)) as Record<string, unknown>
      const record: ModuleRecord = { id: url, exports: namespace }
      this.moduleCache.set(url, record)
      return record
    })()

    this.pendingLoads.set(url, task)
    try {
      return await task
    } finally {
      this.pendingLoads.delete(url)
    }
  }

  loadSync(entry: string, parent?: string): ModuleRecord {
    const requested = this.hooks?.onModuleRequest?.(entry, parent)
    if (requested?.exports) {
      return { id: requested.id ?? entry, exports: requested.exports }
    }

    const coreId = this.normalizeCoreModuleId(entry)
    if (this.isCoreModule(coreId)) {
      return this.loadCoreModule(coreId)
    }

    const resolved = this.resolveForFallback(entry, parent)
    const cached = this.moduleCache.get(resolved)
    if (cached) return cached

    const source = this.loadSourceSync(resolved)
    const record: ModuleRecord = { id: resolved, exports: {} }
    this.moduleCache.set(resolved, record)

    this.evaluateFallback(record, resolved, source)
    return record
  }

  private evaluateFallback(module: ModuleRecord, fileName: string, source: string): void {
    if (extname(fileName) === '.json') {
      module.exports = JSON.parse(source) as Record<string, unknown>
      return
    }

    const compiled = this.transpiler.compile(source, this.getLoader(extname(fileName)), fileName)
    const __filename = fileName
    const __dirname = dirname(fileName)
    const exportsObj = module.exports
    const moduleObj = { exports: exportsObj }

    const require = (id: string): unknown => this.loadSync(id, fileName).exports
    const dynamicImport = async (id: string): Promise<Record<string, unknown>> => {
      const imported = await this.load(id, fileName)
      return imported.exports
    }

    const fn = new Function(
      'exports',
      'require',
      'module',
      '__filename',
      '__dirname',
      'globalThis',
      'process',
      'Vitamin',
      'console',
      '__import',
      `${compiled.code}\n//# sourceURL=${fileName}`,
    ) as (
      exports: Record<string, unknown>,
      require: (id: string) => unknown,
      module: { exports: Record<string, unknown> },
      __filename: string,
      __dirname: string,
      globalThisValue: typeof globalThis,
      process: unknown,
      Vitamin: unknown,
      console: Console,
      __import: (id: string) => Promise<Record<string, unknown>>,
    ) => void

    fn(
      exportsObj,
      require,
      moduleObj,
      __filename,
      __dirname,
      globalThis,
      this.runtime.process,
      this.runtime.Vitamin,
      this.runtime.console,
      dynamicImport,
    )

    module.exports = moduleObj.exports
    this.applyInterop(module, fileName, source)
  }

  private resolveForFallback(entry: string, parent?: string): string {
    const isEsmParent = parent ? this.getModuleType(parent) === 'esm' : false

    if (entry.startsWith('/')) {
      const absolute = normalizePath(entry)
      if (this.vfs.exists(absolute) && this.vfs.stat(absolute).kind === 'directory') {
        return this.resolvePackageDir(absolute, isEsmParent)
      }
      return this.resolveWithExtensions(absolute)
    }

    if (entry.startsWith('.')) {
      const base = parent ? dirname(parent) : '/'
      const joined = join(base, entry)
      if (this.vfs.exists(joined) && this.vfs.stat(joined).kind === 'directory') {
        return this.resolvePackageDir(joined, isEsmParent)
      }
      return this.resolveWithExtensions(joined)
    }

    const { pkg, subpath } = splitPackagePath(entry)
    const root = `/node_modules/${pkg}`
    return this.resolvePackageDir(root, isEsmParent, subpath)
  }

  private resolvePackageDir(dirPath: string, isEsmParent: boolean, subpath?: string | null): string {
    const pkgJsonPath = `${dirPath}/package.json`
    const pkg = this.readPackageJson(pkgJsonPath)

    if (subpath) {
      if (pkg?.exports && typeof pkg.exports === 'object') {
        const key = `./${subpath}`
        const target = this.resolveExportsTarget((pkg.exports as Record<string, unknown>)[key], isEsmParent)
        if (typeof target === 'string') {
          return this.resolveWithExtensions(join(dirPath, target))
        }
      }
      return this.resolveWithExtensions(`${dirPath}/${subpath}`)
    }

    if (pkg?.exports) {
      const dotExport = this.resolveRootExport(pkg.exports, isEsmParent)
      if (dotExport) {
        return this.resolveWithExtensions(join(dirPath, dotExport))
      }
    }

    if (pkg?.module) {
      return this.resolveWithExtensions(join(dirPath, pkg.module))
    }

    if (pkg?.main) {
      return this.resolveWithExtensions(join(dirPath, pkg.main))
    }

    return this.resolveWithExtensions(`${dirPath}/index`)
  }

  private resolveRootExport(exportsField: unknown, isEsmParent: boolean): string | null {
    if (typeof exportsField === 'string') return exportsField
    if (!exportsField || typeof exportsField !== 'object') return null

    const record = exportsField as Record<string, unknown>
    const entry = record['.'] ?? record
    return this.resolveExportsTarget(entry, isEsmParent)
  }

  private resolveExportsTarget(target: unknown, isEsmParent: boolean): string | null {
    if (!target) return null
    if (typeof target === 'string') return target
    if (Array.isArray(target)) {
      for (const item of target) {
        const resolved = this.resolveExportsTarget(item, isEsmParent)
        if (resolved) return resolved
      }
      return null
    }
    if (typeof target !== 'object') return null

    const record = target as Record<string, unknown>
    const order = isEsmParent
      ? ['import', 'module', 'browser', 'default', 'require']
      : ['require', 'browser', 'default', 'import', 'module']

    for (const key of order) {
      const resolved = this.resolveExportsTarget(record[key], isEsmParent)
      if (resolved) return resolved
    }

    return null
  }

  private readPackageJson(path: string): PackageJson & { exports?: unknown } | null {
    if (!this.vfs.exists(path)) return null
    try {
      return JSON.parse(this.vfs.readFile(path)) as PackageJson & { exports?: unknown }
    } catch {
      return null
    }
  }

  private resolveWithExtensions(basePath: string): string {
    const candidates = [
      basePath,
      `${basePath}.ts`,
      `${basePath}.tsx`,
      `${basePath}.js`,
      `${basePath}.jsx`,
      `${basePath}.mjs`,
      `${basePath}.cjs`,
      `${basePath}.json`,
      `${basePath}/index.ts`,
      `${basePath}/index.tsx`,
      `${basePath}/index.js`,
      `${basePath}/index.jsx`,
      `${basePath}/index.mjs`,
      `${basePath}/index.cjs`,
      `${basePath}/index.json`,
    ]

    for (const candidate of candidates) {
      if (!this.vfs.exists(candidate)) continue
      const stat = this.vfs.stat(candidate)
      if (stat.kind === 'file') return candidate
    }

    throw new Error(`MODULE_NOT_FOUND: ${basePath}`)
  }

  private resolveImportUrl(entry: string, parent?: string): string {
    const prefix = this.resolveModulePrefix(this.runtime) ?? '/@/vitamin/module/'

    if (/^https?:\/\//i.test(entry)) {
      return entry
    }

    if (entry.startsWith('.')) {
      const parentUrl = parent ? this.resolveImportUrl(parent) : `${location.origin}${prefix}index.ts`
      return new URL(entry, parentUrl).toString()
    }

    const normalized = entry.startsWith('/') ? entry.slice(1) : entry
    const encoded = normalized
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    const base = prefix.endsWith('/') ? prefix : `${prefix}/`

    if (/^https?:\/\//i.test(base)) {
      return `${base}${encoded}`
    }

    const origin = typeof location !== 'undefined' ? location.origin : 'http://localhost'
    const path = base.startsWith('/') ? base : `/${base}`
    return `${origin}${path}${encoded}`
  }

  private canUseBrowserImport(): boolean {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  }

  private getModuleType(path: string): 'esm' | 'cjs' {
    if (path.endsWith('.mjs') || path.endsWith('.mts')) return 'esm'
    if (path.endsWith('.cjs') || path.endsWith('.cts')) return 'cjs'
    return 'cjs'
  }

  private loadCoreModule(id: string): ModuleRecord {
    const exports = this.internalModules[id] as Record<string, unknown> | undefined
    if (typeof exports?.__unavailable === 'string') {
      throw new Error(exports.__unavailable)
    }
    if (!exports) {
      throw new Error(`Unknown internal module: ${id}`)
    }
    return { id, exports }
  }

  private isCoreModule(id: string): boolean {
    return id in this.internalModules
  }

  private normalizeCoreModuleId(id: string): string {
    const raw = id.startsWith('node:') ? id.slice(5) : id
    if (raw.startsWith('timers/promises')) return 'timers/promises'
    if (raw.startsWith('fs/promises')) return 'fs/promises'
    if (raw.startsWith('path/posix')) return 'path/posix'
    if (raw.startsWith('path/win32')) return 'path/win32'
    if (raw.startsWith('stream/promises')) return 'stream/promises'
    if (raw.startsWith('stream/web')) return 'stream/web'
    if (raw.startsWith('assert/strict')) return 'assert/strict'
    return raw
  }

  private loadSourceSync(resolved: string): string {
    const cached = this.internalLoader.getFromCache(resolved)
    if (cached !== undefined) {
      return cached
    }
    if (!this.vfs.exists(resolved)) {
      throw new Error(`MODULE_NOT_FOUND: ${resolved}`)
    }
    const source = this.vfs.readFile(resolved)
    this.internalLoader.setCache(resolved, source)
    return source
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
    const isEsm = /(^|\n)\s*(import|export)\s+/m.test(source) || extname(resolved) === '.mjs'
    const exportsValue = module.exports as unknown

    if (exportsValue === null || (typeof exportsValue !== 'object' && typeof exportsValue !== 'function')) {
      if (isEsm) {
        module.exports = { default: exportsValue, __esModule: true } as Record<string, unknown>
      }
      return
    }

    const exportsObj = exportsValue as Record<string, unknown>
    if (isEsm) {
      const descriptor = Object.getOwnPropertyDescriptor(exportsObj, '__esModule')
      if (!descriptor || ('writable' in descriptor && descriptor.writable)) {
        exportsObj.__esModule = true
      }
      return
    }

    if (!('default' in exportsObj)) {
      const descriptor = Object.getOwnPropertyDescriptor(exportsObj, 'default')
      if (!descriptor || ('writable' in descriptor && descriptor.writable)) {
        exportsObj.default = exportsObj
      }
    }
  }

  private reportLoadError(err: unknown, id: string, parent?: string): void {
    const error = err instanceof Error ? err : new Error(String(err))
    this.hooks?.onError?.(error, id, parent)
  }

  private resolveModulePrefix(runtime: RuntimeGlobals): string | undefined {
    const processLike = runtime.process as { env?: Record<string, string> } | undefined
    return processLike?.env?.VITAMIN_MODULE_PREFIX
  }
}

function splitPackagePath(entry: string): { pkg: string; subpath: string | null } {
  if (entry.startsWith('@')) {
    const parts = entry.split('/').filter(Boolean)
    return {
      pkg: parts.slice(0, 2).join('/'),
      subpath: parts.slice(2).join('/') || null,
    }
  }

  const parts = entry.split('/').filter(Boolean)
  return {
    pkg: parts[0] ?? entry,
    subpath: parts.slice(1).join('/') || null,
  }
}
