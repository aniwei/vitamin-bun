import { getCryptoOrThrow } from './compat'

export async function verifyIntegrity(
  data: ArrayBuffer | Uint8Array,
  integrity: string,
): Promise<void> {
  const candidates = integrity.trim().split(/\s+/)
  if (candidates.length === 0) throw new Error(`Unsupported integrity format: ${integrity}`)
  const subtle = getCryptoOrThrow().subtle
  const buffer = data instanceof Uint8Array ? data.slice().buffer : data.slice(0)

  const results: Array<{ algorithm: string; expected: string; actual: string }> = []

  for (const candidate of candidates) {
    const [algorithm, expected] = candidate.split('-', 2)
    if (!expected) continue
    const digest = await subtle.digest(normalizeAlgorithm(algorithm), buffer)
    const actual = toBase64(new Uint8Array(digest))
    results.push({ algorithm, expected, actual })
    if (actual === expected) return
  }

  const summary = results.map((item) => `${item.algorithm}: ${item.actual}`).join(', ')
  throw new Error(`Integrity check failed for ${summary}`)
}

function normalizeAlgorithm(algorithm: string): AlgorithmIdentifier {
  switch (algorithm) {
    case 'sha512':
      return 'SHA-512'
    case 'sha256':
      return 'SHA-256'
    case 'sha1':
      return 'SHA-1'
    default:
      throw new Error(`Unsupported integrity algorithm: ${algorithm}`)
  }
}

function toBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let output = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const triple = (a << 16) | (b << 8) | c
    output += alphabet[(triple >> 18) & 0x3f]
    output += alphabet[(triple >> 12) & 0x3f]
    output += i + 1 < bytes.length ? alphabet[(triple >> 6) & 0x3f] : '='
    output += i + 2 < bytes.length ? alphabet[triple & 0x3f] : '='
  }
  return output
}
