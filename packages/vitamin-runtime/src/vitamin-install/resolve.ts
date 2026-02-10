import type { RegistryMetadata } from './registry'

export function resolveVersion(spec: string, metadata: RegistryMetadata): string {
  const tags = metadata['dist-tags'] ?? {}
  if (!spec || spec === '*' || spec === 'latest') {
    return tags.latest ?? fail('No latest tag found')
  }
  if (spec in tags) return tags[spec]

  const normalized = spec.replace(/^workspace:/, '')
  if (metadata.versions[normalized]) return normalized

  const ranges = normalized.split('||').map((part) => part.trim()).filter(Boolean)
  const candidates = Object.keys(metadata.versions).filter((version) =>
    ranges.length > 0
      ? ranges.some((range) => satisfiesRange(version, range))
      : satisfiesRange(version, normalized),
  )
  const selected = maxVersion(candidates)

  if (!selected) throw new Error(`No matching version for ${spec}`)
  return selected
}

export function satisfiesRange(version: string, range: string): boolean {
  if (!range || range === '*' || range === 'latest') return true
  if (range.includes('||')) {
    return range.split('||').some((part) => satisfiesRange(version, part.trim()))
  }
  if (range.startsWith('^') || range.startsWith('~')) {
    const base = normalizeShortVersion(range.slice(1))
    const baseVersion = parseVersion(base)
    if (!baseVersion) return false
    const upper = range.startsWith('^') ? bumpCaret(baseVersion) : bumpTilde(baseVersion)
    return compareVersion(version, base) >= 0 && compareVersion(version, upper) < 0
  }

  if (range.includes(' ')) {
    return range.split(/\s+/).every((part) => satisfiesRange(version, part))
  }

  const comparatorMatch = range.match(/^(>=|<=|>|<|=)?\s*(.+)$/)
  if (!comparatorMatch) return false
  const [, operator, raw] = comparatorMatch
  const target = normalizeShortVersion(raw)

  if (raw.endsWith('.x') || raw.endsWith('.*')) {
    return matchesWildcard(version, raw)
  }

  const cmp = compareVersion(version, target)
  switch (operator) {
    case '>':
      return cmp > 0
    case '>=':
      return cmp >= 0
    case '<':
      return cmp < 0
    case '<=':
      return cmp <= 0
    case '=':
    case undefined:
      return cmp === 0
    default:
      return false
  }
}

function parseVersion(version: string): { major: number; minor: number; patch: number } | null {
  const clean = version.split('-')[0]
  const parts = clean.split('.')

  if (parts.length < 3) return null

  const major = Number(parts[0])
  const minor = Number(parts[1])
  const patch = Number(parts[2])

  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) return null

  return { major, minor, patch }
}

function maxVersion(versions: string[]): string | null {
  let best: string | null = null
  for (const version of versions) {
    if (!best) {
      best = version
      continue
    }
    if (compareVersion(version, best) > 0) {
      best = version
    }
  }
  return best
}

function compareVersion(a: string, b: string): number {
  const av = parseVersion(a)
  const bv = parseVersion(b)
  if (!av || !bv) return 0
  if (av.major !== bv.major) return av.major - bv.major
  if (av.minor !== bv.minor) return av.minor - bv.minor
  return av.patch - bv.patch
}

function normalizeShortVersion(version: string): string {
  const parts = version.split('.')
  while (parts.length < 3) parts.push('0')
  return parts.join('.')
}

function matchesWildcard(version: string, raw: string): boolean {
  const normalized = raw.replace(/\*|x/g, '0')
  const target = parseVersion(normalized)
  const current = parseVersion(version)
  if (!target || !current) return false
  const rawParts = raw.split('.')
  if (rawParts.length >= 1 && rawParts[0] !== '*' && rawParts[0] !== 'x') {
    if (current.major !== target.major) return false
  }
  if (rawParts.length >= 2 && rawParts[1] !== '*' && rawParts[1] !== 'x') {
    if (current.minor !== target.minor) return false
  }
  if (rawParts.length >= 3 && rawParts[2] !== '*' && rawParts[2] !== 'x') {
    if (current.patch !== target.patch) return false
  }
  return true
}

function bumpCaret(version: { major: number; minor: number; patch: number }): string {
  if (version.major > 0) return `${version.major + 1}.0.0`
  if (version.minor > 0) return `0.${version.minor + 1}.0`
  return `0.0.${version.patch + 1}`
}

function bumpTilde(version: { major: number; minor: number; patch: number }): string {
  return `${version.major}.${version.minor + 1}.0`
}

function fail(message: string): never {
  throw new Error(message)
}
