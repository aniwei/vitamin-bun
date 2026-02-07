function concatChunks(chunks: Uint8Array[]): ArrayBuffer {
  const size = chunks.reduce((sum, b) => sum + b.byteLength, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out.buffer
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export function createCryptoModule() {
  const subtle = globalThis.crypto?.subtle

  function randomBytes(size: number): Uint8Array {
    const bytes = new Uint8Array(size)
    globalThis.crypto?.getRandomValues(bytes)
    return bytes
  }

  function createHash(algorithm: 'sha256' | 'sha1') {
    const chunks: Uint8Array[] = []
    return {
      update(data: string | Uint8Array): { digest: (encoding?: 'hex' | 'base64') => string } {
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
        chunks.push(bytes)
        return this
      },
      digest(encoding: 'hex' | 'base64' = 'hex'): string {
        const total = concatChunks(chunks)
        const digestPromise = subtle?.digest({ name: algorithm.toUpperCase() }, total)

        if (!digestPromise) {
          throw new Error('WebCrypto not available')
        }

        throw new Error('createHash().digest is async in BunTS; use digestAsync()')
      },
      async digestAsync(encoding: 'hex' | 'base64' = 'hex'): Promise<string> {
        const total = concatChunks(chunks)
        const digestBuffer = await subtle!.digest({ name: algorithm.toUpperCase() }, total)
        const bytes = new Uint8Array(digestBuffer)
        return encoding === 'base64' ? toBase64(bytes) : toHex(bytes)
      },
    }
  }

  return { randomBytes, createHash, subtle }
}
