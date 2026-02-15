export function createStreamModule() {
  type Listener = (...args: unknown[]) => void

  class EventEmitter {
    listeners = new Map<string, Set<Listener>>()

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

    removeListener(event: string, listener: Listener): this {
      return this.off(event, listener)
    }

    removeAllListeners(event?: string): this {
      if (!event) {
        this.listeners.clear()
        return this
      }
      this.listeners.delete(event)
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

  class Stream extends EventEmitter {}

  type ReadableOptions = {
    read?: (size?: number) => void
    highWaterMark?: number
  }

  class Readable extends EventEmitter {
    readable = true
    destroyed = false
    buffer: unknown[] = []
    flowing = false
    ended = false
    options: ReadableOptions
    pipes = new Map<Writable, { onData: Listener; onEnd: Listener; onError: Listener }>()

    constructor(options: ReadableOptions = {}) {
      super()
      this.options = options
    }

    on(event: string, listener: Listener): this {
      const result = super.on(event, listener)
      if (event === 'data') {
        this.resume()
      }
      if (event === 'end' && this.ended && this.flowing && this.buffer.length === 0) {
        queueMicrotask(() => this.emit('end'))
      }
      return result
    }

    push(chunk: unknown): boolean {
      if (this.destroyed) return false
      if (chunk === null) {
        this.ended = true
        if (this.flowing && this.buffer.length === 0) {
          queueMicrotask(() => this.emit('end'))
        }
        return false
      }
      if (this.flowing) {
        this.emit('data', chunk)
      } else {
        this.buffer.push(chunk)
      }
      return this.buffer.length < (this.options.highWaterMark ?? 16)
    }

    read(): unknown | null {
      if (this.buffer.length > 0) {
        return this.buffer.shift() ?? null
      }
      if (this.ended) {
        queueMicrotask(() => this.emit('end'))
      }
      return null
    }

    pause(): this {
      this.flowing = false
      return this
    }

    resume(): this {
      if (this.destroyed) return this
      this.flowing = true
      while (this.buffer.length > 0) {
        const chunk = this.buffer.shift()
        if (chunk !== undefined) this.emit('data', chunk)
      }
      if (this.ended) {
        this.emit('end')
      }
      return this
    }

    pipe(dest: Writable): Writable {
      const onData = (chunk: unknown) => {
        const canWrite = dest.write(chunk)
        if (canWrite === false) {
          this.pause()
          dest.once('drain', () => this.resume())
        }
      }
      const onEnd = () => dest.end()
      const onError = (err: unknown) => dest.emit('error', err)

      this.on('data', onData)
      this.on('end', onEnd)
      this.on('error', onError)
      this.pipes.set(dest, { onData, onEnd, onError })
      this.resume()
      return dest
    }

    unpipe(dest?: Writable): this {
      if (dest) {
        const entry = this.pipes.get(dest)
        if (entry) {
          this.off('data', entry.onData)
          this.off('end', entry.onEnd)
          this.off('error', entry.onError)
          this.pipes.delete(dest)
        }
        return this
      }
      for (const [pipeDest, entry] of this.pipes.entries()) {
        this.off('data', entry.onData)
        this.off('end', entry.onEnd)
        this.off('error', entry.onError)
        this.pipes.delete(pipeDest)
      }
      return this
    }

    destroy(err?: Error): this {
      if (this.destroyed) return this
      this.destroyed = true
      this.readable = false
      if (err) this.emit('error', err)
      this.emit('close')
      return this
    }
  }

  type WritableOptions = {
    write?: (chunk: unknown, encoding?: string, callback?: (err?: Error | null) => void) => void
    final?: (callback?: (err?: Error | null) => void) => void
    highWaterMark?: number
  }

  class Writable extends EventEmitter {
    options: WritableOptions
    writable = true
    destroyed = false
    bufferSize = 0
    needDrain = false

    constructor(options: WritableOptions = {}) {
      super()
      this.options = options
    }

    write(chunk: unknown, encoding?: string, callback?: (err?: Error | null) => void): boolean {
      if (this.destroyed) return false
      this.bufferSize += 1
      const done = (err?: Error | null) => {
        if (err) this.emit('error', err)
        this.bufferSize = Math.max(0, this.bufferSize - 1)
        if (this.needDrain && this.bufferSize === 0) {
          this.needDrain = false
          this.emit('drain')
        }
        callback?.(err)
      }

      try {
        if (this.options.write) {
          this.options.write(chunk, encoding, done)
        } else {
          done()
        }
      } catch (err) {
        done(err as Error)
      }

      const highWaterMark = this.options.highWaterMark ?? 16
      if (this.bufferSize >= highWaterMark) {
        this.needDrain = true
        return false
      }
      return true
    }

    end(chunk?: unknown, callback?: () => void): void {
      if (chunk !== undefined) this.write(chunk)
      this.options.final?.((err) => {
        if (err) this.emit('error', err)
        this.finish(callback)
      })
      if (!this.options.final) this.finish(callback)
    }

    destroy(err?: Error): this {
      if (this.destroyed) return this
      this.destroyed = true
      this.writable = false
      if (err) this.emit('error', err)
      this.emit('close')
      return this
    }

    finish(callback?: () => void) {
      if (this.destroyed) return
      this.writable = false
      this.emit('finish')
      callback?.()
    }
  }

  type TransformOptions = WritableOptions & {
    transform?: (chunk: unknown, encoding?: string, callback?: (err?: Error | null, data?: unknown) => void) => void
    flush?: (callback?: (err?: Error | null) => void) => void
  }

  class Duplex extends Readable {
    writableSide: Writable

    constructor(options: WritableOptions = {}) {
      super()
      this.writableSide = new Writable(options)
      this.writableSide.on('drain', () => this.emit('drain'))
      this.writableSide.on('finish', () => this.emit('finish'))
      this.writableSide.on('error', (err) => this.emit('error', err))
      this.writableSide.on('close', () => this.emit('close'))
    }

    write(chunk: unknown, encoding?: string, callback?: (err?: Error | null) => void): boolean {
      return this.writableSide.write(chunk, encoding, callback)
    }

    end(chunk?: unknown, callback?: () => void): void {
      this.writableSide.end(chunk, callback)
    }

    destroy(err?: Error): this {
      super.destroy(err)
      this.writableSide.destroy(err)
      return this
    }
  }

  class Transform extends Duplex {
    options: TransformOptions

    constructor(options: TransformOptions = {}) {
      super(options)
      this.options = options
    }

    write(chunk: unknown, encoding?: string, callback?: (err?: Error | null) => void): boolean {
      const handler = this._transform ? this._transform.bind(this) : this.options.transform
      if (handler) {
        handler(chunk, encoding, (err, data) => {
          if (err) {
            this.emit('error', err)
            callback?.(err)
            return
          }
          if (data !== undefined) this.push(data)
          callback?.()
        })
      } else {
        this.push(chunk)
        callback?.()
      }
      return true
    }

    end(chunk?: unknown, callback?: () => void): void {
      if (chunk !== undefined) this.write(chunk)
      const flush = this._flush ? this._flush.bind(this) : this.options.flush
      if (flush) {
        flush((err) => {
          if (err) this.emit('error', err)
          this.push(null)
          this.emit('finish')
          callback?.()
        })
      } else {
        this.push(null)
        this.emit('finish')
        callback?.()
      }
    }

    _transform(chunk: unknown, encoding?: string, callback?: (err?: Error | null, data?: unknown) => void) {
      this.options.transform?.(chunk, encoding, callback)
    }

    _flush(callback?: (err?: Error | null) => void) {
      this.options.flush?.(callback)
    }
  }

  class PassThrough extends Transform {
    constructor(options: TransformOptions = {}) {
      super({ ...options, transform: (chunk, _encoding, callback) => callback?.(null, chunk) })
    }
  }

  function pipeline(...streams: Array<Readable | Writable | Transform | ((err?: Error | null) => void)>): Promise<void> {
    const maybeCallback = streams[streams.length - 1]
    const callback = typeof maybeCallback === 'function' ? (streams.pop() as (err?: Error | null) => void) : undefined
    const chain = streams as Array<Readable | Writable | Transform>

    const done = new Promise<void>((resolve, reject) => {
      if (chain.length < 2) {
        resolve()
        return
      }

      const onError = (err: unknown) => {
        reject(err)
      }

      for (let i = 0; i < chain.length - 1; i += 1) {
        const readable = chain[i] as Readable
        const writable = chain[i + 1] as Writable
        readable.pipe(writable)
        readable.on('error', onError)
        writable.on('error', onError)
      }

      const last = chain[chain.length - 1] as Writable
      last.on('finish', () => resolve())
    })

    if (callback) {
      done.then(() => callback()).catch((err) => callback(err as Error))
    }

    return done
  }

  function finished(stream: Readable | Writable, callback?: (err?: Error | null) => void): Promise<void> | void {
    const handler = (resolve: () => void, reject: (err: Error) => void) => {
      const onError = (err: unknown) => {
        cleanup()
        reject(err as Error)
      }
      const onClose = () => {
        cleanup()
        resolve()
      }
      const onFinish = () => {
        cleanup()
        resolve()
      }
      const cleanup = () => {
        stream.off('error', onError)
        stream.off('close', onClose)
        stream.off('finish', onFinish)
        stream.off('end', onFinish)
      }

      stream.on('error', onError)
      stream.on('close', onClose)
      stream.on('finish', onFinish)
      stream.on('end', onFinish)
    }

    if (callback) {
      handler(() => callback(), (err) => callback(err))
      return
    }

    return new Promise<void>((resolve, reject) => handler(resolve, reject))
  }

  return { 
    Stream, 
    Readable, 
    Writable, 
    Duplex, 
    Transform, 
    PassThrough, 
    pipeline, 
    finished 
  }
}
