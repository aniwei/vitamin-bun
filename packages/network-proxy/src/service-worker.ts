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

  // Only intercept localhost requests whose port has been registered.
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    return
  }

  const port = parseInt(url.port, 10) || 80
  const messagePort = portMap.get(port)
  if (!messagePort) {
    return // Not a virtual server — let the browser handle it.
  }

  fetchEvent.respondWith(forwardToWasm(fetchEvent.request, messagePort))
})

/**
 * Forward a request to the WASM runtime via a MessagePort and return the
 * response.
 */
async function forwardToWasm(
  request: Request,
  port: MessagePort,
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

    channel.port1.onmessage = (event: MessageEvent) => {
      const res = event.data as {
        status: number
        headers: Record<string, string>
        body: Uint8Array | null
      }
      resolve(
        new Response(res.body ? (res.body as Uint8Array).buffer as ArrayBuffer : null, {
          status: res.status,
          headers: res.headers,
        }),
      )
    }

    port.postMessage(
      {
        method: request.method,
        url: request.url,
        headers,
        body,
        responsePort: channel.port2,
      },
      [channel.port2],
    )
  })
}
