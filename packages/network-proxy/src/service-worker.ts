

import { Context, Router } from './route'
import { ChannelManager } from './channel'
import { SimpleEmitter } from '../../shared/dist'

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


const network = new NetworkProxy()
class App extends Router {
  #channelManager = new ChannelManager()
  get channels() {
    return this.#channelManager.channels
  }

  constructor() {
    super()

    network.on('install', () => {
      (self as unknown as ServiceWorkerGlobalScope).skipWaiting()
    })

    network.on('activate', (event) => {
      const sw = self as unknown as ServiceWorkerGlobalScope
      ;(event as ExtendableEvent).waitUntil(sw.clients.claim())
    })

    network.on('message', (data) => {
      // TODO: use a better message format
      const msg = data as { type: string, name?: string, port: number, messagePort: MessagePort }

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

    network.on('fetch', (event) => {
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
  await next()
  console.log(`${ctx.request.method} ${ctx.url.pathname} ${Date.now() - t}ms`)
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

app.all('/@/:id/vfs/*path', async (ctx, next) => {
  const id = ctx.params.id
  const channel = app.channels.get(id)

  if (channel) {
    return channel.forwardTo({
      type: 'vfs:request',
      filename: ctx.params.path,
    })
  }
})

app.use(async (ctx) => {
  return fetch(ctx.request.url)
})
