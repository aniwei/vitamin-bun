import { createSocketStub } from './net'
import { warnUnsupported } from '../shared/warn-unsupported'

type TlsOptions = {
  host?: string
  port?: number
  servername?: string
  rejectUnauthorized?: boolean
  protocols?: string | string[]
}

export function createTlsModule() {
  const connect = (
    options?: number | TlsOptions,
    host?: string | (() => void),
    connectListener?: () => void,
  ) => {
    const socket = createSocketStub()
    const normalized = normalizeOptions(options, host)

    ;(socket as { encrypted?: boolean }).encrypted = true
    ;(socket as { authorized?: boolean }).authorized = normalized.rejectUnauthorized !== false
    if (normalized.rejectUnauthorized === false) {
      ;(socket as { authorizationError?: Error }).authorizationError = new Error('UNAUTHORIZED')
      warnUnsupported('tls.rejectUnauthorized', 'tls.rejectUnauthorized is not supported in browser runtime')
    }

    const targetHost = normalized.host ?? 'localhost'
    const targetPort = normalized.port ?? 443

    if (connectListener) socket.once('secureConnect', connectListener)
    if (typeof host === 'function') socket.once('secureConnect', host)

    socket.on('connect', () => {
      socket.emit('secureConnect')
      socket.emit('ready')
    })

    if ('connectViaProxy' in socket && typeof socket.connectViaProxy === 'function') {
      socket.connectViaProxy(targetHost, targetPort, true)
    } else {
      const url = `wss://${targetHost}:${targetPort}`
      socket.connect(url, normalized.protocols)
    }
    return socket
  }

  return { connect, createConnection: connect }
}

function normalizeOptions(
  options?: number | TlsOptions,
  host?: string | (() => void),
): TlsOptions {
  if (typeof options === 'number') {
    return { port: options, host: typeof host === 'string' ? host : undefined }
  }
  return options ?? {}
}
