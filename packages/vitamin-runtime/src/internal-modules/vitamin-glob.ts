import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import { Minimatch, type MinimatchOptions } from 'minimatch'

export type BunGlobOptions = {
  cwd?: string
  absolute?: boolean
  dot?: boolean
  nocase?: boolean
  ignore?: string | string[]
  brace?: boolean
  extglob?: boolean
  matchBase?: boolean
}

export function createBunGlobModule(vfs: VirtualFileSystem): Record<string, unknown> {
  const runGlob = (pattern: string | string[], options?: BunGlobOptions) => {
    const cwd = normalizePath(options?.cwd ?? '/')
    const patterns = Array.isArray(pattern) ? pattern : [pattern]
    const matchOptions = toMinimatchOptions(options)
    const matchers = patterns.map((patternValue) => {
      const absolutePattern = patternValue.startsWith('/')
        ? normalizePath(patternValue)
        : joinPath(cwd, patternValue)
      return new Minimatch(absolutePattern, matchOptions)
    })
    const ignoreMatchers = normalizeIgnore(options?.ignore, cwd).map(
      (ignorePattern) => new Minimatch(ignorePattern, matchOptions),
    )
    const matches: string[] = []
    for (const path of walkFiles(vfs, cwd)) {
      if (!matchers.some((matcher) => matcher.match(path))) continue
      if (ignoreMatchers.some((matcher) => matcher.match(path))) continue
      matches.push(options?.absolute === false ? stripPrefix(path, cwd) : path)
    }
    return matches
  }
  return {
    glob(pattern: string | string[], options?: BunGlobOptions) {
      return runGlob(pattern, options)
    },
    globSync(pattern: string | string[], options?: BunGlobOptions) {
      return runGlob(pattern, options)
    },
    hasMagic(pattern: string | string[], options?: BunGlobOptions) {
      const matchOptions = toMinimatchOptions(options)
      const patterns = Array.isArray(pattern) ? pattern : [pattern]
      return patterns.some((value) => new Minimatch(value, matchOptions).hasMagic())
    },
    makeRe(pattern: string, options?: BunGlobOptions) {
      const matcher = new Minimatch(pattern, toMinimatchOptions(options))
      return matcher.makeRe()
    },
    match(path: string, pattern: string, options?: BunGlobOptions) {
      const matcher = new Minimatch(pattern, toMinimatchOptions(options))
      return matcher.match(path)
    },
    filter(pattern: string, options?: BunGlobOptions) {
      const matcher = new Minimatch(pattern, toMinimatchOptions(options))
      return (path: string) => matcher.match(path)
    },
  }
}

function walkFiles(vfs: VirtualFileSystem, root: string): string[] {
  const results: string[] = []
  let entries: ReturnType<VirtualFileSystem['readdir']>
  try {
    entries = vfs.readdir(root)
  } catch {
    return results
  }
  for (const entry of entries) {
    const path = joinPath(root, entry.name)
    if (entry.kind === 'directory') {
      results.push(...walkFiles(vfs, path))
    } else {
      results.push(path)
    }
  }
  return results
}

function toMinimatchOptions(options?: BunGlobOptions): MinimatchOptions {
  return {
    dot: options?.dot ?? false,
    nocase: options?.nocase ?? false,
    nobrace: options?.brace === false,
    noext: options?.extglob === false,
    matchBase: options?.matchBase ?? false,
  }
}

function normalizeIgnore(ignore: BunGlobOptions['ignore'], cwd: string): string[] {
  if (!ignore) return []
  const patterns = Array.isArray(ignore) ? ignore : [ignore]
  return patterns.map((pattern) =>
    pattern.startsWith('/') ? normalizePath(pattern) : joinPath(cwd, pattern),
  )
}

function normalizePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/g, '')
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function joinPath(...parts: string[]): string {
  const joined = parts.join('/').replace(/\\/g, '/')
  const normalized = joined.replace(/\/+/, '/').replace(/\/+$/g, '') || '/'
  if (parts[0]?.startsWith('/') && !normalized.startsWith('/')) {
    return `/${normalized}`
  }
  return normalized
}

function stripPrefix(path: string, prefix: string): string {
  if (path.startsWith(prefix)) {
    const trimmed = path.slice(prefix.length)
    return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
  }
  return path
}
