import invariant from 'invariant'
import { WorkerChannel, MixinPendingTask, MessagePortLike } from '@vitamin-ai/shared'
import type { OutgoingMessage } from './types'

export abstract class WorkerNat extends MixinPendingTask(WorkerChannel<MessagePortLike> as any) {
  abstract onMessage(messageEvent: MessageEvent): void
}

export abstract class OnceForward extends WorkerNat {
  protected ctrl?: ReadableStreamDefaultController<Uint8Array>

  public forwardTo<T>(data: unknown, timeoutMs: number = 0): Promise<T> {
    const stream = new ReadableStream<Uint8Array>({
      start: (ctrl) => {
        this.ctrl = ctrl
      },
      cancel: (reason) => {
        this.post({
          type: 'cancel',
          reason,
        })
      }
    })

    return super.forwardTo<T>({
      ...data as any,
    }, timeoutMs)
  }
}

export class VfsForward extends OnceForward {
  public forwardTo<T>(data: unknown, timeoutMs: number = 0): Promise<T> {
    return super.forwardTo<T>({
      type: 'vfs:request',
      filename: (data as any).filename,
    }, timeoutMs)
  }
}
export class ServeForward extends OnceForward {
  public forwardTo<T>(data: unknown, timeoutMs: number = 0): Promise<T> {
    return super.forwardTo<T>({
      type: 'serve:request',
      filename: (data as any).filename,
    }, timeoutMs)
  }
}