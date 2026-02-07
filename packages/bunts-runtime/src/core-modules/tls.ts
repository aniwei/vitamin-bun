import { createSocketStub } from './net'

type TlsOptions = {
  host?: string
  port?: number
  servername?: string
  rejectUnauthorized?: boolean
  protocols?: string | string[]
}

const warnOnceKeys = new Set<string>()
const warnUnsupported = (key: string, message: string) => {
  if (warnOnceKeys.has(key)) return
  warnOnceKeys.add(key)
  console.warn(message)
}

export function createTlsModule() {
  const connect = (
    options?: number | TlsOptions,
    host?: string | (() => void),
    connectListener?: () => void,
  ) => {
    const socket = createSocketStub()
    const normalized = normalizeOptions(options, host)

    if (normalized.rejectUnauthorized === false) {
      warnUnsupported('tls.rejectUnauthorized', 'tls.rejectUnauthorized is not supported in browser runtime')
    }

    const targetHost = normalized.host ?? 'localhost'
    const targetPort = normalized.port ?? 443

    if (connectListener) socket.once('secureConnect', connectListener)
    if (typeof host === 'function') socket.once('secureConnect', host)

    socket.on('connect', () => socket.emit('secureConnect'))

    if ('connectViaProxy' in socket && typeof socket.connectViaProxy === 'function') {
      socket.connectViaProxy(targetHost, targetPort, true)
    } else {
      const url = `wss://${targetHost}:${targetPort}`
      socket.connect(url, normalized.protocols)
    }
    return socket
  }

  return { connect }
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
