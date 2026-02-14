import invariant from 'invariant'
import { MessagePortLike, MixinPendingTask, WorkerChannel } from '@vitamin-ai/shared'
import { ServeForward, VfsForward } from './nat'



export class Channel extends MixinPendingTask(WorkerChannel<MessagePortLike> as any) {
  #ports: number[] = []
  get ports() {
    return this.#ports
  }
  set ports(ports: number[]) {
    this.#ports = ports
  }

  constructor(messagePort: MessagePort) {
    super()
    this.messagePort = messagePort
  }

  dispose () {
    super.dispose()
    this.#ports = []
  }
}

export class ChannelManager {
  #channels = new Map<string, Channel>()
  get channels() {
    return this.#channels
  }

  registerServe(name: string, port: number): void {
    const channel = this.channels.get(name)
    if (channel) {
      if (!channel.ports.includes(port)) {
        channel.ports.push(port)
      }
    } else {
      // TODO
    }
  }

  unregisterServe(name: string, port: number): void {
    const channel = this.channels.get(name)
    if (channel) {
      channel.ports = channel.ports.filter((p) => p !== port)
    } else {
      // TODO: 抛出错误
    }
  }

  register(name: string, messagePort: MessagePort): void {
    if (this.channels.has(name)) {
      // TODO: 抛出错误
    }

    this.channels.set(name, new Channel(messagePort))
  }

  unregister(name: string): void {
    if (this.channels.has(name)) {
      this.channels.get(name)?.dispose()
      this.channels.delete(name)
    } else {
      // TODO: 抛出告警
    }
  }
}
