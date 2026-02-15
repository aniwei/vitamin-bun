export function createQuerystringModule() {
  function parse(input: string): Record<string, string> {
    const out: Record<string, string> = {}
    if (!input) return out

    const parts = input.split('&')
    for (const part of parts) {
      if (!part) continue
      
      const [rawKey, rawValue = ''] = part.split('=')
      const key = decodeURIComponent(rawKey.replace(/\+/g, ' '))
      const value = decodeURIComponent(rawValue.replace(/\+/g, ' '))
      out[key] = value
    }
    
    return out
  }

  function stringify(input: Record<string, unknown>): string {
    return Object.entries(input)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&')
  }

  return { parse, stringify }
}
