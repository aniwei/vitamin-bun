type FetchLike = typeof fetch

type FetchWithPreconnect = FetchLike & {
  preconnect?: (url: string | URL) => void
}

type WarnFn = (message: string) => void

type FetchOptions = RequestInit & {
  proxy?: unknown
  tls?: unknown
  unix?: unknown
}

const defaultWarn: WarnFn = (message) => {
  console.warn(message)
}

function warnUnsupportedOptions(init: unknown, warnOnce: (key: string, message: string) => void): void {
  if (!init || typeof init !== 'object') return
  const options = init as FetchOptions
  if (options.proxy != null) {
    warnOnce('fetch.proxy', 'fetch option "proxy" is not supported in browser runtime')
  }
  if (options.tls != null) {
    warnOnce('fetch.tls', 'fetch option "tls" is not supported in browser runtime')
  }
  if (options.unix != null) {
    warnOnce('fetch.unix', 'fetch option "unix" is not supported in browser runtime')
  }
}

export function wrapFetchWithWarnings(fetchImpl: FetchLike, warn: WarnFn = defaultWarn): FetchWithPreconnect {
  const warnedKeys = new Set<string>()

  const warnOnce = (key: string, message: string) => {
    if (warnedKeys.has(key)) return
    warnedKeys.add(key)
    warn(message)
  }

  const wrapped = ((input: RequestInfo | URL, init?: RequestInit) => {
    warnUnsupportedOptions(init, warnOnce)
    return fetchImpl(input, init)
  }) as FetchWithPreconnect

  wrapped.preconnect = (url: string | URL) => {
    warnOnce('fetch.preconnect', 'fetch.preconnect is not supported in browser runtime')
    void url
  }

  return wrapped
}

export function installFetchWarnings(): void {
  const globalScope = globalThis as {
    fetch?: FetchWithPreconnect
    __vitaminFetchWarningsInstalled?: boolean
  }

  if (globalScope.__vitaminFetchWarningsInstalled) return
  if (typeof globalScope.fetch !== 'function') return

  globalScope.fetch = wrapFetchWithWarnings(globalScope.fetch)
  globalScope.__vitaminFetchWarningsInstalled = true
}
