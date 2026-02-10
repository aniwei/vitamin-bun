export type FetchProgress = {
  received: number
  total?: number
}

export async function fetchArrayBufferCached(
  cache: { getArrayBuffer: (key: string) => Promise<ArrayBuffer | undefined> } | undefined,
  fetchImpl: typeof fetch,
  url: string,
  onProgress?: (progress: FetchProgress) => void,
): Promise<ArrayBuffer> {
  const cached = await cache?.getArrayBuffer(url)
  if (cached) {
    if (onProgress) {
      onProgress({ received: cached.byteLength, total: cached.byteLength })
    }
    return cached
  }
  return await fetchArrayBuffer(fetchImpl, url, onProgress)
}

export async function fetchArrayBuffer(
  fetchImpl: typeof fetch,
  url: string,
  onProgress?: (progress: FetchProgress) => void,
): Promise<ArrayBuffer> {
  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  if (!response.body || !onProgress) {
    return await response.arrayBuffer()
  }

  const total = response.headers.get('content-length')
  const totalBytes = total ? Number(total) : undefined
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      received += value.byteLength
      onProgress({ received, total: totalBytes })
    }
  }

  const buffer = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }

  return buffer.buffer
}
