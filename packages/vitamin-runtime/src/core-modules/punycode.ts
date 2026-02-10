export function createPunycodeModule() {
  function toASCII(domain: string): string {
    try {
      const url = new URL(`http://${domain}`)
      return url.hostname
    } catch {
      return domain
    }
  }

  function toUnicode(domain: string): string {
    try {
      const url = new URL(`http://${domain}`)
      return url.hostname
    } catch {
      return domain
    }
  }

  return { toASCII, toUnicode }
}
