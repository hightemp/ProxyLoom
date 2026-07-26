import { afterEach, describe, expect, it, vi } from 'vitest'

import { BatchedLogStore } from '../../../src/application/logging/batched-log-store'
import type { LogEntry } from '../../../src/application/logging/log-types'
import type { LogStorePort } from '../../../src/application/ports/log-store'

const entry = (hostname: string): LogEntry => ({
  actualProxyInfo: null,
  authFailure: false,
  correlationTabId: 1,
  errorCode: null,
  globalMode: 'RULES',
  hostname,
  httpStatus: 200,
  matchedRuleId: null,
  matchedRuleName: null,
  plannedAction: 'DIRECT',
  plannedProxyProfileId: null,
  platform: 'CHROMIUM',
  requestType: 'MAIN_FRAME',
  scheme: 'https',
  timestamp: '2026-01-01T00:00:00.000Z',
  totalDurationMs: 1,
})

class RecordingStore implements LogStorePort {
  readonly batches: LogEntry[][] = []
  readonly entries: LogEntry[] = []

  appendBatch(entries: readonly LogEntry[]): Promise<void> {
    this.batches.push([...entries])
    this.entries.push(...entries)
    return Promise.resolve()
  }

  page(): Promise<readonly LogEntry[]> {
    return Promise.resolve(this.entries)
  }

  count(): Promise<number> {
    return Promise.resolve(this.entries.length)
  }

  clear(): Promise<void> {
    this.entries.splice(0)
    return Promise.resolve()
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('batched log store', () => {
  it('flushes at 50 entries without exceeding the batch bound', async () => {
    const store = new RecordingStore()
    const batched = new BatchedLogStore(store)
    const pending = Array.from({ length: 51 }, (_, index) =>
      batched.appendBatch([entry(`host-${String(index)}.example`)]),
    )

    await vi.waitFor(() => expect(store.batches[0]).toHaveLength(50))
    await batched.flushAll()
    await Promise.all(pending)
    expect(store.batches.map((batch) => batch.length)).toEqual([50, 1])
  })

  it('flushes after 250 ms and before reads or clear', async () => {
    vi.useFakeTimers()
    const store = new RecordingStore()
    const batched = new BatchedLogStore(store)
    const first = batched.appendBatch([entry('timer.example')])
    expect(store.batches).toEqual([])
    await vi.advanceTimersByTimeAsync(249)
    expect(store.batches).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    await first
    expect(store.batches).toHaveLength(1)

    void batched.appendBatch([entry('read.example')])
    await expect(
      batched.page({
        errorsOnly: false,
        hostname: '',
        limit: 100,
        offset: 0,
        platform: null,
      }),
    ).resolves.toHaveLength(2)
    void batched.appendBatch([entry('clear.example')])
    await batched.clear()
    await expect(batched.count()).resolves.toBe(0)
  })
})
