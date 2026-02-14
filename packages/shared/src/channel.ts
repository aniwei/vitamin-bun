import invariant from 'invariant'
import { SimpleEmitter } from './simple-emitter'
import { IncomingMessage, OutgoingMessage } from './types'


export interface MessagePortLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;

  onmessage: ((ev: MessageEvent) => void) | null;
  onmessageerror: ((ev: MessageEvent) => void) | null;
  onerror?: ((ev: ErrorEvent) => void) | null;

  terminate?: () => void;
  close?: () => void;
}

export class ChannelPort<T extends MessagePortLike = MessagePortLike> extends SimpleEmitter {
  #messageId: number = 0

  #messagePort: T | null = null
  get messagePort(): T {
    invariant(this.#messagePort !== null, 'Message port is not initialized')
    return this.#messagePort
  }
  set messagePort(messagePort: T | null) {
    this.#messagePort = messagePort
    if (messagePort) {
      this.registerPortEvents()
    }
  }

  private registerPortEvents(): void {
    invariant(this.messagePort !== null, 'Message port is not initialized')
    this.messagePort.onmessage = (event) => this.emit('message', event.data)
    this.messagePort.onmessageerror = (event) => this.emit('error', event)
    this.messagePort.onerror = (event) => this.emit('error', event)
  }

  private unregisterPortEvents(): void {
    if (this.#messagePort) {
      this.#messagePort.onmessage = null
      this.#messagePort.onmessageerror = null
      this.#messagePort.onerror = null
    }
  }

  constructor(messagePort: T | null = null) {
    super()
    this.messagePort = messagePort
  }

  close() {
    if (typeof this.messagePort?.terminate === 'function') {
      this.messagePort.terminate()
    } else if (typeof this.messagePort?.close === 'function') {
      this.messagePort.close()
    }
  }

  post(data: object, transfer: Transferable[] = []) {
    invariant(this.messagePort !== null, 'Message port is not initialized')
    this.messagePort.postMessage({
      id: this.#messageId++,
      ...data,
    }, transfer)
  }

  dispose() {
    if (this.#messagePort) {
      this.unregisterPortEvents()
      this.close()
      this.#messagePort = null
    }

    super.removeAllListeners()
  }
}

export enum ChannelState {
  Initializing = 'initializing',
  Ready = 'ready'
}

export abstract class Channel<T extends MessagePortLike = MessagePortLike> extends SimpleEmitter {
  #channel: MessageChannel | null = null
  get channel() {
    invariant(this.#channel !== null, 'Message channel is not initialized')
    return this.#channel 
  }
  set channel(channel: MessageChannel) {
    this.#channel = channel
  }

  #port: ChannelPort<T> | null = null
  get port() {
    invariant(this.#port !== null, 'Message port is not initialized')
    return this.#port 
  }
  set port(port: ChannelPort<T>) {
    this.#port?.dispose()
    this.#port = port
    if (port) {
      port.on('message', (data) => this.emit('message', data))
      port.on('error', (err) => this.emit('error', err))
    }
  }

  #state: ChannelState = ChannelState.Initializing
  get state() {
    return this.#state
  }
  set state(state: ChannelState) {
    this.#state = state
  }

  get ready() {
    return this.#state === ChannelState.Ready
  }

  constructor() {
    super()

    this.#channel = new MessageChannel()
    this.port = new ChannelPort(this.channel.port1 as unknown as T)
  }

  post(data: object, transfer: Transferable[] = []) {
    invariant(this.port !== null, 'Message port is not initialized')
    this.port.post(data, transfer)
  }

  dispose() {
    if (this.#channel) {
      this.#channel.port1.close()
      this.#channel.port2.close()
      this.#channel = null
    }
  }
}

export abstract class WorkerChannel extends Channel<MessagePortLike> {
  #name: string
  get name() {
    return this.#name
  }
  set name(name: string) {
    this.#name = name
  }

  constructor(name: string, scriptUrl: string | URL) {
    super()
    
    const prefix = `vitamin`
    this.#name = `${prefix}-${name}`

    const worker = new Worker(scriptUrl, { 
      type: 'module', 
      name: this.#name,
    })

    worker.onmessage = (event) => {
      const data = event.data as OutgoingMessage
      if (data.type === 'ready') {
        this.state = ChannelState.Ready
        this.emit('ready')
      }
    }

    worker.onerror = (event) => {
      this.emit('error', event)
    }

    worker.postMessage({
      type: 'init',
      name: this.#name,
      messagePort: this.channel.port2
    }, [this.channel.port2])
  }

  start(...args: unknown[]): Promise<void> 
  start(timeoutMs: number = 600000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        if (!this.ready) {
          this.dispose()
          cleanup()
        }
      }, timeoutMs)

      const cleanup = (callback?: () => void) => {
        if (timeout) {
          clearTimeout(timeout)
          timeout = null
        }

        callback?.()
      }

      const pending = {
        resolve: () => {
          timeout 
            ? cleanup(resolve) 
            : reject(new Error('Main channel is ready but initialization timeout is not cleared'))
        },
        reject: () => {
          timeout            
            ? cleanup(reject) 
            : reject(new Error('Main channel initialization failed but timeout is not cleared'))
        },
      }

      this.once('ready', () => pending.resolve())
      this.once('error', (err) => pending.reject())
    })
  }
}

export class WorkerChannelPort extends ChannelPort<MessagePortLike> {
  #name: string = ''
  get name() {
    return this.#name
  }
  set name(name: string) {
    this.#name = name
  }

  constructor() {
    super()

    self.onmessage = (event) => {
      const data = event.data as IncomingMessage 
      if (data.type === 'init') {
        this.#name = data.name
        this.messagePort = data.messagePort

        self.postMessage({
          type: 'ready',
        })
      }
    }

    self.onerror = (event) => {      
      self.postMessage({
        type: 'error',
        message: event,
      })
    }
  }
}