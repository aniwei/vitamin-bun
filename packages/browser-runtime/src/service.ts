import { Channel, MixinPendingTask } from '@vitamin-ai/shared'

export class ServiceChannel extends MixinPendingTask(Channel) {
  private name: string
  constructor(name: string) {
    super()

    this.name = name
    this.on('message', (msg: unknown) => this.emit('service', msg))
  }

  async register(): Promise<void> {
    if (!('serviceWorker' in navigator)) return

    const registration = await navigator.serviceWorker.ready
    const controller = registration.active ?? navigator.serviceWorker.controller
    if (!controller) {
      this.emit('error', { type: 'error', message: 'Service Worker not active' })
    } else {
      controller.postMessage({ 
        type: 'channel:register',
        name: this.name,
        messagePort: this.channel.port2 
      }, [this.channel.port2])
    }
  }
}