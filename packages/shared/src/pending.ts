export interface PendingTask<T = unknown> {
  id: number
  resolve: (value: T) => void
  reject: (err: any) => void
  chunks?: Uint8Array[]
  stream?: boolean
  forward?: (msg: unknown) => void
}

interface Constructor<T = {}> {
  new(...args: any[]): T
}

export function MixinPendingTask<TBase extends Constructor>(Base: TBase) {
  return class PendingScheduler extends (Base as any) {
    pendingId: number = 0
    pendingTasks: Map<number, PendingTask> = new Map()

    get pendingTask() {
      return this.pendingTasks.get(this.pendingId) ?? null
    }

    constructor(...args: any[]) {
      super(...args)
    }

    forwardTo<T>(data: unknown, timeoutMs: number = 0): Promise<T> {
      const id = this.pendingId++

      return new Promise((resolve, reject) => {
        let timeout: ReturnType<typeof setTimeout> | null = timeoutMs > 0 
          ? setTimeout(() => {
              const task = this.pendingTasks.get(id)
              if (task) task.reject(new Error('Request timed out'))
            }, timeoutMs)
          : null

        const cleanup = (callback: () => void) => {
          if (timeout) {
            clearTimeout(timeout)
            timeout = null
          }

          this.pendingTasks.delete(id)
          callback()
        }

        const pendingTask: PendingTask<T> = {
          id,
          resolve: (result: T) => {
            timeout ? cleanup(() => resolve(result)) : resolve(result)
          },
          reject: (err: any) => {
            timeout ? cleanup(() => reject(err)) : reject(err)
          }
        }

        this.pendingTasks.set(id, pendingTask as PendingTask)
        ;(this as any).post(data)
      })
    }
  }
}

