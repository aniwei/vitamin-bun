import { WorkerChannel, MixinPendingTask } from '@vitamin-ai/shared'

export class ServiceChannel extends MixinPendingTask(WorkerChannel as any) {
  private name: string
  private onMessage(msg: unknown): void {
    switch ((msg as { type: string }).type) {
      case 'serve:request':
        break
      case 'vfs:request': {
        break
      }
    }
  }

  constructor(name: string) {
    super()

    this.name = name
    this.on('message', this.onMessage.bind(this))
  }

  process(data: unknown): void {}

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