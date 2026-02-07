type HeadersLike = Record<string, string>

type RequestOptions = {
  method?: string
  headers?: HeadersLike
}

type ResponseLike = { statusCode: number; headers: HeadersLike; text: () => Promise<string> }

type ResponseCallback = (res: ResponseLike) => void

export function createHttpModule() {
  const request = (
    url: string | URL,
    options?: RequestOptions | ResponseCallback,
    callback?: ResponseCallback,
  ) => {
    const opts = typeof options === 'function' ? undefined : options
    const cb = typeof options === 'function' ? options : callback
    let body: string | Uint8Array | undefined
    let onResponse: ResponseCallback | undefined

    const doFetch = async () => {
      const response = await fetch(String(url), {
        method: opts?.method ?? (body ? 'POST' : 'GET'),
        headers: opts?.headers,
        body: body as string | Uint8Array | undefined,
      })
      const headers: HeadersLike = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })
      const message = {
        statusCode: response.status,
        headers,
        text: () => response.text(),
      }
      cb?.(message)
      onResponse?.(message)
      return message
    }

    return {
      write: (chunk: string | Uint8Array) => {
        body = chunk
      },
      end: (chunk?: string | Uint8Array) => {
        if (chunk !== undefined) body = chunk
        void doFetch()
      },
      on: (event: 'response', listener: ResponseCallback) => {
        if (event === 'response') {
          onResponse = listener
        }
      },
    }
  }

  const get = (
    url: string | URL,
    options?: RequestOptions | ResponseCallback,
    callback?: ResponseCallback,
  ) => {
    const req = request(url, options as RequestOptions | ResponseCallback, callback)
    req.end()
    return req
  }

  return { request, get }
}
