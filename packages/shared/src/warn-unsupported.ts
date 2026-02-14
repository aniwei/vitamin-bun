const warnOnceKeys = new Set<string>()

export function warnUnsupported(key: string, message: string) {
  if (warnOnceKeys.has(key)) return
  warnOnceKeys.add(key)
  console.warn(message)
}
