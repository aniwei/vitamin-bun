export type Next = () => Promise<globalThis.Response | undefined>

export class Request {
  constructor(private ctx: Context) {}

  get raw(): globalThis.Request {
    return this.ctx.request
  }

  get method(): string {
    return this.ctx.request.method
  }

  get url(): URL {
    return this.ctx.url
  }

  get path(): string {
    return this.ctx.url.pathname
  }

  header(name: string): string | undefined {
    return this.ctx.request.headers.get(name) ?? undefined
  }

  query(name: string): string | undefined {
    return this.ctx.url.searchParams.get(name) ?? undefined
  }

  queries(name: string): string[] {
    return this.ctx.url.searchParams.getAll(name)
  }

  param(name: string): string | undefined {
    return this.ctx.params[name]
  }

  async text(): Promise<string> {
    return this.ctx.request.text()
  }

  async json<T = unknown>(): Promise<T> {
    return this.ctx.request.json() as Promise<T>
  }

  async formData(): Promise<FormData> {
    return this.ctx.request.formData()
  }
}

export class Response {
  private headers = new Headers()
  private statusCode: number | undefined

  status(code: number): this {
    this.statusCode = code
    return this
  }

  header(name: string, value: string): this {
    this.headers.set(name, value)
    return this
  }

  build(init: ResponseInit | undefined, defaults: Record<string, string> = {}): ResponseInit {
    const headers = resolveHeaders(this.headers, init?.headers, defaults)
    const status = init?.status ?? this.statusCode
    return status !== undefined ? { ...init, status, headers } : { ...init, headers }
  }
}

interface ContextOptions<T extends Router = Router> {
  app: T,
  event: FetchEvent
  request: globalThis.Request
  url: URL
}

export class Context<T extends Router = Router> {
  readonly app: T
  readonly event: FetchEvent
  readonly request: globalThis.Request
  readonly url: URL
  #req: Request
  #res: Response
  

  get req(): Request {
    return this.#req
  }

  get res(): Response {
    return this.#res
  }

  #params: Record<string, string>
  get params(): Record<string, string> {
    return this.#params
  }
  set params(value: Record<string, string>) {
    this.#params = value
  }

  constructor(options: ContextOptions<T>) {
    this.event = options.event
    this.request = options.request
    this.url = options.url

    this.#params = {}
    this.app = options.app
    this.#req = new Request(this)
    this.#res = new Response()
  }

  header(name: string, value: string): void {
    this.#res.header(name, value)
  }

  text(body: string, init: ResponseInit = {}): globalThis.Response {
    const responseInit = this.#res.build(init, {
      'content-type': 'text/plain; charset=utf-8',
    })
    return new globalThis.Response(body, responseInit)
  }

  json(data: unknown, init: ResponseInit = {}): globalThis.Response {
    const responseInit = this.#res.build(init, {
      'content-type': 'application/json; charset=utf-8',
    })
    return new globalThis.Response(JSON.stringify(data), responseInit)
  }

  html(body: string, init: ResponseInit = {}): globalThis.Response {
    const responseInit = this.#res.build(init, {
      'content-type': 'text/html; charset=utf-8',
    })
    return new globalThis.Response(body, responseInit)
  }

  redirect(location: string, status: number = 302): globalThis.Response {
    this.#res.status(status)
    const responseInit = this.#res.build(undefined, { location })
    return new globalThis.Response(null, responseInit)
  }
}

export type RouterHandler = (
  ctx: Context,
  next: Next,
) => Promise<globalThis.Response | void> | globalThis.Response | void

type RouteLayer = {
  method: string
  pattern: string
  keys: string[]
  regex: RegExp
  handler: RouterHandler
}

export class Router {
  private routes: RouteLayer[] = []

  use(...handlers: RouterHandler[]): this
  use(pattern: string, ...handlers: RouterHandler[]): this
  use(patternOrHandler: string | RouterHandler, ...handlers: RouterHandler[]): this {
    if (typeof patternOrHandler === 'string') {
      this.add('ALL', patternOrHandler, handlers)
      return this
    }

    this.add('ALL', '/*', [patternOrHandler, ...handlers])
    return this
  }

