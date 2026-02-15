export function createUtilModule() {
  function format(...args: unknown[]): string {
    if (args.length === 0) return ''
    const [first, ...rest] = args
    if (typeof first !== 'string') {
      return [inspect(first), ...rest.map((arg) => inspect(arg))].join(' ')
    }

    let index = 0
    const formatted = first.replace(/%[sdj%]/g, (token) => {
      if (token === '%%') return '%'
      if (index >= rest.length) return token
      const value = rest[index++]
      switch (token) {
        case '%s':
          return String(value)
        case '%d':
          return Number(value).toString()
        case '%j':
          try {
            return JSON.stringify(value)
          } catch {
            return '[Circular]'
          }
        default:
          return token
      }
    })

    const remaining = rest.slice(index).map((arg) => inspect(arg))
    return remaining.length ? `${formatted} ${remaining.join(' ')}` : formatted
  }

  function inspect(value: unknown): string {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
    if (value instanceof Date) return value.toISOString()
    if (value instanceof RegExp) return value.toString()
    if (Array.isArray(value)) return `[${value.map((item) => inspect(item)).join(', ')}]`
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
      const inner = entries.map(([k, v]) => `${k}: ${inspect(v)}`).join(', ')
      return `{ ${inner} }`
    }
    return String(value)
  }

  const types = {
    isDate: (value: unknown): value is Date => value instanceof Date,
    isRegExp: (value: unknown): value is RegExp => value instanceof RegExp,
    isPromise: (value: unknown): value is Promise<unknown> =>
      !!value && (typeof value === 'object' || typeof value === 'function') && typeof (value as Promise<unknown>).then === 'function',
  }

  return { format, inspect, types }
}
