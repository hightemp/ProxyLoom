import { afterEach, describe, expect, it, vi } from 'vitest'

import { measureDownloadInPage } from '../../../src/platform/runtime/speed-probe'

const chunk = (size: number) => new Uint8Array(size)

const streamResponse = (chunks: readonly number[], status = 200, delayMs = 0): Response => {
  let index = 0
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
      const next = chunks[index++]
      if (next === undefined) controller.close()
      else controller.enqueue(chunk(next))
    },
  })
  return new Response(body, { status })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('in-page download probe', () => {
  it('counts every byte of a complete download without caching', async () => {
    const fetcher = vi.fn().mockResolvedValue(streamResponse([400_000, 400_000, 200_000]))
    vi.stubGlobal('fetch', fetcher)
    const sample = await measureDownloadInPage('https://speed.example/down', 5_000_000, 15_000)
    expect(sample).toMatchObject({ bytes: 1_000_000, ok: true })
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store', credentials: 'omit' })
  })

  it('stops at the byte limit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(Array(50).fill(300_000))))
    const sample = await measureDownloadInPage('https://speed.example/down', 1_000_000, 15_000)
    expect(sample).toMatchObject({ ok: true })
    expect((sample as { bytes: number }).bytes).toBeGreaterThanOrEqual(1_000_000)
    expect((sample as { bytes: number }).bytes).toBeLessThan(1_400_000)
  })

  it('stops at the time limit and reports what arrived', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(streamResponse(Array(100).fill(100_000), 200, 20)),
    )
    const sample = await measureDownloadInPage('https://speed.example/down', 50_000_000, 100)
    expect(sample.ok).toBe(true)
    expect((sample as { bytes: number }).bytes).toBeLessThan(2_000_000)
  })

  it.each([
    ['an HTTP error', () => Promise.resolve(streamResponse([10], 503)), 'HTTP_ERROR'],
    ['a network error', () => Promise.reject(new TypeError('offline')), 'NETWORK_ERROR'],
    ['too little data', () => Promise.resolve(streamResponse([10_000])), 'TOO_LITTLE_DATA'],
  ])('reports %s', async (_name, response, code) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(response))
    await expect(
      measureDownloadInPage('https://speed.example/down', 5_000_000, 15_000),
    ).resolves.toEqual({ code, ok: false })
  })
})
