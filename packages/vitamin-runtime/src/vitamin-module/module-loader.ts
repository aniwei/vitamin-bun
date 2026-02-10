import * as ts from 'typescript'
import { Transpiler, type LoaderType } from '../transpiler'
import { dirname, extname, join, normalizePath } from '../path'
import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'

export interface ModuleRecord {
  id: string
  exports: Record<string, unknown>
}

export interface RuntimeGlobals {
  Vitamin: unknown
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
    onModuleRequest?: (id: string, parent?: string) => { id?: string; exports?: Record<string, unknown>; stop?: boolean } | void | Promise<{ id?: string; exports?: Record<string, unknown>; stop?: boolean } | void>
    onModuleLoadError?: (error: Error, id: string, parent?: string) => void
  }
}

type PackageJson = {
  name?: string
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

export class ModuleLoader {
  private vfs: VirtualFileSystem
  private transpiler: Transpiler
  private cache = new Map<string, ModuleRecord>()
  private runtime: RuntimeGlobals
  private coreModules: Record<string, unknown>
  private hooks?: ModuleLoaderOptions['hooks']
  private loggedDependencies = new Set<string>()
  private packageTypeCache = new Map<string, 'module' | 'commonjs' | null>()

  constructor(options: ModuleLoaderOptions) {
    this.vfs = options.vfs
    this.transpiler = options.transpiler
    this.runtime = options.runtime
    this.coreModules = options.coreModules ?? {}
    this.hooks = options.hooks
  }

  async load(entry: string, parent?: string): Promise<ModuleRecord> {
    try {
      const resolveResult = await this.hooks?.onModuleResolve?.(entry, parent)
      if (resolveResult?.id) {
        entry = resolveResult.id
        if (resolveResult.stop) {
          return { id: resolveResult.id, exports: {} }
        }
      }

      const hookResult = await this.hooks?.onModuleRequest?.(entry, parent)
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
      const { code } = this.transpiler.compile(source, loader, resolved)

      const module: ModuleRecord = { id: resolved, exports: {} }
      this.cache.set(resolved, module)

      this.preloadDependencies(source, resolved, loader)

      const require = (id: string) => this.loadSync(id, resolved).exports

      const fn = new Function(
        'require',
        'module',
        'exports',
        '__filename',
        '__dirname',
        'Vitamin',
        'process',
        'console',
        code,
      ) as (
        require: (id: string) => unknown,
        module: { exports: Record<string, unknown> },
        exports: Record<string, unknown>,
        __filename: string,
        __dirname: string,
        Vitamin: unknown,
        process: unknown,
        console: Console,
      ) => void

      try {
        fn(
          require,
          module as { exports: Record<string, unknown> },
          module.exports,
          resolved,
          dirname(resolved),
          this.runtime.Vitamin,
          this.runtime.process,
          this.runtime.console,
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`Module execution failed: ${resolved}\n${message}`)
      }

      this.applyInterop(module, resolved, source)

      return module
    } catch (err) {
      this.reportLoadError(err, entry, parent)
      throw err
    }
  }

  loadSync(entry: string, parent?: string): ModuleRecord {
    try {
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

      let hookResult = this.hooks?.onModuleRequest?.(entry, parent)
      if (isPromise(hookResult)) {
        console.warn('onModuleRequest returned a Promise in loadSync; ignoring async result')
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
      const { code } = this.transpiler.compile(source, loader, resolved)

      const module: ModuleRecord = { id: resolved, exports: {} }
      this.cache.set(resolved, module)

      this.preloadDependencies(source, resolved, loader)

      const require = (id: string) => this.loadSync(id, resolved).exports

      const fn = new Function(
        'require',
        'module',
        'exports',
        '__filename',
        '__dirname',
        'Vitamin',
        'process',
        'console',
        code,
      ) as (
        require: (id: string) => unknown,
        module: { exports: Record<string, unknown> },
        exports: Record<string, unknown>,
        __filename: string,
        __dirname: string,
        Vitamin: unknown,
        process: unknown,
        console: Console,
      ) => void

      try {
        fn(
          require,
          module as { exports: Record<string, unknown> },
          module.exports,
          resolved,
          dirname(resolved),
          this.runtime.Vitamin,
          this.runtime.process,
          this.runtime.console,
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`Module execution failed: ${resolved}\n${message}`)
      }

      this.applyInterop(module, resolved, source)

      return module
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

  private resolvePackageImports(entry: string, baseDir: string, isEsmParent: boolean): string | null {
    const pkgJsonPath = this.findNearestPackageJson(baseDir)
    if (!pkgJsonPath) return null
    const pkg = this.readPackageJson(pkgJsonPath)
    const importsField = pkg?.imports
    if (!importsField || typeof importsField !== 'object') return null

    const conditions = this.getConditions(isEsmParent)
    const key = entry
    const match = this.matchExportsTarget(importsField as Record<string, unknown>, key)
    if (match) {
      const target = this.resolveExportsTarget(match.target, conditions)
      if (target) {
        const resolvedTarget = this.replaceExportPattern(match.pattern, key, target)
        const base = dirname(pkgJsonPath)
        const absolute = resolvedTarget.startsWith('.') ? join(base, resolvedTarget) : resolvedTarget
        return this.resolveWithExtensions(absolute, isEsmParent) ?? absolute
      }
    }
    return null
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

  private resolvePackageEntry(
    dirPath: string,
    isEsmParent: boolean,
    subpath?: string | null,
  ): string | null {
    const pkgJsonPath = `${dirPath}/package.json`
    if (!this.vfs.exists(pkgJsonPath)) {
      if (subpath) {
        const target = join(dirPath, subpath)
        const resolved = this.resolveWithExtensions(target, isEsmParent)
        if (resolved) return resolved
        return null
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

  private resolveExports(
    exportsField: unknown,
    isEsmParent = false,
    subpath?: string | null,
  ): string | null {
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
    if (typeof exportsField === 'object') {
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

    return null
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
      const resolved = this.resolveExportsTarget(record.default, conditions)
      if (resolved) return resolved
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
      if (match) {
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
        return 'ts'
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
    this.hooks?.onModuleLoadError?.(error, id, parent)
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

  private preloadDependencies(source: string, currentPath: string, loader: LoaderType): void {
    if (!this.isJsLikeLoader(loader)) return
    const deps = this.scanDependenciesAst(source, currentPath)
    for (const dep of deps) {
      this.logDependency(currentPath, dep)
      const normalized = this.normalizeCoreModuleId(dep)
      if (this.isCoreModule(normalized)) continue
      try {
        this.loadSync(dep, currentPath)
      } catch {
        // ignore resolution errors during preload
      }
    }
  }

  private logDependency(currentPath: string, dep: string): void {
    const key = `${currentPath}::${dep}`
    if (this.loggedDependencies.has(key)) return
    this.loggedDependencies.add(key)
    this.runtime.console.log(`import: ${currentPath} -> ${dep}`)
  }

  private scanDependenciesAst(source: string, fileName: string): string[] {
    const deps = new Set<string>()
    const scriptKind = this.getScriptKind(fileName)
    const sourceFile = ts.createSourceFile(
      fileName,
      source,
      ts.ScriptTarget.ES2020,
      true,
      scriptKind,
    )

    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const spec = node.moduleSpecifier
        if (spec && ts.isStringLiteralLike(spec)) {
          deps.add(spec.text)
        }
      } else if (ts.isImportEqualsDeclaration(node)) {
        const ref = node.moduleReference
        if (ts.isExternalModuleReference(ref)) {
          const expr = ref.expression
          if (expr && ts.isStringLiteralLike(expr)) {
            deps.add(expr.text)
          }
        }
      } else if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const arg = node.arguments[0]
          if (arg && ts.isStringLiteralLike(arg)) {
            deps.add(arg.text)
          }
        } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
          const arg = node.arguments[0]
          if (arg && ts.isStringLiteralLike(arg)) {
            deps.add(arg.text)
          }
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)

    return Array.from(deps)
  }

  private isJsLikeLoader(loader: LoaderType): boolean {
    return loader === 'js' || loader === 'jsx' || loader === 'ts' || loader === 'tsx' || loader === 'mjs' || loader === 'cjs'
  }

  private getScriptKind(fileName: string): ts.ScriptKind {
    const ext = extname(fileName)
    switch (ext) {
      case '.ts':
        return ts.ScriptKind.TS
      case '.tsx':
        return ts.ScriptKind.TSX
      case '.mts':
        return ts.ScriptKind.TS
      case '.cts':
        return ts.ScriptKind.TS
      case '.jsx':
        return ts.ScriptKind.JSX
      case '.mjs':
        return ts.ScriptKind.JS
      case '.cjs':
        return ts.ScriptKind.JS
      default:
        return ts.ScriptKind.JS
    }
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
    if (raw.startsWith('child_process')) return 'child_process'
    if (raw.startsWith('https')) return 'https'
    if (raw.startsWith('http')) return 'http'
    if (raw.startsWith('tls')) return 'tls'
    if (raw.startsWith('net')) return 'net'
    return raw
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
      const pkg = JSON.parse(this.vfs.readFile(path)) as PackageJson
      return pkg
    } catch {
      return null
    }
  }
}

function isPromise(value: unknown): value is Promise<unknown> {
  return Boolean(value) && typeof (value as Promise<unknown>).then === 'function'
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
