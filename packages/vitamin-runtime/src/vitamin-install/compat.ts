export function getCryptoOrThrow(): Crypto {
  if (typeof crypto !== 'undefined') return crypto
  throw new Error('WebCrypto is not available in this runtime')
}

export function notImplemented(feature: string): never {
  throw new Error(`${feature} is not implemented yet`)
}
