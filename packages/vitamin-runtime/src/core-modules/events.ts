export function createEventsModule() {
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

    emit(event: string, ...args: unknown[]): boolean {
      const set = this.listeners.get(event)
      if (!set || set.size === 0) return false
      for (const listener of Array.from(set)) {
        listener(...args)
      }
      return true
    }
  }

  const on = (emitter: EventEmitter, event: string, listener: Listener) => emitter.on(event, listener)
  const once = (emitter: EventEmitter, event: string, listener: Listener) => emitter.once(event, listener)

  return { EventEmitter, on, once }
}
