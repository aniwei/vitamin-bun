export function normalizePath(path: string): string {
  const isAbs = path.startsWith('/')
  const parts = path.split('/').filter((p) => p.length > 0 && p !== '.')
  const stack: string[] = []

  for (const part of parts) {
    if (part === '..') {
      if (stack.length > 0) stack.pop()
    } else {
      stack.push(part)
    }
  }

  return (isAbs ? '/' : '') + stack.join('/')
}

export function dirname(path: string): string {
  const normalized = normalizePath(path)
  const idx = normalized.lastIndexOf('/')
  if (idx <= 0) return '/'
  return normalized.slice(0, idx)
}

export function join(base: string, target: string): string {
  if (target.startsWith('/')) return normalizePath(target)
  return normalizePath(`${base}/${target}`)
}

export function extname(path: string): string {
  const idx = path.lastIndexOf('.')
  if (idx < 0) return ''
  return path.slice(idx)
}
