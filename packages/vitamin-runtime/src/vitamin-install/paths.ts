export function joinPath(...parts: string[]): string {
  const joined = parts.join('/')
  const normalized = joined.replace(/\/+|\\+/g, '/').replace(/\/+$/, '') || '/'
  if (parts[0]?.startsWith('/') && !normalized.startsWith('/')) {
    return `/${normalized}`
  }
  return normalized
}

export function normalizeRoot(path: string): string {
  if (!path.startsWith('/')) return `/${path}`
  return path
}
