

import { SimpleEmitter, encoder } from '@vitamin-ai/shared'
import { Context, Router } from './route'
import { ChannelManager } from './channel'
import { IncomingMessage, ResponsePayload } from './types'

class NetworkProxy extends SimpleEmitter {
  constructor() {
    super()
    this.registerEvents()
  }

  private registerEvents(): void {
    self.addEventListener('install', () => this.emit('install'))
    self.addEventListener('activate', (event) => this.emit('activate', event))
    self.addEventListener('fetch', (event) => this.emit('fetch', event))
    self.addEventListener('message', (event) => this.emit('message', event.data))
  }
}

class App extends Router {
  #channelManager = new ChannelManager()
  get channels() {
    return this.#channelManager.channels
  }

  #network = new NetworkProxy()
  get network() {
    return this.#network
  }

  constructor() {
    super()

    this.#network.on('install', () => {
      (self as unknown as ServiceWorkerGlobalScope).skipWaiting()
    })

    this.#network.on('activate', (event) => {
      const sw = self as unknown as ServiceWorkerGlobalScope
      ;(event as ExtendableEvent).waitUntil(sw.clients.claim())
    })

    this.#network.on('message', (data) => {
      const msg = data as IncomingMessage 

      if (msg.name) {
        switch (msg.type) {
          case 'register:serve':
            this.#channelManager.registerServe(msg.name, msg.port)
            break
          case 'unregister:serve':
            this.#channelManager.unregisterServe(msg.name, msg.port)
            break
          case 'channel:register':
            this.#channelManager.register(msg.name, msg.messagePort)
            break
          case 'channel:unregister':
            this.#channelManager.unregister(msg.name)
            break
        }
      } 
    })

    this.#network.on('fetch', (event) => {
      const fetchEvent = event as FetchEvent
      const context = new Context<App>({ 
        app: this,
        event: fetchEvent, 
        request: fetchEvent.request, 
        url: new URL(fetchEvent.request.url) 
      })

      fetchEvent.respondWith(this.handle(context))
    })
  }
}

const app = new App()

app.use(async (ctx, next) => {
  const t = Date.now()
  try {
    const res = await next()
    console.log(`${ctx.request.method} ${ctx.url.pathname} ${res?.status} ${Date.now() - t}ms`)
  } catch (err) {
    console.error(`${ctx.request.method} ${ctx.url.pathname} 500 ${Date.now() - t}ms`, err)
  }
})

app.all('/@/:id/serve/*path', async (ctx, next) => {
  const id = ctx.params.id
  const channel = app.channels.get(id)

  if (channel && channel.ports.includes(Number(ctx.params.port))) {
    return channel.forwardTo({
      type: 'serve:request',
      request: ctx.request,
      targetUrl: ctx.request.url
    })
  }
})

app.all('/@/:id/module/*module', async (ctx, next) => {
  const id = ctx.params.id
  const channel = app.channels.get(id)
  if (channel) {
    return channel.forwardTo({
      type: 'module:request',
      module: ctx.params.module,
      parent: ctx.request.headers.get('referer') ?? undefined,
    }).then((content: ResponsePayload) => {
      const bytes = content.body instanceof Uint8Array
        ? content.body
        : encoder.encode(content.body || '')
      const body = new Uint8Array(bytes).buffer

      return new Response(body, {
        status: content.status,
        headers: content.headers
      })
    })
  }
})

app.all('/@/:id/vfs/*path', async (ctx, next) => {
  const id = ctx.params.id
  const channel = app.channels.get(id)

  if (channel) {
    return channel.forwardTo({
      type: 'vfs:request',
      filename: ctx.params.path,
    }).then((content: ResponsePayload) => {
      const bytes = content.body instanceof Uint8Array
        ? content.body
        : encoder.encode(content.body || '')
      const view = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? bytes
        : bytes.slice()
      const body = new Uint8Array(view).buffer

      return new Response(body, {
        status: content.status,
        headers: content.headers
      })
    })
  }
})

app.use(async (ctx) => {
  console.log('No route matched, performing default fetch for', ctx.request.url)
  return fetch(ctx.request.url)
})
