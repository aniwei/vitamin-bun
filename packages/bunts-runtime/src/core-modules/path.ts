import { dirname, extname, normalizePath } from '../path'

export function createPathModule() {
  const parse = (path: string) => {
    const normalized = normalizePath(path)
    const lastSlash = normalized.lastIndexOf('/')
    const base = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized
    const dir = lastSlash >= 0 ? normalized.slice(0, lastSlash) || '/' : ''
    const dot = base.lastIndexOf('.')
    const ext = dot > 0 ? base.slice(dot) : ''
    const name = dot > 0 ? base.slice(0, dot) : base
    return {
      root: normalized.startsWith('/') ? '/' : '',
      dir,
      base,
      ext,
      name,
    }
  }

  const format = (pathObject: { root?: string; dir?: string; base?: string; name?: string; ext?: string }) => {
    const dir = pathObject.dir ?? ''
    const base = pathObject.base ?? `${pathObject.name ?? ''}${pathObject.ext ?? ''}`
    if (!dir) return base
    return normalizePath(`${dir}/${base}`)
  }

  return {
    join: (...parts: string[]) => normalizePath(parts.join('/')),
    dirname,
    extname,
    resolve: (...parts: string[]) => normalizePath(parts.join('/')),
    normalize: normalizePath,
    isAbsolute: (path: string) => path.startsWith('/'),
    parse,
    format,
    basename: (path: string) => {
      const normalized = normalizePath(path)
      const idx = normalized.lastIndexOf('/')
      return idx >= 0 ? normalized.slice(idx + 1) : normalized
    },
  }
}
