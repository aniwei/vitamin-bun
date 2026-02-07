import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { createBunRuntime } from '../bun-runtime'

describe('Bun.file and Bun.write', () => {
  it('writes and reads text content', async () => {
    const vfs = new VirtualFileSystem()
    const runtime = createBunRuntime(vfs, {}, () => {}, () => {})

    await runtime.Bun.write('/hello.txt', 'hello')
    const text = await runtime.Bun.file('/hello.txt').text()

    expect(text).toBe('hello')
  })

  it('writes bytes and reads arrayBuffer', async () => {
    const vfs = new VirtualFileSystem()
    const runtime = createBunRuntime(vfs, {}, () => {}, () => {})

    const bytes = new TextEncoder().encode('bytes')
    await runtime.Bun.write('/data.bin', bytes)
    const buffer = await runtime.Bun.file('/data.bin').arrayBuffer()

    expect(new Uint8Array(buffer)).toEqual(bytes)
  })

  it('reads bytes directly', async () => {
    const vfs = new VirtualFileSystem()
    const runtime = createBunRuntime(vfs, {}, () => {}, () => {})

    const bytes = new Uint8Array([1, 2, 3])
    await runtime.Bun.write('/bytes.bin', bytes)
    const out = await runtime.Bun.file('/bytes.bin').bytes()

    expect(out).toEqual(bytes)
  })

  it('reads JSON content', async () => {
    const vfs = new VirtualFileSystem()
    const runtime = createBunRuntime(vfs, {}, () => {}, () => {})

    await runtime.Bun.write('/data.json', JSON.stringify({ ok: true }))
    const value = await runtime.Bun.file('/data.json').json()

    expect(value).toEqual({ ok: true })
  })

  it('reports existence for files', async () => {
    const vfs = new VirtualFileSystem()
    const runtime = createBunRuntime(vfs, {}, () => {}, () => {})

    const missing = await runtime.Bun.file('/missing.txt').exists()
    expect(missing).toBe(false)

    await runtime.Bun.write('/exists.txt', 'ok')
    const present = await runtime.Bun.file('/exists.txt').exists()
    expect(present).toBe(true)
  })

  it('deletes files', async () => {
    const vfs = new VirtualFileSystem()
    const runtime = createBunRuntime(vfs, {}, () => {}, () => {})

    await runtime.Bun.write('/delete.txt', 'remove')
    await runtime.Bun.file('/delete.txt').delete()

    await expect(runtime.Bun.file('/delete.txt').text()).rejects.toThrow(/ENOENT/)
  })

  it('throws on missing file', async () => {
    const vfs = new VirtualFileSystem()
    const runtime = createBunRuntime(vfs, {}, () => {}, () => {})

    await expect(runtime.Bun.file('/missing.txt').text()).rejects.toThrow(/ENOENT/)
  })

  it('writes from Response and Blob', async () => {
    const vfs = new VirtualFileSystem()
    const runtime = createBunRuntime(vfs, {}, () => {}, () => {})

    const response = new Response('from-response')
    await runtime.Bun.write('/response.txt', response)
    const responseText = await runtime.Bun.file('/response.txt').text()
    expect(responseText).toBe('from-response')

    const blob = new Blob(['from-blob'])
    await runtime.Bun.write('/blob.txt', blob)
    const blobText = await runtime.Bun.file('/blob.txt').text()
    expect(blobText).toBe('from-blob')
  })

  it('writes from streaming Response', async () => {
    const vfs = new VirtualFileSystem()
    const runtime = createBunRuntime(vfs, {}, () => {}, () => {})

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('chunk-1'))
        controller.enqueue(new TextEncoder().encode('-chunk-2'))
        controller.close()
      },
    })

    const response = new Response(stream)
    await runtime.Bun.write('/stream.txt', response)

    const text = await runtime.Bun.file('/stream.txt').text()
    expect(text).toBe('chunk-1-chunk-2')
  })

  it('writes through FileSink', async () => {
    const vfs = new VirtualFileSystem()
    const runtime = createBunRuntime(vfs, {}, () => {}, () => {})

    const sink = runtime.Bun.file('/sink.txt').writer()
    await sink.write('hello')
    await sink.write(new Uint8Array([32, 33]))
    sink.flush()
    sink.close()

    const text = await runtime.Bun.file('/sink.txt').text()
    expect(text).toBe('hello !')
  })
})
