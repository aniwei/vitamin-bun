import { Context, App } from './app'

const app = new App()

class NetworkProxyServiceWorker {
  private ports = new Map<number, MessagePort>()
  private netProxyPort: MessagePort | null = null
  private app: App

  constructor() {
    const app = new App()

    app.use(async (ctx, next) => {
      const t = Date.now()
      await next()
      console.log(`${ctx.request.method} ${ctx.url.pathname} ${Date.now() - t}ms`)
    })

    app.get('/@/:runtime-id/*filename', async (ctx, next) => {
      debugger;
    })

    app.use(async (ctx) => {
      return fetch(ctx.request.url)
    })

    this.app = app

    this.registerEvents()
  }

  private registerEvents(): void {
    self.addEventListener('install', this.onInstall)
    self.addEventListener('activate', this.onActivate)
    self.addEventListener('message', this.onMessage)
    self.addEventListener('fetch', this.onFetch)
  }

  private onInstall = (event: Event) => {
    ;(self as unknown as ServiceWorkerGlobalScope).skipWaiting()
    void event // keep linter happy
  }

  private onActivate = (event: Event) => {
    const sw = self as unknown as ServiceWorkerGlobalScope
    ;(event as ExtendableEvent).waitUntil(sw.clients.claim())
  }

  private onMessage = (event: Event) => {
    const msg = (event as MessageEvent).data as {
      type: 'register' | 'unregister'
      port?: number
      messagePort?: MessagePort
    }

    if (msg.type === 'register' && msg.port !== undefined && msg.messagePort) {
      this.ports.set(msg.port, msg.messagePort)
    } else if (msg.type === 'unregister' && msg.port !== undefined) {
      this.ports.delete(msg.port)
    } 
  }

  private onFetch = (event: Event) => {
    const fetchEvent = event as FetchEvent
    const context = new Context({ event: fetchEvent, request: fetchEvent.request, url: new URL(fetchEvent.request.url) })
    fetchEvent.respondWith(this.app.handle(context))
  }

  private async redirectTo(
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

      channel.port1.onmessage = (messageEvent: MessageEvent) => {
        const res = messageEvent.data as
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
}

new NetworkProxyServiceWorker()
