export {}
/*
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
    onError?: (error: Error, id: string, parent?: string) => void
  }
}

type PackageJson = {
  type?: 'module' | 'commonjs'
  main?: string
  module?: string
  exports?: unknown
  imports?: unknown
}

type ResolveConditions = string[]

type ExportsTarget = string | Record<string, unknown> | Array<unknown>

type ExportPatternMatch = {
  pattern: string
  substitute: string
  target: ExportsTarget
}

type ModuleState = 'created' | 'resolving' | 'loading' | 'evaluating' | 'evaluated' | 'errored'

type ModuleEntry = {
  id: string
  state: ModuleState
  record: ModuleRecord
  promise?: Promise<ModuleRecord>
  error?: Error
}

export class ModuleLoader {
  private vfs: VirtualFileSystem
  private transpiler: Transpiler
  private runtime: RuntimeGlobals
  private internalModules: Record<string, unknown>
  private hooks?: ModuleLoaderOptions['hooks']
  private internalLoader: InternalModuleLoader
  private moduleEntries = new Map<string, ModuleEntry>()
  private packageTypeCache = new Map<string, 'module' | 'commonjs' | null>()

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

      const normalizedCore = this.normalizeCoreModuleId(entry)
      if (this.isCoreModule(normalizedCore)) {
        return this.loadCoreModule(normalizedCore)
      }

      const resolved = this.resolve(entry, parent)
      const existing = this.moduleEntries.get(resolved)
      if (existing) {
        if (existing.state === 'evaluated') return existing.record
        if (existing.state === 'evaluating') return existing.record
        if (existing.state === 'errored') throw existing.error ?? new Error(`Module failed: ${resolved}`)
        if (existing.promise) return await existing.promise
      }

      const entryRecord: ModuleEntry = {
        id: resolved,
        state: 'created',
        record: { id: resolved, exports: {} },
      }
      this.moduleEntries.set(resolved, entryRecord)
      entryRecord.promise = this.evaluateModulePipeline(entryRecord, resolved, parent)
      return await entryRecord.promise
    } catch (err) {
      this.reportLoadError(err, entry, parent)
      throw err
    }
  }

  loadSync(entry: string, parent?: string): ModuleRecord {
    try {
      const normalizedCore = this.normalizeCoreModuleId(entry)
      if (this.isCoreModule(normalizedCore)) {
        return this.loadCoreModule(normalizedCore)
      }

      const resolved = this.resolve(entry, parent)
      const existing = this.moduleEntries.get(resolved)
      if (existing) {
        if (existing.state === 'evaluated') return existing.record
        if (existing.state === 'evaluating') return existing.record
        if (existing.state === 'errored') throw existing.error ?? new Error(`Module failed: ${resolved}`)
        if (existing.state === 'loading' || existing.state === 'resolving') {
          throw new Error(`Cannot synchronously require async-loading module: ${resolved}`)
        }
      }

      const source = this.loadSourceSync(resolved)
      const moduleEntry: ModuleEntry = {
        id: resolved,
        state: 'evaluating',
        record: { id: resolved, exports: {} },
      }
      this.moduleEntries.set(resolved, moduleEntry)

      try {
        this.evaluateCompiledCode(moduleEntry.record, resolved, source)
        moduleEntry.state = 'evaluated'
        return moduleEntry.record
      } catch (err) {
        moduleEntry.state = 'errored'
        moduleEntry.error = err instanceof Error ? err : new Error(String(err))
        this.moduleEntries.delete(resolved)
        throw moduleEntry.error
      }
    } catch (err) {
      this.reportLoadError(err, entry, parent)
      throw err
    }
  }

  resolve(entry: string, parent?: string): string {
    const baseDir = parent ? dirname(parent) : '/'
    const isEsmParent = parent ? this.getModuleTypeForPath(parent) === 'esm' : false
    const normalizedCore = this.normalizeCoreModuleId(entry)

    if (this.isCoreModule(normalizedCore)) return normalizedCore

    if (entry.startsWith('#')) {
      const resolved = this.resolvePackageImports(entry, baseDir, isEsmParent)
      if (resolved) return resolved
    }

    if (isBareSpecifier(entry)) {
      const nodeResolved = this.resolveNodeModule(entry, baseDir, isEsmParent)
      if (nodeResolved) return nodeResolved
    }

    const candidate = parent ? join(baseDir, entry) : normalizePath(entry)
    const resolved = this.resolveWithExtensions(candidate, isEsmParent)
    if (resolved) return resolved

    const from = parent ? ` from ${parent}` : ''
    throw new Error(`MODULE_NOT_FOUND: ${entry}${from}`)
  }

  private async evaluateModulePipeline(moduleEntry: ModuleEntry, resolved: string, parent?: string): Promise<ModuleRecord> {
    moduleEntry.state = 'resolving'

    moduleEntry.state = 'loading'
    const source = await this.internalLoader.load(resolved, parent)

    moduleEntry.state = 'evaluating'
    try {
      this.evaluateCompiledCode(moduleEntry.record, resolved, source)
      moduleEntry.state = 'evaluated'
      return moduleEntry.record
    } catch (err) {
      moduleEntry.state = 'errored'
      moduleEntry.error = err instanceof Error ? err : new Error(String(err))
      this.moduleEntries.delete(resolved)
      throw moduleEntry.error
    }
  }

  private evaluateCompiledCode(module: ModuleRecord, resolved: string, source: string): void {
    if (extname(resolved) === '.json') {
      module.exports = JSON.parse(source) as Record<string, unknown>
      return
    }

    const loader = this.getLoader(extname(resolved))
    const compiled = this.transpiler.compile(source, loader, resolved)

    const dirnameValue = dirname(resolved)
    const exportsObj = module.exports
    const moduleObj = { exports: exportsObj }

    const require = (id: string): unknown => this.loadSync(id, resolved).exports
    const dynamicImport = async (id: string): Promise<Record<string, unknown>> => {
      const target = await this.load(id, resolved)
      return target.exports
    }

    const wrapped = new Function(
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
      `${compiled.code}\n//# sourceURL=${resolved}`,
    ) as (
      exports: Record<string, unknown>,
      require: (id: string) => unknown,
      module: { exports: Record<string, unknown> },
      __filename: string,
      __dirname: string,
      globalThis: typeof globalThis,
      process: unknown,
      Vitamin: unknown,
      console: Console,
      __import: (id: string) => Promise<Record<string, unknown>>,
    ) => void

    wrapped(
      exportsObj,
      require,
      moduleObj,
      resolved,
      dirnameValue,
      globalThis,
      this.runtime.process,
      this.runtime.Vitamin,
      this.runtime.console,
      dynamicImport,
    )

    module.exports = moduleObj.exports
    this.applyInterop(module, resolved, source)
  }

  private loadSourceSync(resolved: string): string {
    const cached = this.internalLoader.getFromCache(resolved)
    if (typeof cached === 'string') {
      return cached
    }

    if (!this.vfs.exists(resolved)) {
      throw new Error(`MODULE_NOT_FOUND: ${resolved}`)
    }

    const source = this.vfs.readFile(resolved)
    this.internalLoader.setCache(resolved, source)
    return source
  }

  private loadCoreModule(id: string): ModuleRecord {
    const exports = this.internalModules[id] as Record<string, unknown> | undefined
    if (isUnavailableModule(exports)) {
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
    if (raw.startsWith('timers')) return 'timers'
    if (raw.startsWith('fs/promises')) return 'fs/promises'
    if (raw.startsWith('path/posix')) return 'path/posix'
    if (raw.startsWith('path/win32')) return 'path/win32'
    if (raw.startsWith('stream/web')) return 'stream/web'
    if (raw.startsWith('stream/promises')) return 'stream/promises'
    if (raw.startsWith('assert/strict')) return 'assert/strict'
    if (raw.startsWith('worker_threads')) return 'worker_threads'
    if (raw.startsWith('child_process')) return 'child_process'
    if (raw.startsWith('diagnostics_channel')) return 'diagnostics_channel'
    if (raw.startsWith('string_decoder')) return 'string_decoder'
    if (raw.startsWith('perf_hooks')) return 'perf_hooks'
    if (raw.startsWith('async_hooks')) return 'async_hooks'
    if (raw.startsWith('bun:')) return raw

    const aliases = [
      'fs',
      'events',
      'crypto',
      'assert',
      'util',
      'stream',
      'os',
      'path',
      'buffer',
      'url',
      'querystring',
      'scheduler',
      'inspector',
      'module',
      'tty',
      'constants',
      'punycode',
      'http',
      'https',
      'net',
      'tls',
      'zlib',
      'process',
    ]

    for (const alias of aliases) {
      if (raw === alias || raw.startsWith(`${alias}/`)) {
        return alias
      }
    }

    return raw
  }

  private resolvePackageImports(entry: string, baseDir: string, isEsmParent: boolean): string | null {
    const pkgJsonPath = this.findNearestPackageJson(baseDir)
    if (!pkgJsonPath) return null
    const pkg = this.readPackageJson(pkgJsonPath)
    const importsField = pkg?.imports
    if (!importsField || typeof importsField !== 'object') return null

    const conditions = this.getConditions(isEsmParent)
    const match = this.matchExportsTarget(importsField as Record<string, unknown>, entry)
    if (!match) return null

    const target = this.resolveExportsTarget(match.target, conditions)
    if (!target) return null

    const replaced = this.replaceExportPattern(match.pattern, entry, target)
    const base = dirname(pkgJsonPath)
    const absolute = replaced.startsWith('.') ? join(base, replaced) : replaced
    return this.resolveWithExtensions(absolute, isEsmParent) ?? absolute
  }

  private resolveNodeModule(entry: string, baseDir: string, isEsmParent: boolean): string | null {
    const { packageName, subpath } = splitPackagePath(entry)
    let current = baseDir

    while (true) {
      const nodeModulesDir = current.endsWith('/') ? `${current}node_modules` : `${current}/node_modules`
      const packageDir = `${nodeModulesDir}/${packageName}`
      if (this.vfs.exists(packageDir)) {
        const resolved = this.resolvePackageEntry(packageDir, isEsmParent, subpath)
        if (resolved) return resolved
      }
      if (current === '/' || current === '') break
      current = dirname(current)
    }

    return null
  }

  private resolveWithExtensions(path: string, isEsmParent = false): string | null {
    if (this.vfs.exists(path)) {
      const stat = this.vfs.stat(path)
      if (stat.kind === 'directory') {
        const pkgEntry = this.resolvePackageEntry(path, isEsmParent)
        if (pkgEntry) return pkgEntry
      } else {
        if (extname(path) === '.node') {
          throw this.nativeAddonError(path)
        }
        return path
      }
    }

    const nativeCandidate = `${path}.node`
    if (this.vfs.exists(nativeCandidate)) {
      throw this.nativeAddonError(nativeCandidate)
    }

    const candidates = [
      `${path}.ts`,
      `${path}.tsx`,
      `${path}.mts`,
      `${path}.cts`,
      `${path}.js`,
      `${path}.jsx`,
      `${path}.mjs`,
      `${path}.cjs`,
      `${path}.json`,
      `${path}/index.ts`,
      `${path}/index.tsx`,
      `${path}/index.mts`,
      `${path}/index.cts`,
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

  private resolvePackageEntry(dirPath: string, isEsmParent: boolean, subpath?: string | null): string | null {
    const pkgJsonPath = `${dirPath}/package.json`
    if (!this.vfs.exists(pkgJsonPath)) {
      if (subpath) {
        const target = join(dirPath, subpath)
        return this.resolveWithExtensions(target, isEsmParent)
      }
      return this.resolveIndex(dirPath)
    }

    const pkg = this.readPackageJson(pkgJsonPath)
    if (!pkg) {
      return this.resolveIndex(dirPath)
    }

    if (pkg.type === 'module' || pkg.type === 'commonjs') {
      this.packageTypeCache.set(dirPath, pkg.type)
    }

    const exportsTarget = this.resolveExports(pkg.exports, isEsmParent, subpath)
    if (exportsTarget) {
      const target = join(dirPath, exportsTarget)
      const resolved = this.resolveWithExtensions(target, isEsmParent)
      if (resolved) return resolved
    }

    if (subpath) {
      const target = join(dirPath, subpath)
      const resolved = this.resolveWithExtensions(target, isEsmParent)
      if (resolved) return resolved
    }

    const preferModule = isEsmParent || pkg.type === 'module'
    if (preferModule && pkg.module) {
      const target = join(dirPath, pkg.module)
      const resolved = this.resolveWithExtensions(target, isEsmParent)
      if (resolved) return resolved
    }

    if (pkg.main) {
      const target = join(dirPath, pkg.main)
      const resolved = this.resolveWithExtensions(target, isEsmParent)
      if (resolved) return resolved
    }

    return this.resolveIndex(dirPath)
  }

  private resolveExports(exportsField: unknown, isEsmParent = false, subpath?: string | null): string | null {
    if (!exportsField) return null
    const conditions = this.getConditions(isEsmParent)

    if (typeof exportsField === 'string') {
      return subpath ? null : exportsField
    }

    if (Array.isArray(exportsField)) {
      for (const entry of exportsField) {
        const resolved = this.resolveExports(entry, isEsmParent, subpath)
        if (resolved) return resolved
      }
      return null
    }

    if (typeof exportsField !== 'object') {
      return null
    }

    const key = subpath ? `./${subpath}` : '.'
    const match = this.matchExportsTarget(exportsField as Record<string, unknown>, key)
    if (match) {
      const resolved = this.resolveExportsTarget(match.target, conditions)
      if (!resolved) return null
      return this.replaceExportPattern(match.pattern, key, resolved)
    }

    if (!subpath && '.' in (exportsField as Record<string, unknown>)) {
      const entry = (exportsField as Record<string, unknown>)['.']
      const resolved = this.resolveExportsTarget(entry, conditions)
      if (resolved) return resolved
    }

    return this.resolveExportsTarget(exportsField as Record<string, unknown>, conditions)
  }

  private resolveExportsTarget(entry: unknown, conditions: ResolveConditions): string | null {
    if (!entry) return null
    if (typeof entry === 'string') return entry

    if (Array.isArray(entry)) {
      for (const item of entry) {
        const resolved = this.resolveExportsTarget(item, conditions)
        if (resolved) return resolved
      }
      return null
    }

    if (typeof entry !== 'object') return null

    const record = entry as Record<string, unknown>
    for (const condition of conditions) {
      if (condition in record) {
        const resolved = this.resolveExportsTarget(record[condition], conditions)
        if (resolved) return resolved
      }
    }

    if ('default' in record) {
      return this.resolveExportsTarget(record.default, conditions)
    }

    return null
  }

  private matchExportsTarget(exportsField: Record<string, unknown>, key: string): ExportPatternMatch | null {
    if (key in exportsField) {
      return { pattern: key, substitute: key, target: exportsField[key] as ExportsTarget }
    }

    const matches: ExportPatternMatch[] = []
    for (const pattern of Object.keys(exportsField)) {
      if (!pattern.includes('*')) continue
      const match = this.matchExportPattern(pattern, key)
      if (match !== null) {
        matches.push({ pattern, substitute: match, target: exportsField[pattern] as ExportsTarget })
      }
    }

    if (matches.length === 0) return null
    matches.sort((a, b) => b.pattern.length - a.pattern.length)
    return matches[0]
  }

  private matchExportPattern(pattern: string, key: string): string | null {
    const [prefix, suffix] = pattern.split('*')
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) return null
    return key.slice(prefix.length, key.length - suffix.length)
  }

  private replaceExportPattern(pattern: string, key: string, target: string): string {
    if (!pattern.includes('*')) return target
    const substitute = this.matchExportPattern(pattern, key)
    if (substitute === null) return target
    return target.replace('*', substitute)
  }

  private resolveIndex(dirPath: string): string | null {
    const candidates = [
      `${dirPath}/index.ts`,
      `${dirPath}/index.tsx`,
      `${dirPath}/index.mts`,
      `${dirPath}/index.cts`,
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
      case '.mts':
      case '.cts':
        return 'ts'
      case '.cjs':
        return 'cjs'
      case '.json':
        return 'json'
      default:
        return 'js'
    }
  }

  private nativeAddonError(path: string): Error {
    return new Error(`Native addon not supported in browser runtime: ${path}`)
  }

  private reportLoadError(err: unknown, id: string, parent?: string): void {
    const error = err instanceof Error ? err : new Error(String(err))
    this.hooks?.onError?.(error, id, parent)
  }

  private applyInterop(module: ModuleRecord, resolved: string, source: string): void {
    const moduleType = this.getModuleTypeForPath(resolved)
    const isEsm = moduleType === 'esm' || this.isEsmSyntax(source)
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
      tryAssign('__esModule', true)
      return
    }

    if (!('default' in exportsObj)) {
      tryAssign('default', exportsObj)
    }
  }

  private isEsmSyntax(source: string): boolean {
    return /(^|\n)\s*(import|export)\s+/m.test(source)
  }

  private getModuleTypeForPath(resolved: string): 'esm' | 'cjs' {
    const ext = extname(resolved)
    if (ext === '.mjs' || ext === '.mts') return 'esm'
    if (ext === '.cjs' || ext === '.cts') return 'cjs'

    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      const pkgType = this.findPackageType(dirname(resolved))
      return pkgType === 'module' ? 'esm' : 'cjs'
    }

    return 'cjs'
  }

  private findPackageType(startDir: string): 'module' | 'commonjs' | null {
    const cached = this.packageTypeCache.get(startDir)
    if (cached !== undefined) return cached

    const pkgJsonPath = `${startDir}/package.json`
    if (this.vfs.exists(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(this.vfs.readFile(pkgJsonPath)) as { type?: 'module' | 'commonjs' }
        const type = pkg.type ?? null
        this.packageTypeCache.set(startDir, type)
        return type
      } catch {
        this.packageTypeCache.set(startDir, null)
        return null
      }
    }

    if (startDir === '/' || startDir === '') {
      this.packageTypeCache.set(startDir, null)
      return null
    }

    const parent = dirname(startDir)
    const type = this.findPackageType(parent)
    this.packageTypeCache.set(startDir, type)
    return type
  }

  private getConditions(isEsmParent: boolean): ResolveConditions {
    if (isEsmParent) {
      return ['import', 'module', 'bun', 'browser', 'default', 'node', 'require']
    }
    return ['require', 'bun', 'browser', 'node', 'default', 'import', 'module']
  }

  private findNearestPackageJson(startDir: string): string | null {
    let current = startDir
    while (true) {
      const normalized = current.endsWith('/') ? current.slice(0, -1) : current
      const candidate = `${normalized || ''}/package.json`
      if (this.vfs.exists(candidate)) return candidate
      if (normalized === '' || normalized === '/') return null
      const parts = normalized.split('/').filter(Boolean)
      parts.pop()
      current = parts.length === 0 ? '/' : `/${parts.join('/')}`
    }
  }

  private readPackageJson(path: string): PackageJson | null {
    try {
      return JSON.parse(this.vfs.readFile(path)) as PackageJson
    } catch {
      return null
    }
  }

  private resolveModulePrefix(runtime: RuntimeGlobals): string | undefined {
    const processLike = runtime.process as { env?: Record<string, string> } | undefined
    return processLike?.env?.VITAMIN_MODULE_PREFIX
  }
}

function isUnavailableModule(exports: Record<string, unknown> | undefined): exports is { __unavailable: string } {
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

*/
