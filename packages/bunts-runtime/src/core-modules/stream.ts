export function createStreamModule() {
  type Listener = (...args: unknown[]) => void

  class EventEmitter {
    private listeners = new Map<string, Set<Listener>>()

    on(event: string, listener: Listener): this {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set())
      }
      this.listeners.get(event)!.add(listener)
      return this
    }

    once(event: string, listener: Listener): this {
      const wrapper: Listener = (...args) => {
        this.off(event, wrapper)
        listener(...args)
      }
      return this.on(event, wrapper)
    }

    off(event: string, listener: Listener): this {
      this.listeners.get(event)?.delete(listener)
      return this
    }

    emit(event: string, ...args: unknown[]): boolean {
      const set = this.listeners.get(event)
      if (!set || set.size === 0) return false
      for (const listener of Array.from(set)) {
        listener(...args)
      }
      return true
    }
  }

  class Readable extends EventEmitter {
    push(chunk: unknown): void {
      if (chunk === null) {
        this.emit('end')
        return
      }
      this.emit('data', chunk)
    }
  }

  type WritableOptions = {
    write?: (chunk: unknown) => void
    final?: () => void
  }

  class Writable extends EventEmitter {
    private options: WritableOptions

    constructor(options: WritableOptions = {}) {
      super()
      this.options = options
    }

    write(chunk: unknown): boolean {
      this.options.write?.(chunk)
      this.emit('drain')
      return true
    }

    end(chunk?: unknown): void {
      if (chunk !== undefined) this.write(chunk)
      this.options.final?.()
      this.emit('finish')
    }
  }

  type TransformOptions = WritableOptions & {
    transform?: (chunk: unknown) => unknown
  }

  class Transform extends Readable {
    private options: TransformOptions

    constructor(options: TransformOptions = {}) {
      super()
      this.options = options
    }

    write(chunk: unknown): boolean {
      const out = this._transform ? this._transform(chunk) : this.options.transform?.(chunk)
      if (out !== undefined) this.push(out)
      this.emit('drain')
      return true
    }

    end(chunk?: unknown): void {
      if (chunk !== undefined) this.write(chunk)
      this.options.final?.()
      this.push(null)
      this.emit('finish')
    }

    _transform(chunk: unknown): unknown {
      return this.options.transform?.(chunk)
    }
  }

  function pipeline(...streams: Array<Readable | Writable | Transform>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (streams.length < 2) {
        resolve()
        return
      }

      for (let i = 0; i < streams.length - 1; i += 1) {
        const readable = streams[i] as Readable
        const writable = streams[i + 1] as Writable

        readable.on('data', (chunk: unknown) => {
          try {
            writable.write(chunk)
          } catch (err) {
            readable.emit('error', err)
          }
        })
        readable.on('end', () => writable.end())
        readable.on('error', (err) => {
          reject(err)
        })
        writable.on('error', (err) => {
          reject(err)
        })
      }

      const last = streams[streams.length - 1] as Writable
      last.on('finish', () => resolve())
    })
  }

  return { Readable, Writable, Transform, pipeline }
}
