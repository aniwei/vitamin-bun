/**
 * Service Worker script for intercepting fetch requests to virtual
 * localhost servers running inside the WASM runtime.
 *
 * This file is intended to be registered as a Service Worker. It
 * communicates with the main thread via `MessageChannel` to forward
 * intercepted requests to the WASM HTTP server.
 */

/** Port mappings: virtual port → MessagePort to the main thread handler. */
const portMap = new Map<number, MessagePort>()

/**
 * Install event — skip waiting so the SW activates immediately.
 */
self.addEventListener('install', (event: Event) => {
  ;(self as unknown as ServiceWorkerGlobalScope).skipWaiting()
  void event // keep linter happy
})

/**
 * Activate event — claim all clients so existing tabs use this SW.
 */
self.addEventListener('activate', (event: Event) => {
  const sw = self as unknown as ServiceWorkerGlobalScope
  ;(event as ExtendableEvent).waitUntil(sw.clients.claim())
})

/**
 * Message handler for registering / unregistering virtual ports.
 */
self.addEventListener('message', (event: Event) => {
  const msg = (event as MessageEvent).data as {
    type: 'register' | 'unregister'
    port?: number
    messagePort?: MessagePort
  }

  if (msg.type === 'register' && msg.port !== undefined && msg.messagePort) {
    portMap.set(msg.port, msg.messagePort)
  } else if (msg.type === 'unregister' && msg.port !== undefined) {
    portMap.delete(msg.port)
  }
})

/**
 * Fetch handler — intercepts requests to `localhost:<port>` and forwards
 * them to the WASM runtime via the registered MessagePort.
 */
self.addEventListener('fetch', (event: Event) => {
  const fetchEvent = event as FetchEvent
  const url = new URL(fetchEvent.request.url)

  const magicMatch = matchServePath(url.pathname)
  const port = magicMatch?.port ?? (parseInt(url.port, 10) || 80)

  // Only intercept localhost requests (legacy) or magic serve paths.
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

/**
 * Forward a request to the WASM runtime via a MessagePort and return the
 * response.
 */
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
  const prefix = '/@/vitamin_serve__'
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