  on(method: string, pattern: string, ...handlers: RouterHandler[]): this {
    this.add(method.toUpperCase(), pattern, handlers)
    return this
  }

  all(pattern: string, ...handlers: RouterHandler[]): this {
    return this.on('ALL', pattern, ...handlers)
  }

  get(pattern: string, ...handlers: RouterHandler[]): this {
    return this.on('GET', pattern, ...handlers)
  }

  post(pattern: string, ...handlers: RouterHandler[]): this {
    return this.on('POST', pattern, ...handlers)
  }

  put(pattern: string, ...handlers: RouterHandler[]): this {
    return this.on('PUT', pattern, ...handlers)
  }

  delete(pattern: string, ...handlers: RouterHandler[]): this {
    return this.on('DELETE', pattern, ...handlers)
  }

  patch(pattern: string, ...handlers: RouterHandler[]): this {
    return this.on('PATCH', pattern, ...handlers)
  }

  options(pattern: string, ...handlers: RouterHandler[]): this {
    return this.on('OPTIONS', pattern, ...handlers)
  }

  async dispatch(ctx: Context): Promise<globalThis.Response | undefined> {
    const routes = this.routes
    let index = -1

    const run = async (i: number): Promise<globalThis.Response | undefined> => {
      index = i
      const layer = routes[i]
      if (!layer) return undefined

      if (!matchesMethod(layer.method, ctx.request.method)) {
        return run(i + 1)
      }

      const match = layer.regex.exec(ctx.url.pathname)
      if (!match) {
        return run(i + 1)
      }

      const prevParams = ctx.params
      const params: Record<string, string> = {}
      layer.keys.forEach((key, idx) => {
        params[key] = match[idx + 1] ?? ''
      })
      ctx.params = params

      const result = await layer.handler(ctx, () => run(i + 1))
      ctx.params = prevParams

      if (result instanceof globalThis.Response) return result
      return result ?? run(i + 1)
    }

    return run(0)
  }

  async handle(ctx: Context): Promise<globalThis.Response> {
    const response = await this.dispatch(ctx)
    return response ?? fetch(ctx.request)
  }

  private add(method: string, pattern: string, handlers: RouterHandler[]): void {
    if (handlers.length === 0) return
    const compiled = compileRoute(pattern)
    for (const handler of handlers) {
      this.routes.push({ method, pattern, ...compiled, handler })
    }
  }
}

function matchesMethod(routeMethod: string, requestMethod: string): boolean {
  if (routeMethod === 'ALL') return true
  return routeMethod === requestMethod.toUpperCase()
}

function compileRoute(pattern: string): { keys: string[]; regex: RegExp } {
  const normalized = pattern.startsWith('/') ? pattern : `/${pattern}`
  const segments = normalized.split('/').filter(Boolean)
  const keys: string[] = []

  let regex = '^'
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment.startsWith('*')) {
      const key = segment.slice(1) || 'wild'
      keys.push(key)
      regex += '(?:/(.*))?'
      break
    }
    if (segment.startsWith(':')) {
      const optional = segment.endsWith('?')
      const name = segment.slice(1, optional ? -1 : undefined)
      keys.push(name)
      regex += optional ? '(?:/([^/]+))?' : '/([^/]+)'
      continue
    }
    regex += `/${escapeRegex(segment)}`
  }

  regex += '/?$'
  return { keys, regex: new RegExp(regex) }
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function resolveHeaders(
  base: Headers,
  overrides: HeadersInit | undefined,
  defaults: Record<string, string>,
): Headers {
  const headers = new Headers(base)
  if (overrides) {
    const overrideHeaders = new Headers(overrides)
    overrideHeaders.forEach((value, key) => {
      headers.set(key, value)
    })
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (!headers.has(key)) {
      headers.set(key, value)
    }
  }
  return headers
}
