import { describe, it, expect, beforeEach } from 'vitest'
import { VirtualFileSystem } from '../vfs.js'
import { InodeKind, Whence } from '../types.js'

describe('VirtualFileSystem', () => {
  let vfs: VirtualFileSystem

  beforeEach(() => {
    vfs = new VirtualFileSystem()
  })

  // -------------------------------------------------------------------------
  // Directory operations
  // -------------------------------------------------------------------------

  describe('mkdir / readdir', () => {
    it('creates a directory and lists it', () => {
      vfs.mkdir('/src')
      const entries = vfs.readdir('/')
      expect(entries).toHaveLength(1)
      expect(entries[0].name).toBe('src')
      expect(entries[0].kind).toBe(InodeKind.Directory)
    })

    it('throws when parent does not exist', () => {
      expect(() => vfs.mkdir('/a/b')).toThrow('ENOENT')
    })

    it('throws on duplicate directory', () => {
      vfs.mkdir('/dup')
      expect(() => vfs.mkdir('/dup')).toThrow('EEXIST')
    })
  })

  describe('mkdirp', () => {
    it('creates nested directories', () => {
      vfs.mkdirp('/a/b/c')
      expect(vfs.exists('/a')).toBe(true)
      expect(vfs.exists('/a/b')).toBe(true)
      expect(vfs.exists('/a/b/c')).toBe(true)
    })

    it('is idempotent', () => {
      vfs.mkdirp('/x/y')
      vfs.mkdirp('/x/y')
      expect(vfs.exists('/x/y')).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // File operations
  // -------------------------------------------------------------------------

  describe('writeFile / readFile', () => {
    it('writes and reads a string file', () => {
      vfs.writeFile('/hello.txt', 'world')
      expect(vfs.readFile('/hello.txt')).toBe('world')
    })

    it('writes and reads binary data', () => {
      const data = new Uint8Array([1, 2, 3, 4])
      vfs.writeFile('/bin', data)
      expect(vfs.readFileBytes('/bin')).toEqual(data)
    })

    it('overwrites existing file', () => {
      vfs.writeFile('/f', 'old')
      vfs.writeFile('/f', 'new')
      expect(vfs.readFile('/f')).toBe('new')
    })

    it('throws on reading non-existent file', () => {
      expect(() => vfs.readFile('/nope')).toThrow('ENOENT')
    })

    it('requires parent directory to exist', () => {
      expect(() => vfs.writeFile('/no/parent', 'x')).toThrow('ENOENT')
    })
  })

  describe('unlink', () => {
    it('deletes a file', () => {
      vfs.writeFile('/tmp', 'data')
      vfs.unlink('/tmp')
      expect(vfs.exists('/tmp')).toBe(false)
    })

    it('throws on directory', () => {
      vfs.mkdir('/dir')
      expect(() => vfs.unlink('/dir')).toThrow('EISDIR')
    })
  })

  describe('rmdir', () => {
    it('removes an empty directory', () => {
      vfs.mkdir('/empty')
      vfs.rmdir('/empty')
      expect(vfs.exists('/empty')).toBe(false)
    })

    it('throws on non-empty directory', () => {
      vfs.mkdir('/parent')
      vfs.writeFile('/parent/child', 'x')
      expect(() => vfs.rmdir('/parent')).toThrow('ENOTEMPTY')
    })
  })

  describe('stat', () => {
    it('returns metadata for a file', () => {
      vfs.writeFile('/s', 'hello')
      const st = vfs.stat('/s')
      expect(st.kind).toBe(InodeKind.File)
      expect(st.size).toBe(5)
    })

    it('returns metadata for a directory', () => {
      vfs.mkdir('/d')
      const st = vfs.stat('/d')
      expect(st.kind).toBe(InodeKind.Directory)
    })
  })

  // -------------------------------------------------------------------------
  // File descriptor operations
  // -------------------------------------------------------------------------

  describe('open / fdRead / fdWrite / close', () => {
    it('reads file content via fd', () => {
      vfs.writeFile('/data', 'abcdef')
      const fd = vfs.open('/data')
      const chunk = vfs.fdRead(fd, 3)
      expect(new TextDecoder().decode(chunk)).toBe('abc')
      const rest = vfs.fdRead(fd, 100)
      expect(new TextDecoder().decode(rest)).toBe('def')
      vfs.close(fd)
    })

    it('writes via fd', () => {
      vfs.writeFile('/out', '')
      const fd = vfs.open('/out', { write: true })
      const encoder = new TextEncoder()
      vfs.fdWrite(fd, encoder.encode('hello'))
      vfs.close(fd)
      expect(vfs.readFile('/out')).toBe('hello')
    })

    it('creates file with create flag', () => {
      const fd = vfs.open('/new', { create: true, write: true })
      vfs.fdWrite(fd, new TextEncoder().encode('created'))
      vfs.close(fd)
      expect(vfs.readFile('/new')).toBe('created')
    })

    it('seeks within a file', () => {
      vfs.writeFile('/seek', 'abcdef')
      const fd = vfs.open('/seek')
      vfs.fdSeek(fd, 2, Whence.Set)
      const chunk = vfs.fdRead(fd, 2)
      expect(new TextDecoder().decode(chunk)).toBe('cd')
      vfs.close(fd)
    })

    it('throws on bad fd', () => {
      expect(() => vfs.fdRead(999, 1)).toThrow('EBADF')
      expect(() => vfs.close(999)).toThrow('EBADF')
    })
  })
})
