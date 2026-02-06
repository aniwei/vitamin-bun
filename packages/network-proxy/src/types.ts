/**
 * Type definitions for the network proxy layer.
 */

/** Address family. */
export enum AddressFamily {
  INET = 2,
  INET6 = 10,
}

/** Socket type. */
export enum SocketType {
  STREAM = 1, // TCP
  DGRAM = 2, // UDP
}

/** Internal socket state. */
export enum SocketState {
  Created = 'created',
  Connecting = 'connecting',
  Connected = 'connected',
  Closed = 'closed',
  Error = 'error',
}

/** A buffered socket descriptor managed by the network proxy. */
export interface SocketDescriptor {
  fd: number
  family: AddressFamily
  type: SocketType
  state: SocketState
  /** Target host for this connection. */
  host: string
  /** Target port for this connection. */
  port: number
  /** Buffered outgoing data (accumulated before flush). */
  sendBuffer: Uint8Array[]
  /** Buffered incoming data (responses waiting to be read). */
  recvBuffer: Uint8Array[]
  /** AbortController for cancelling in-flight fetch requests. */
  abortController: AbortController | null
}

/** Options for the network proxy. */
export interface NetworkProxyOptions {
  /**
   * Optional list of allowed hosts. If provided, only connections to these
   * hosts are permitted.  Useful for sandboxing.
   */
  allowedHosts?: string[]
}
