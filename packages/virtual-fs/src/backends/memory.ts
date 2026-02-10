import type { StorageBackend } from '../types'

export class MemoryBackend implements StorageBackend {
  private store = new Map<number, Uint8Array>()

  async read(ino: number): Promise<Uint8Array> {
    const data = this.store.get(ino)
    if (!data) {
      throw new Error(`ENOENT: inode ${ino} not found in memory backend`)
    }
    return data
  }

  async write(ino: number, data: Uint8Array): Promise<void> {
    this.store.set(ino, data)
  }

  async delete(ino: number): Promise<void> {
    this.store.delete(ino)
  }

  async exists(ino: number): Promise<boolean> {
    return this.store.has(ino)
  }
}
