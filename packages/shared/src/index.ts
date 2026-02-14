export const encoder = new TextEncoder()
export const decoder = new TextDecoder()

export { WorkerChannelPort, WorkerChannel, Channel, ChannelPort } from './channel'
export { SimpleEmitter } from './simple-emitter'
export { warnUnsupported} from './warn-unsupported'
export { base64ToBytes, bytesToBase64 } from './base64'
export { nextTick } from './nextTick'
export { MixinPendingTask, type PendingTask } from './pending'
export type { MessagePortLike } from './channel'
export type * from './types'