
export enum AddressFamily {
  INET = 2,
  INET6 = 10,
}


export enum SocketType {
  STREAM = 1, // TCP
  DGRAM = 2, // UDP
}

export enum SocketState {
  Created = 'created',
  Connecting = 'connecting',
  Connected = 'connected',
  Closed = 'closed',
  Error = 'error',
}

export interface SocketDescriptor {
  fd: number
  family: AddressFamily
  type: SocketType
  state: SocketState
  host: string
  port: number
  sendBuffer: Uint8Array[]
  recvBuffer: Uint8Array[]
  abortController: AbortController | null
}

export interface NetworkProxyOptions {
  allowedHosts?: string[]
}
