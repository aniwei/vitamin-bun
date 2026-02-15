export function createUrlModule() {
  function pathToFileURL(path: string): URL {
    const normalized = path.startsWith('/') ? path : `/${path}`
    return new URL(`file://${normalized}`)
  }

  function fileURLToPath(url: string | URL): string {
    const value = typeof url === 'string' ? new URL(url) : url
    if (value.protocol !== 'file:') {
      throw new Error('Invalid file URL')
    }
    return decodeURIComponent(value.pathname)
  }

  return {
    URL,
    URLSearchParams,
    pathToFileURL,
    fileURLToPath,
  }
}
