import type { RuntimeCore } from '@vitamin-ai/vitamin-runtime'
import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'

type SourceResult = {
  code: string
  resolved: string
}

const CORE_MODULES = new Set([
  'fs',
  'fs/promises',
  'timers',
  'timers/promises',
  'events',
  'crypto',
  'assert',
  'assert/strict',
  'util',
  'stream',
  'stream/promises',
  'stream/web',
  'os',
  'path',
  'path/posix',
  'path/win32',
  'buffer',
  'url',
  'child_process',
  'querystring',
  'string_decoder',
  'perf_hooks',
  'async_hooks',
  'scheduler',
  'inspector',
  'module',
  'tty',
  'constants',
  'punycode',
  'diagnostics_channel',
  'http',
  'https',
  'net',
  'tls',
  'zlib',
  'worker_threads',
  'process',
])

export class ModuleSourceLoader {
  private sourceCache = new Map<string, string>()

  constructor(
    private readonly vfs: VirtualFileSystem,
    private readonly runtime: RuntimeCore,
  ) {}

  async load(specifier: string, parent?: string): Promise<SourceResult> {
    const decoded = decodeURIComponent(specifier)
    const coreId = this.normalizeCoreModuleId(decoded)

    if (this.isCoreModule(coreId)) {
      const cacheKey = `core:${coreId}`
      const cached = this.sourceCache.get(cacheKey)
      if (cached) {
        return { code: cached, resolved: cacheKey }
      }
      const wrapper = this.createCoreWrapper(coreId)
      this.sourceCache.set(cacheKey, wrapper)
      return { code: wrapper, resolved: cacheKey }
    }

    const resolved = this.resolvePath(decoded, parent)
    const cached = this.sourceCache.get(resolved)
    if (cached) {
      return { code: cached, resolved }
    }

    const source = this.vfs.readFile(resolved)
    const loader = this.guessLoader(resolved)
    const compiled = await this.runtime.compile(source, loader, resolved)
    this.sourceCache.set(resolved, compiled.code)
    return {
      code: compiled.code,
      resolved,
    }
  }

  private resolvePath(specifier: string, parent?: string): string {
    if (specifier.startsWith('.')) {
      const parentPath = this.extractParentPath(parent)
      const from = this.dirname(parentPath)
      const joined = this.normalizePath(`${from}/${specifier}`)
      return this.resolveWithExtensions(joined)
    }

    const normalized = this.normalizePath(specifier.startsWith('/') ? specifier : `/${specifier}`)

    if (this.vfs.exists(normalized)) {
      return normalized
    }

    if (normalized.includes('/node_modules/')) {
      return this.resolveWithExtensions(normalized)
    }

    const bare = normalized.slice(1)
    if (!bare.includes('/')) {
      const fromRoot = `/node_modules/${bare}`
      return this.resolvePackageEntry(fromRoot)
    }

    const [pkg, ...subpathParts] = bare.split('/')
    const subpath = subpathParts.join('/')
    return this.resolvePackageEntry(`/node_modules/${pkg}`, subpath)
  }

  private resolvePackageEntry(packageDir: string, subpath?: string): string {
    const pkgJsonPath = `${packageDir}/package.json`
    if (this.vfs.exists(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(this.vfs.readFile(pkgJsonPath)) as {
          module?: string
          main?: string
          exports?: Record<string, unknown>
        }

        if (subpath) {
          return this.resolveWithExtensions(`${packageDir}/${subpath}`)
        }

        const exportsDot = pkg.exports && typeof pkg.exports === 'object'
          ? pkg.exports['.']
          : undefined
        if (typeof exportsDot === 'string') {
          return this.resolveWithExtensions(`${packageDir}/${exportsDot}`)
        }

        if (typeof pkg.module === 'string') {
          return this.resolveWithExtensions(`${packageDir}/${pkg.module}`)
        }

        if (typeof pkg.main === 'string') {
          return this.resolveWithExtensions(`${packageDir}/${pkg.main}`)
        }
      } catch {
        // ignore invalid package.json
      }
    }

    if (subpath) {
      return this.resolveWithExtensions(`${packageDir}/${subpath}`)
    }

    return this.resolveWithExtensions(`${packageDir}/index`)
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
      if (this.vfs.exists(candidate)) return candidate
    }

    throw new Error(`MODULE_NOT_FOUND: ${basePath}`)
  }

  private guessLoader(path: string): string {
    if (path.endsWith('.ts')) return 'ts'
    if (path.endsWith('.tsx')) return 'tsx'
    if (path.endsWith('.jsx')) return 'jsx'
    if (path.endsWith('.mjs')) return 'mjs'
    if (path.endsWith('.cjs')) return 'cjs'
    if (path.endsWith('.json')) return 'json'
    return 'js'
  }

  private isCoreModule(id: string): boolean {
    return CORE_MODULES.has(id)
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

  private createCoreWrapper(coreId: string): string {
    const exportsValue = this.runtime.createRequire('/__module_source_loader__.ts')(coreId) as Record<string, unknown>
    const globalName = '__vitaminCoreModules__'
    const storageKey = `core:${coreId}`

    ;(globalThis as Record<string, unknown>)[globalName] =
      ((globalThis as Record<string, unknown>)[globalName] as Map<string, unknown> | undefined) ??
      new Map<string, unknown>()

    const registry = (globalThis as Record<string, unknown>)[globalName] as Map<string, unknown>
    registry.set(storageKey, exportsValue)

    const namedKeys = Object.keys(exportsValue ?? {}).filter((key) => /^[$A-Z_][0-9A-Z_$]*$/i.test(key))
    const namedLines = namedKeys.map((key) => `export const ${key} = __m[${JSON.stringify(key)}]`)

    return [
      `const __registry = globalThis.${globalName}`,
      `const __m = __registry.get(${JSON.stringify(storageKey)})`,
      ...namedLines,
      `export default __m`,
    ].join('\n')
  }

  private extractParentPath(parent?: string): string {
    if (!parent) return '/index.ts'
    try {
      const url = new URL(parent)
      const marker = '/module/'
      const index = url.pathname.indexOf(marker)
      if (index >= 0) {
        const path = url.pathname.slice(index + marker.length)
        return this.normalizePath(`/${decodeURIComponent(path)}`)
      }
      return '/index.ts'
    } catch {
      return '/index.ts'
    }
  }

  private dirname(path: string): string {
    const normalized = this.normalizePath(path)
    const index = normalized.lastIndexOf('/')
    if (index <= 0) return '/'
    return normalized.slice(0, index)
  }

  private normalizePath(path: string): string {
    const segments = path.split('/').filter(Boolean)
    const output: string[] = []
    for (const segment of segments) {
      if (segment === '.') continue
      if (segment === '..') {
        output.pop()
        continue
      }
      output.push(segment)
    }
    return `/${output.join('/')}`
  }
}
