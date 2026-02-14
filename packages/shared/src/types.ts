export type VfsSnapshot = {
  files: Record<string, string>
  encoding: 'base64'
}

export interface VfsRequestMessage { 
  type: 'vfs:request'
  id: number
  filename: string
  messagePort: MessagePort 
}

export interface ServeRequestMessage { 
  type: 'serve:request'
  id: number
  method: string
  url: string
  headers: Record<string, string>
  body: Uint8Array | null
  messagePort: MessagePort 
}

export interface StartMessage { 
  type: 'start'
  id: number
  files: Record<string, string>
  env?: Record<string, string> 
  sab?: SharedArrayBuffer 
}
export interface ExecMessage { 
  type: 'exec'
  id: number
  pid: number
  command: string
  args: string[]
}

export interface VfsDumpMessage { 
  type: 'vfs:dump'
  id: number 
}

export interface VfsRestoreMessage { 
  type: 'vfs:restore'
  id: number;
  snapshot: VfsSnapshot
}

export interface VfsWriteMessage {
  type: 'vfs:write'
  id: number
  path: string
  content: string | Uint8Array
}

export interface VfsReadMessage {
  type: 'vfs:read'
  id: number
  filename: string
}


export interface VfsMkdirMessage {
  type: 'vfs:mkdir'
  id: number
  path: string
}

export interface VfsReaddirMessage {
  type: 'vfs:readdir'
  id: number
  path: string
}

export interface VfsUnlinkMessage {
  type: 'vfs:unlink'
  id: number
  path: string
}

export interface VfsRenameMessage {
  type: 'vfs:rename'
  id: number
  from: string
  to: string
}

export interface VfsExistsMessage {
  type: 'vfs:exists'
  id: number
  path: string
}

export interface KillMessage {
  type: 'kill'
  id: number
}

export type RequestMessage = 
  | VfsRequestMessage 
  | ServeRequestMessage

export type IncomingMessage =
  | { type: 'init'; messagePort: MessagePort; name: string }
  | StartMessage
  | ExecMessage
  | ServeRequestMessage
  | VfsRequestMessage
  | VfsReadMessage
  | VfsDumpMessage
  | VfsRestoreMessage
  | VfsWriteMessage
  | VfsMkdirMessage
  | VfsUnlinkMessage
  | VfsRenameMessage
  | VfsExistsMessage
  | VfsReaddirMessage
  | KillMessage

interface StreamChunkMessage { 
  type: 'stream:chunk'
  id: number
  chunk: Uint8Array 
  forward?: boolean 
}

interface StreamEndMessage { 
  type: 'stream:end'
  id: number
  forward?: boolean 
}

interface StreamErrorMessage { 
  type: 'stream:error'
  id: number
  message: string
  forward?: boolean 
}

export type StreamMessage = 
  | StreamChunkMessage 
  | StreamEndMessage 
  | StreamErrorMessage

export interface StdoutPayload {
  name: 'stdout'
  data: Uint8Array
}

export interface StderrPayload {
  name: 'stderr'
  data: Uint8Array
}

export interface ExitPayload {
  name: 'exit'
  pid: number
  code: number
}

export interface ErrorPayload {
  name: 'error'
  message: string
  stack: string
}

export interface VfsCreatePayload {
  name: 'vfs:create'
  path: string
  kind: 'file' | 'directory'
}

export interface VfsDeletePayload {
  name: 'vfs:delete'
  path: string
  kind: 'file' | 'directory'
}

export interface VfsMovePayload {
  name: 'vfs:move'
  from: string
  to: string
  kind: 'file' | 'directory'
}

export interface ServeRegisterPayload {
  name: 'serve:register'
  port: number
}

export interface ServeUnregisterPayload {
  name: 'serve:unregister'
  port: number
}

export type ResponsePayload = {
  status: number
  headers: Record<string, string>
  body?: Uint8Array | string
}

export type MessagePayload = 
  | StdoutPayload 
  | StderrPayload 
  | ExitPayload
  | ErrorPayload
  | VfsCreatePayload
  | VfsDeletePayload
  | VfsMovePayload
  | ServeRegisterPayload
  | ServeUnregisterPayload

export interface ResponseMessage { 
  type: 'response'
  id: number 
  stream: boolean
  payload?: { 
    status: number
    headers: Record<string, string>
    body: Uint8Array | null
  } 
}

export type EventMessage = { 
  type: 'event' 
  payload: MessagePayload | ResponsePayload
  forward?: boolean 
}

export type OutgoingMessage =
  | { type: 'ready' }
  | ResponseMessage
  | StreamMessage
  | EventMessage
  