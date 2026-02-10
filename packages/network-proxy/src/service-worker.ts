const portMap = new Map<number, MessagePort>()
let netProxyPort: MessagePort | null = null

self.addEventListener('install', (event: Event) => {
  ;(self as unknown as ServiceWorkerGlobalScope).skipWaiting()
  void event // keep linter happy
})

self.addEventListener('activate', (event: Event) => {
  const sw = self as unknown as ServiceWorkerGlobalScope
  ;(event as ExtendableEvent).waitUntil(sw.clients.claim())
})

self.addEventListener('message', (event: Event) => {
  const msg = (event as MessageEvent).data as {
    type: 'register' | 'unregister' | 'register-net-proxy' | 'unregister-net-proxy'
    port?: number
    messagePort?: MessagePort
  }

  if (msg.type === 'register' && msg.port !== undefined && msg.messagePort) {
    portMap.set(msg.port, msg.messagePort)
  } else if (msg.type === 'unregister' && msg.port !== undefined) {
    portMap.delete(msg.port)
  } else if (msg.type === 'register-net-proxy' && msg.messagePort) {
    netProxyPort = msg.messagePort
  } else if (msg.type === 'unregister-net-proxy') {
    netProxyPort = null
  }
})

self.addEventListener('fetch', (event: Event) => {
  const fetchEvent = event as FetchEvent
  const url = new URL(fetchEvent.request.url)

  if (url.pathname.startsWith('/@/vitamin_net_proxy')) {
    fetchEvent.respondWith(handleNetProxy(fetchEvent.request, url))
    return
  }

  const magicMatch = matchServePath(url.pathname)
  const port = magicMatch?.port ?? (parseInt(url.port, 10) || 80)

  if (!magicMatch && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    return
  }

  const messagePort = portMap.get(port)
  if (!messagePort) {
    return // Not a virtual server — let the browser handle it.
  }

  const targetUrl = magicMatch
    ? rewriteServeUrl(url, magicMatch.port, magicMatch.rest)
    : url.toString()

  fetchEvent.respondWith(forwardToWasm(fetchEvent.request, messagePort, targetUrl))
})

async function handleNetProxy(request: Request, url: URL): Promise<Response> {
  if (!netProxyPort) {
    return new Response('Net proxy not registered', { status: 503 })
  }

  const host = url.searchParams.get('host') ?? ''
  const port = Number(url.searchParams.get('port') ?? '0')
  const tls = url.searchParams.get('tls') === '1'

  if (!host || !Number.isFinite(port) || port <= 0) {
    return new Response('Invalid host or port', { status: 400, headers: { 'x-vitamin-error-code': 'EINVAL' } })
  }

  return new Promise<Response>((resolve) => {
    const channel = new MessageChannel()
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null
    let resolved = false

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
    })

    const resolveOnce = (status: number, headers?: Record<string, string>) => {
      if (resolved) return
      resolved = true
      resolve(new Response(stream, { status, headers }))
    }

    channel.port1.onmessage = (event: MessageEvent) => {
      const res = event.data as
        | { type: 'net:proxy:connected' }
        | { type: 'net:proxy:data'; data: Uint8Array }
        | { type: 'net:proxy:close' }
        | { type: 'net:proxy:error'; message: string; code?: string }

      if (res.type === 'net:proxy:connected') {
        resolveOnce(200)
        return
      }

      if (res.type === 'net:proxy:data' && streamController) {
        resolveOnce(200)
        streamController.enqueue(res.data)
        return
      }

      if (res.type === 'net:proxy:close' && streamController) {
        resolveOnce(200)
        streamController.close()
        return
      }

      if (res.type === 'net:proxy:error' && streamController) {
        const code = res.code ?? 'ECONNREFUSED'
        resolveOnce(502, { 'x-vitamin-error-code': code })
        streamController.error(new Error(res.message))
      }
    }

    channel.port1.start()
    netProxyPort.postMessage(
      {
        type: 'net:proxy:open',
        host,
        port,
        tls,
        responsePort: channel.port2,
      },
      [channel.port2],
    )

    void pumpRequestBody(request, channel.port1)

    setTimeout(() => resolveOnce(200), 2000)
  })
}

async function pumpRequestBody(request: Request, port: MessagePort): Promise<void> {
  if (!request.body) {
    port.postMessage({ type: 'net:proxy:end' })
    return
  }
  const reader = request.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) port.postMessage({ type: 'net:proxy:send', data: value })
  }
  port.postMessage({ type: 'net:proxy:end' })
}

async function forwardToWasm(
  request: Request,
  port: MessagePort,
  targetUrl: string,
): Promise<Response> {
  const body = request.body
    ? new Uint8Array(await request.arrayBuffer())
    : null

  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })

  return new Promise<Response>((resolve) => {
    const channel = new MessageChannel()

    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
    })

    channel.port1.onmessage = (event: MessageEvent) => {
      const res = event.data as
        | { type: 'serve:response'; status: number; headers: Record<string, string>; body: Uint8Array | null; stream: boolean }
        | { type: 'serve:chunk'; chunk: Uint8Array }
        | { type: 'serve:end' }
        | { type: 'serve:error'; message: string }

      if (res.type === 'serve:response') {
        if (res.stream) {
          resolve(new Response(stream, { status: res.status, headers: res.headers }))
          return
        }
        resolve(
          new Response(res.body ? (res.body as Uint8Array).slice().buffer as ArrayBuffer : null, {
            status: res.status,
            headers: res.headers,
          }),
        )
        return
      }

      if (res.type === 'serve:chunk' && streamController) {
        streamController.enqueue(res.chunk)
        return
      }

      if (res.type === 'serve:end' && streamController) {
        streamController.close()
        return
      }

      if (res.type === 'serve:error' && streamController) {
        streamController.error(new Error(res.message))
      }
    }

    channel.port1.start()

    port.postMessage(
      {
        type: 'serve:request',
        method: request.method,
        url: targetUrl,
        headers,
        body,
        responsePort: channel.port2,
      },
      [channel.port2],
    )
  })
}

function matchServePath(pathname: string): { port: number; rest: string } | null {
  const prefix = '/@/vitamin/@serve/'

  if (!pathname.startsWith(prefix)) return null

  const suffix = pathname.slice(prefix.length)
  const [portText, ...rest] = suffix.split('/')
  const port = Number(portText)
  
  if (!Number.isFinite(port)) return null
  
  const restPath = rest.length > 0 ? `/${rest.join('/')}` : '/'
  return { port, rest: restPath }
}

function rewriteServeUrl(original: URL, port: number, restPath: string): string {
  const target = new URL(original.toString())
  target.hostname = 'localhost'
  target.port = String(port)
  target.pathname = restPath
  return target.toString()
}
