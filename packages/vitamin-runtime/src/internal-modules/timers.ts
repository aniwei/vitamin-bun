export function createTimersModule() {
  return {
    setTimeout: (handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]) => {
      return setTimeout(handler, timeout, ...args)
    },
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    setInterval: (handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]) => {
      return setInterval(handler, timeout, ...args)
    },
    clearInterval: (id: ReturnType<typeof setInterval>) => clearInterval(id),
    setImmediate: (handler: (...args: unknown[]) => void, ...args: unknown[]) => {
      return setTimeout(handler, 0, ...args)
    },
    clearImmediate: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  }
}

export function createTimersPromisesModule() {
  return {
    setTimeout: (timeout = 0, value?: unknown) =>
      new Promise<unknown>((resolve) => {
        setTimeout(() => resolve(value), timeout)
      }),
  }
}
