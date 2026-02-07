type WorkerOptions = {
  name?: string
  type?: 'classic' | 'module'
  workerData?: unknown
}

class SimpleEmitter {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  on(event: string, listener: (...args: unknown[]) => void): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(listener)
    return this
  }

  once(event: string, listener: (...args: unknown[]) => void): this {
    const wrapper = (...args: unknown[]) => {
      this.off(event, wrapper)
      listener(...args)
    }
    return this.on(event, wrapper)
  }

  off(event: string, listener: (...args: unknown[]) => void): this {
    this.listeners.get(event)?.delete(listener)
    return this
  }

  emit(event: string, ...args: unknown[]): boolean {
    const set = this.listeners.get(event)
    if (!set || set.size === 0) return false
    for (const fn of Array.from(set)) fn(...args)
    return true
  }
}

class WorkerThread extends SimpleEmitter {
  private worker: Worker

  constructor(specifier: string | URL, options: WorkerOptions = {}) {
    super()
    if (typeof Worker === 'undefined') {
      throw new Error('worker_threads Worker requires WebWorker support')
    }
    const url = normalizeWorkerUrl(specifier)
    const worker = new Worker(url, { type: options.type ?? 'module', name: options.name })
    this.worker = worker

    worker.addEventListener('message', (event) => {
      this.emit('message', event.data)
    })
    worker.addEventListener('error', (event) => {
      this.emit('error', event)
    })
    worker.addEventListener('messageerror', (event) => {
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
    this.worker.terminate()
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

export function createWorkerThreadsModule() {
  const isMainThread = !isWorkerScope()
  const parentPort = null
  const workerData = null

  return {
    isMainThread,
    threadId: 0,
    parentPort,
    workerData,
    Worker: WorkerThread,
    MessageChannel: typeof MessageChannel === 'undefined' ? undefined : MessageChannel,
    MessagePort: typeof MessagePort === 'undefined' ? undefined : MessagePort,
    BroadcastChannel: typeof BroadcastChannel === 'undefined' ? undefined : BroadcastChannel,
  }
}
