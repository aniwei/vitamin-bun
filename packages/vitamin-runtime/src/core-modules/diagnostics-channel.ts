export function createDiagnosticsChannelModule() {
  type Subscriber = (message: unknown) => void

  const createChannel = () => {
    const subscribers = new Set<Subscriber>()
    return {
      subscribe: (fn: Subscriber) => {
        subscribers.add(fn)
      },
      unsubscribe: (fn: Subscriber) => {
        subscribers.delete(fn)
      },
      publish: (message: unknown) => {
        for (const fn of subscribers) fn(message)
      },
    }
  }

  const channels = new Map<string, ReturnType<typeof createChannel>>()

  return {
    channel: (name: string) => {
      if (!channels.has(name)) {
        channels.set(name, createChannel())
      }
      return channels.get(name)!
    },
  }
}
