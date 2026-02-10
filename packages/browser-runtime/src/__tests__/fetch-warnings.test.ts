import { describe, expect, it, vi } from 'vitest'
import { wrapFetchWithWarnings } from '../fetch-warnings'

describe('wrapFetchWithWarnings', () => {
  it('warns on unsupported fetch options', async () => {
    const warnings: string[] = []
    const warn = (message: string) => warnings.push(message)
    const fetchMock = vi.fn(async () => 'ok')

    const wrapped = wrapFetchWithWarnings(fetchMock as unknown as typeof fetch, warn)

    await wrapped('https://example.com', {
      proxy: 'http://proxy.local',
      tls: { servername: 'example.com' },
      unix: '/tmp/socket',
    } as RequestInit)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(new Set(warnings)).toEqual(
      new Set([
        'fetch option "proxy" is not supported in browser runtime',
        'fetch option "tls" is not supported in browser runtime',
        'fetch option "unix" is not supported in browser runtime',
      ]),
    )
  })

  it('warns once per option key', async () => {
    const warn = vi.fn()
    const fetchMock = vi.fn(async () => 'ok')
    const wrapped = wrapFetchWithWarnings(fetchMock as unknown as typeof fetch, warn)

    await wrapped('https://example.com', { proxy: 'http://proxy.local' } as RequestInit)
    await wrapped('https://example.com', { proxy: 'http://proxy.local' } as RequestInit)
    await wrapped('https://example.com', { tls: { rejectUnauthorized: false } } as RequestInit)

    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('warns on fetch.preconnect', () => {
    const warn = vi.fn()
    const fetchMock = vi.fn(async () => 'ok')
    const wrapped = wrapFetchWithWarnings(fetchMock as unknown as typeof fetch, warn)

    wrapped.preconnect?.('https://example.com')
    wrapped.preconnect?.('https://example.com')

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('fetch.preconnect is not supported in browser runtime')
  })
})
