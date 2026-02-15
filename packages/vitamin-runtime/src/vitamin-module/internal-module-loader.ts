import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'

export interface InternalModuleLoaderOptions {
  vfs: VirtualFileSystem
  sourceCache?: Map<string, string>
  modulePrefix?: string
  fetchImpl?: typeof fetch
}

export class InternalModuleLoader {
  private vfs: VirtualFileSystem
  private sourceCache: Map<string, string>
  private modulePrefix?: string
  private fetchImpl?: typeof fetch

  constructor(options: InternalModuleLoaderOptions) {
    this.vfs = options.vfs
    this.sourceCache = options.sourceCache ?? new Map<string, string>()
    this.modulePrefix = options.modulePrefix
    this.fetchImpl = options.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined)
  }

  getFromCache(id: string): string | undefined {
    return this.sourceCache.get(id)
  }

  setCache(id: string, source: string): void {
    this.sourceCache.set(id, source)
  }

  invalidate(id?: string): void {
    if (!id) {
      this.sourceCache.clear()
      return
    }
    this.sourceCache.delete(id)
  }

  async load(id: string, parent?: string): Promise<string> {
    const cached = this.sourceCache.get(id)
    if (cached !== undefined) {
      return cached
    }

    if (this.vfs.exists(id)) {
      const source = this.vfs.readFile(id)
      this.sourceCache.set(id, source)
      return source
    }

    const source = await this.loadViaServiceWorker(id)
    if (source !== undefined) {
      this.sourceCache.set(id, source)
      return source
    }

    const parentText = parent ? ` (parent: ${parent})` : ''
    throw new Error(`Failed to load module source: ${id}${parentText}`)
  }

  private async loadViaServiceWorker(id: string): Promise<string | undefined> {
    if (!this.fetchImpl || !this.modulePrefix) return undefined

    const normalized = id.startsWith('/') ? id.slice(1) : id
    const encodedPath = normalized
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    const base = this.modulePrefix.endsWith('/') ? this.modulePrefix : `${this.modulePrefix}/`
    const url = `${base}${encodedPath}`

    const response = await this.fetchImpl(url)
    if (!response.ok) return undefined
    return await response.text()
  }
}
