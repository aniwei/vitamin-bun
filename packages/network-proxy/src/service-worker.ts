import { Context, App } from './app'


type RunnerRecord = {
  ports: number[],
  messagePort: MessagePort
}

class NetworkProxyServiceWorker {
  private runners = new Map<string, RunnerRecord>()
  private app: App

  constructor() {
    const app = new App()

    app.use(async (ctx, next) => {
      const t = Date.now()
      await next()
      console.log(`${ctx.request.method} ${ctx.url.pathname} ${Date.now() - t}ms`)
    })

    app.get('/@/:id/vfs/*filename', async (ctx, next) => {
      const runner = this.runners.get(ctx.params.id)

      if (runner) {
        return this.forwardToVfs(runner.messagePort, ctx.url.pathname)
      }

      return new Response('Server Internal Error', { status: 500 })
    })

    app.all('/@/:id/serve/:port/*path', async (ctx, next) => {
      const id = ctx.params.id
      const runner = this.runners.get(id)

      if (runner && runner.ports.includes(Number(ctx.params.port))) {
        return this.forwardToServe(ctx.request, runner.messagePort, ctx.params.port)
      }
      
      return new Response('Server Internal Error', { status: 500 })
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
      name?: string,
      messagePort?: MessagePort
    } | {
      port?: number
      name?: string,
      type: 'register:serve' | 'unregister:serve'
    }

    if (msg.name) {
      switch (msg.type) {
        case 'register:serve':
          if (msg.port !== undefined) {
            const runner = this.runners.get(msg.name)
            if (runner && !runner.ports.includes(msg.port)) {
              runner.ports.push(msg.port)
            }
          }
          break
        case 'unregister:serve':
          if (msg.port !== undefined) {
            const runner = this.runners.get(msg.name)
            if (runner) {
              runner.ports = runner.ports.filter((p) => p !== msg.port)
            }
          }
          break

        case 'register':
          if (msg.messagePort) {
            this.runners.set(msg.name, { ports: [], messagePort: msg.messagePort })
          }
          break
        case 'unregister':
          this.runners.delete(msg.name)
          break
      }
    } 
  }

  private onFetch = (event: Event) => {
    const fetchEvent = event as FetchEvent
    const context = new Context({ event: fetchEvent, request: fetchEvent.request, url: new URL(fetchEvent.request.url) })
    fetchEvent.respondWith(this.app.handle(context))
  }

  private async forwardToVfs(
    port: MessagePort,
    filename: string,
  ): Promise<Response> {
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
          | { type: 'vfs:response'; status: number; headers: Record<string, string>; body: Uint8Array | null; stream: boolean }
          | { type: 'vfs:chunk'; chunk: Uint8Array }
          | { type: 'vfs:end' }
          | { type: 'vfs:error'; message: string }

        if (res.type === 'vfs:response') {
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

        if (res.type === 'vfs:chunk' && streamController) {
          streamController.enqueue(res.chunk)
          return
        }

        if (res.type === 'vfs:end' && streamController) {
          streamController.close()
          return
        }

        if (res.type === 'vfs:error' && streamController) {
          streamController.error(new Error(res.message))
        }
      }

      channel.port1.start()

      port.postMessage({
        type: 'vfs:request',
        filename,
        responsePort: channel.port2,
      }, [channel.port2])
    })
  }

  private async forwardToServe(
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

      port.postMessage({
        type: 'serve:request',
        method: request.method,
        url: targetUrl,
        headers,
        body,
        responsePort: channel.port2,
      }, [channel.port2])
    })
  }
}

new NetworkProxyServiceWorker()
