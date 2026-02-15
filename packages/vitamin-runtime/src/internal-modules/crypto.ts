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

function fromBase64(input: string): Uint8Array {
  const binary = atob(input)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function normalizeAlgorithm(algorithm: string): string {
  return algorithm.replace('-', '').toUpperCase()
}

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data
}

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export function createCryptoModule() {
  const subtle = globalThis.crypto?.subtle

  if (!globalThis.crypto) {
    throw new Error('WebCrypto not available')
  }

  function randomBytes(size: number): Uint8Array {
    const bytes = new Uint8Array(size)
    globalThis.crypto?.getRandomValues(bytes)
    return bytes
  }

  function randomFillSync(buffer: Uint8Array, offset = 0, size?: number): Uint8Array {
    const length = size ?? buffer.length - offset
    const target = buffer.subarray(offset, offset + length)
    globalThis.crypto?.getRandomValues(target)
    return buffer
  }

  function createHash(algorithm: string) {
    const chunks: Uint8Array[] = []
    return {
      update(data: string | Uint8Array): { digest: (encoding?: 'hex' | 'base64') => string } {
        chunks.push(toBytes(data))
        return this
      },
      digest(encoding: 'hex' | 'base64' = 'hex'): string {
        throw new Error('createHash().digest is async in BunTS; use digestAsync()')
      },
      async digestAsync(encoding: 'hex' | 'base64' = 'hex'): Promise<string> {
        const total = concatChunks(chunks)
        const digestBuffer = await subtle!.digest(normalizeAlgorithm(algorithm), total)
        const bytes = new Uint8Array(digestBuffer)
        return encoding === 'base64' ? toBase64(bytes) : toHex(bytes)
      },
    }
  }

  function createHmac(algorithm: string, key: string | Uint8Array) {
    const chunks: Uint8Array[] = []
    return {
      update(data: string | Uint8Array): { digest: (encoding?: 'hex' | 'base64') => string } {
        chunks.push(toBytes(data))
        return this
      },
      digest(encoding: 'hex' | 'base64' = 'hex'): string {
        throw new Error('createHmac().digest is async in BunTS; use digestAsync()')
      },
      async digestAsync(encoding: 'hex' | 'base64' = 'hex'): Promise<string> {
        const total = concatChunks(chunks)
        const cryptoKey = await subtle!.importKey(
          'raw',
          toBuffer(toBytes(key)),
          { name: 'HMAC', hash: { name: normalizeAlgorithm(algorithm) } },
          false,
          ['sign'],
        )
        const signature = await subtle!.sign('HMAC', cryptoKey, total)
        const bytes = new Uint8Array(signature)
        return encoding === 'base64' ? toBase64(bytes) : toHex(bytes)
      },
    }
  }

  function createCipheriv(algorithm: 'aes-256-gcm', key: Uint8Array, iv: Uint8Array) {
    const chunks: Uint8Array[] = []
    return {
      update(data: string | Uint8Array) {
        chunks.push(toBytes(data))
        return this
      },
      final() {
        throw new Error('createCipheriv().final is async in BunTS; use finalAsync()')
      },
      async finalAsync(): Promise<Uint8Array> {
        const cryptoKey = await subtle!.importKey('raw', toBuffer(key), 'AES-GCM', false, ['encrypt'])
        const total = concatChunks(chunks)
        const ivBytes = new Uint8Array(iv)
        const encrypted = await subtle!.encrypt({ name: 'AES-GCM', iv: ivBytes }, cryptoKey, total)
        return new Uint8Array(encrypted)
      },
    }
  }

  function createDecipheriv(algorithm: 'aes-256-gcm', key: Uint8Array, iv: Uint8Array) {
    const chunks: Uint8Array[] = []
    return {
      update(data: Uint8Array) {
        chunks.push(data)
        return this
      },
      final() {
        throw new Error('createDecipheriv().final is async in BunTS; use finalAsync()')
      },
      async finalAsync(): Promise<Uint8Array> {
        const cryptoKey = await subtle!.importKey('raw', toBuffer(key), 'AES-GCM', false, ['decrypt'])
        const total = concatChunks(chunks)
        const ivBytes = new Uint8Array(iv)
        const decrypted = await subtle!.decrypt({ name: 'AES-GCM', iv: ivBytes }, cryptoKey, total)
        return new Uint8Array(decrypted)
      },
    }
  }

  function randomUUID(): string {
    return globalThis.crypto!.randomUUID()
  }

  function createPublicKey() {
    throw new Error('createPublicKey is not supported in browser runtime')
  }

  function createPrivateKey() {
    throw new Error('createPrivateKey is not supported in browser runtime')
  }

  function createSecretKey() {
    throw new Error('createSecretKey is not supported in browser runtime')
  }

  function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    let diff = 0
    for (let i = 0; i < a.length; i += 1) {
      diff |= a[i] ^ b[i]
    }
    return diff === 0
  }

  function pbkdf2Sync(password: string | Uint8Array, salt: string | Uint8Array, iterations: number, keylen: number, digest: string): Uint8Array {
    throw new Error('pbkdf2Sync is async in BunTS; use pbkdf2Async()')
  }

  async function pbkdf2Async(
    password: string | Uint8Array,
    salt: string | Uint8Array,
    iterations: number,
    keylen: number,
    digest: string,
  ): Promise<Uint8Array> {
    const key = await subtle!.importKey('raw', toBuffer(toBytes(password)), 'PBKDF2', false, ['deriveBits'])
    const bits = await subtle!.deriveBits(
      { name: 'PBKDF2', hash: normalizeAlgorithm(digest), salt: toBuffer(toBytes(salt)), iterations },
      key,
      keylen * 8,
    )
    return new Uint8Array(bits)
  }

  function scryptSync() {
    throw new Error('scryptSync is not supported in browser runtime')
  }

  async function scryptAsync() {
    throw new Error('scrypt is not supported in browser runtime')
  }

  return {
    randomBytes,
    randomFillSync,
    randomUUID,
    createHash,
    createHmac,
    createCipheriv,
    createDecipheriv,
    timingSafeEqual,
    pbkdf2Sync,
    pbkdf2: pbkdf2Async,
    scryptSync,
    scrypt: scryptAsync,
    createPublicKey,
    createPrivateKey,
    createSecretKey,
    subtle,
  }
}
