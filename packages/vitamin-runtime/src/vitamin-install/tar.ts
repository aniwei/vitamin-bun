import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'

export function extractTarToVfs(
  vfs: VirtualFileSystem,
  tar: Uint8Array,
  targetRoot: string,
): void {
  vfs.mkdirp(targetRoot)
  let offset = 0
  const textDecoder = new TextDecoder()

  while (offset + 512 <= tar.length) {
    const header = tar.slice(offset, offset + 512)
    if (isZeroBlock(header)) break

    const name = readString(textDecoder, header, 0, 100)
    const prefix = readString(textDecoder, header, 345, 155)
    const sizeText = readString(textDecoder, header, 124, 12).trim()
    const typeflag = header[156]

    const size = sizeText ? parseInt(sizeText, 8) : 0
    const fullName = prefix ? `${prefix}/${name}` : name
    const normalized = stripPackagePrefix(fullName)

    const dataStart = offset + 512
    const dataEnd = dataStart + size

    if (normalized) {
      const targetPath = joinPath(targetRoot, normalized)
      if (typeflag === 53) {
        vfs.mkdirp(targetPath)
      } else {
        const dir = targetPath.split('/').slice(0, -1).join('/')
        if (dir) vfs.mkdirp(dir)
        vfs.writeFile(targetPath, tar.slice(dataStart, dataEnd))
      }
    }

    const blocks = Math.ceil(size / 512)
    offset = dataStart + blocks * 512
  }
}

function stripPackagePrefix(path: string): string | null {
  const trimmed = path.replace(/^\/+/, '')
  if (!trimmed.startsWith('package/')) return null
  return trimmed.slice('package/'.length)
}

function readString(
  decoder: TextDecoder,
  buf: Uint8Array,
  start: number,
  length: number,
): string {
  const slice = buf.slice(start, start + length)
  let end = slice.indexOf(0)
  if (end === -1) end = slice.length
  return decoder.decode(slice.slice(0, end))
}

function isZeroBlock(block: Uint8Array): boolean {
  for (const byte of block) {
    if (byte !== 0) return false
  }
  return true
}

function joinPath(...parts: string[]): string {
  const joined = parts.join('/')
  const normalized = joined.replace(/\/+|\\+/g, '/').replace(/\/+$/, '') || '/'
  if (parts[0]?.startsWith('/') && !normalized.startsWith('/')) {
    return `/${normalized}`
  }
  return normalized
}
