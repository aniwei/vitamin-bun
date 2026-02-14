import { SimpleEmitter } from '@vitamin-ai/shared'

export interface CommandTask<T = unknown> {
  id: number
  resolve: (value: T) => void
  reject: (err: unknown) => void
}

export interface CommandTaskHost extends SimpleEmitter {
  
}

export type Constructor<T = object> = abstract new (...args: any[]) => T

export function MixinCommandTask<TBase extends Constructor<CommandTaskHost>>(Base: TBase) {
  abstract class CommandScheduler extends Base {
    commandId: number = 0
    commandTasks: Map<number, CommandTask<unknown>> = new Map()

    get pendingTask() {
      return this.commandTasks.get(this.commandId) ?? null
    }

    execute<T>(command: (task: CommandTask) => void, timeoutMs: number = 0): Promise<T> {
      const id = ++this.commandId

      return new Promise((resolve, reject) => {
        let timeout: ReturnType<typeof setTimeout> | null = timeoutMs > 0 
          ? setTimeout(() => {
              const task = this.commandTasks.get(id)
              if (task) task.reject(new Error('Request timed out'))
            }, timeoutMs)
          : null

        const cleanup = (callback: () => void) => {
          if (timeout) {
            clearTimeout(timeout)
            timeout = null
          }

          this.commandTasks.delete(id)
          callback()
        }

        const commandTask: CommandTask<unknown> = {
          id,
          resolve: (result: unknown) => {
            timeout ? cleanup(() => resolve(result as T)) : resolve(result as T)
          },
          reject: (err: unknown) => {
            timeout ? cleanup(() => reject(err)) : reject(err)
          }
        }

        this.commandTasks.set(id, commandTask)
        command(commandTask)
      })
    }
  }

  return CommandScheduler
}

