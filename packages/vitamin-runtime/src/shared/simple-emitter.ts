type Listener = (...args: unknown[]) => void

export class SimpleEmitter {
  listeners = new Map<string, Set<Listener>>()

  on(event: string, listener: Listener): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
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
    for (const fn of Array.from(set)) fn(...args)
    return true
  }
}
