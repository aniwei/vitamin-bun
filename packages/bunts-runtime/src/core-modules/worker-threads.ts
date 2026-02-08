import { SimpleEmitter } from '../shared/simple-emitter'

type WorkerOptions = {
  name?: string
  type?: 'classic' | 'module'
  workerData?: unknown
}

class WorkerThread extends SimpleEmitter {
  private worker: Worker
  private terminated = false

  constructor(specifier: string | URL, options: WorkerOptions = {}) {
    super()
    if (typeof Worker === 'undefined') {
      throw new Error('worker_threads Worker requires WebWorker support')
    }
    const url = normalizeWorkerUrl(specifier)
    const worker = new Worker(url, { type: options.type ?? 'module', name: options.name })
    this.worker = worker

    if (options.workerData !== undefined) {
      worker.postMessage({ __buntsWorkerInit: true, workerData: options.workerData })
    }

    queueMicrotask(() => {
      this.emit('online')
    })

    worker.addEventListener('message', (event: MessageEvent) => {
      this.emit('message', event.data)
    })
    worker.addEventListener('error', (event) => {
      this.emit('error', event)
    })
    worker.addEventListener('messageerror', (event: MessageEvent) => {
      this.emit('error', event)
    })
  }

  postMessage(message: unknown, transfer?: Transferable[]) {
    if (transfer) {
      this.worker.postMessage(message, transfer)
    } else {
      this.worker.postMessage(message)
    }
  }

  terminate() {
    if (this.terminated) return
    this.terminated = true
    this.worker.terminate()
    this.emit('exit', 0)
  }

  ref() {
    return this
  }

  unref() {
    return this
  }
}

function normalizeWorkerUrl(specifier: string | URL): string {
  if (specifier instanceof URL) return specifier.toString()
  try {
    return new URL(specifier).toString()
  } catch {
    if (typeof location !== 'undefined') {
      return new URL(specifier, location.href).toString()
    }
    return specifier
  }
}

function isWorkerScope(): boolean {
  return typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope
}

class MessagePortWrapper extends SimpleEmitter {
  private port: MessagePort | DedicatedWorkerGlobalScope

  constructor(port: MessagePort | DedicatedWorkerGlobalScope) {
    super()
    this.port = port
    port.addEventListener('message', (event) => {
      const message = event as MessageEvent
      this.emit('message', message.data)
    })
    port.addEventListener('messageerror', (event) => {
      const message = event as MessageEvent
      this.emit('messageerror', message)
    })
    if ('start' in port && typeof port.start === 'function') {
      port.start()
    }
  }

  postMessage(message: unknown, transfer?: Transferable[]) {
    if (transfer) {
      this.port.postMessage(message, transfer)
    } else {
      this.port.postMessage(message)
    }
  }

  close() {
    if ('close' in this.port && typeof this.port.close === 'function') {
      this.port.close()
    }
  }

  ref() {
    return this
  }

  unref() {
    return this
  }
}

function getWorkerThreadId(): number {
  const key = Symbol.for('bunts.worker_threads.threadId')
  const globalState = globalThis as typeof globalThis & { [key]?: number }
  if (!globalState[key]) {
    globalState[key] = Math.floor(Math.random() * 1_000_000) + 1
  }
  return globalState[key] as number
}

function getWorkerData(): unknown {
  const key = Symbol.for('bunts.worker_threads.workerData')
  return (globalThis as typeof globalThis & { [key]?: unknown })[key]
}

function setWorkerData(data: unknown): void {
  const key = Symbol.for('bunts.worker_threads.workerData')
  ;(globalThis as typeof globalThis & { [key]?: unknown })[key] = data
}

function getParentPort(): MessagePortWrapper | null {
  if (!isWorkerScope()) return null
  const key = Symbol.for('bunts.worker_threads.parentPort')
  const globalState = globalThis as typeof globalThis & { [key]?: MessagePortWrapper }
  if (!globalState[key]) {
    const scope = self as DedicatedWorkerGlobalScope
    globalState[key] = new MessagePortWrapper(scope)
    scope.addEventListener('message', (event) => {
      if (event.data && typeof event.data === 'object' && event.data.__buntsWorkerInit) {
        setWorkerData(event.data.workerData)
      }
    })
  }
  return globalState[key] ?? null
}

export function createWorkerThreadsModule() {
  const isMainThread = !isWorkerScope()
  const parentPort = getParentPort()
  const workerData = getWorkerData() ?? null

  return {
    isMainThread,
    threadId: isMainThread ? 0 : getWorkerThreadId(),
    parentPort,
    workerData,
    Worker: WorkerThread,
    MessageChannel: typeof MessageChannel === 'undefined' ? undefined : MessageChannel,
    MessagePort: typeof MessagePort === 'undefined' ? undefined : MessagePort,
    BroadcastChannel: typeof BroadcastChannel === 'undefined' ? undefined : BroadcastChannel,
  }
}
