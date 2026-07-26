import { describe, expect, it } from 'vitest'

import type { LogEntry } from '../../../src/application/logging/log-types'
import {
  IndexedDbLogRepository,
  MAX_LOG_ENTRIES,
} from '../../../src/storage/logs/indexeddb-log-repository'

const entry = (index: number): LogEntry => ({
  actualProxyInfo: null,
  authFailure: false,
  correlationTabId: index,
  errorCode: index % 2 === 0 ? null : 'TEST_ERROR',
  globalMode: 'RULES',
  hostname: `host-${String(index)}.example`,
  httpStatus: 200,
  matchedRuleId: null,
  matchedRuleName: null,
  plannedAction: 'DIRECT',
  plannedProxyProfileId: null,
  platform: index % 2 === 0 ? 'CHROMIUM' : 'FIREFOX',
  requestType: 'MAIN_FRAME',
  scheme: 'https',
  timestamp: new Date(1_700_000_000_000 + index).toISOString(),
  totalDurationMs: index,
})

describe('IndexedDB log ring buffer', () => {
  it('trims the oldest entry transactionally at 1001+', async () => {
    const repository = new IndexedDbLogRepository(`logs-${crypto.randomUUID()}`)
    await repository.appendBatch(
      Array.from({ length: MAX_LOG_ENTRIES + 5 }, (_, index) => entry(index)),
    )

    expect(await repository.count()).toBe(MAX_LOG_ENTRIES)
    const oldestRetained = await repository.page({
      errorsOnly: false,
      hostname: '',
      limit: MAX_LOG_ENTRIES,
      offset: 0,
      platform: null,
    })
    expect(oldestRetained.at(-1)?.hostname).toBe('host-5.example')
    expect(oldestRetained[0]?.hostname).toBe('host-1004.example')
  })

  it('pages newest-first with filters and clears atomically', async () => {
    const repository = new IndexedDbLogRepository(`logs-${crypto.randomUUID()}`)
    await Promise.all([
      repository.appendBatch([entry(0), entry(1)]),
      repository.appendBatch([entry(2), entry(3)]),
    ])

    const page = await repository.page({
      errorsOnly: true,
      hostname: 'host-',
      limit: 1,
      offset: 1,
      platform: 'FIREFOX',
    })
    expect(page).toMatchObject([{ hostname: 'host-1.example', platform: 'FIREFOX' }])

    await repository.clear()
    expect(await repository.count()).toBe(0)
  })
})
