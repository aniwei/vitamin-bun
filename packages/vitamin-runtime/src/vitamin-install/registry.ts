import type { InstallContext } from './types'

export type RegistryMetadata = {
  versions: Record<string, { dist?: { tarball?: string; integrity?: string } }>
  'dist-tags'?: Record<string, string>
}

const registryCache = new Map<string, Promise<RegistryMetadata>>()

export async function fetchRegistryMetadata(
  ctx: InstallContext,
  name: string,
  cache: Map<string, Promise<RegistryMetadata>> = registryCache,
): Promise<RegistryMetadata> {
  const key = `${ctx.registryUrl}|${name}`
  if (!cache.has(key)) {
    const url = `${ctx.registryUrl}/${encodePackageName(name)}`
    cache.set(key, fetchJson<RegistryMetadata>(ctx, url))
  }
  return await cache.get(key)!
}

async function fetchJson<T>(ctx: InstallContext, url: string): Promise<T> {
  const cached = await ctx.cache?.getJson(url)
  if (cached) return cached as T

  const response = await ctx.fetchImpl(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  const json = (await response.json()) as T
  await ctx.cache?.setJson(url, json)
  return json
}

function encodePackageName(name: string): string {
  if (name.startsWith('@')) {
    return name.replace('/', '%2f')
  }
  return name
}
