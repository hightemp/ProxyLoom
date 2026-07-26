import { describe, expect, it, vi } from 'vitest'

import { LoggingService } from '../../../src/application/logging/logging-service'
import { PrivateLogBuffer } from '../../../src/application/logging/private-buffer'
import type { LogEntry, LogQuery } from '../../../src/application/logging/log-types'
import type { LogStorePort } from '../../../src/application/ports/log-store'
import { buildRoutingSnapshot } from '../../../src/domain/routing/snapshot'
import { resolveRoute } from '../../../src/domain/routing/resolver'
import { config } from '../domain/fixtures'

class SpyLogStore implements LogStorePort {
  readonly entries: LogEntry[] = []

  appendBatch(entries: readonly LogEntry[]): Promise<void> {
    this.entries.push(...entries)
    return Promise.resolve()
  }

  page(_query: LogQuery): Promise<readonly LogEntry[]> {
    void _query
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

const decisionFor = (url: string) => {
  const value = config()
  const snapshot = buildRoutingSnapshot(value, [], new Date('2026-01-01T00:00:00.000Z'))
  if (!snapshot.ok) {
    throw new Error('Fixture snapshot must be valid.')
  }
  return resolveRoute(snapshot.value, {
    incognito: false,
    now: new Date('2026-01-01T00:00:00.000Z'),
    platform: 'CHROMIUM',
    tabId: 3,
    url,
  })
}

describe('logging policy and redaction', () => {
  it('stores only hostname/scheme and structurally discards path, query, fragment, and credentials', async () => {
    const store = new SpyLogStore()
    const service = new LoggingService(store, new PrivateLogBuffer())
    const url =
      'https://canary-user:canary-password@Sub.Example.com/private/canary-path?token=canary-query#secret'

    await service.record(config(), {
      actualProxyInfo: null,
      authFailure: false,
      decision: decisionFor(url),
      errorCode: null,
      httpStatus: 200,
      incognito: false,
      internal: false,
      platform: 'CHROMIUM',
      requestType: 'MAIN_FRAME',
      tabId: 3,
      timestamp: new Date('2026-01-01T00:00:00.000Z'),
      totalDurationMs: 10,
      url,
    })

    expect(store.entries).toMatchObject([{ hostname: 'sub.example.com', scheme: 'https' }])
    const serialized = JSON.stringify(store.entries)
    expect(serialized).not.toContain('canary-user')
    expect(serialized).not.toContain('canary-password')
    expect(serialized).not.toContain('canary-path')
    expect(serialized).not.toContain('canary-query')
  })

  it('honors disabled/pause/default modes and excludes internal checks', async () => {
    const store = new SpyLogStore()
    const service = new LoggingService(store, new PrivateLogBuffer())
    const append = vi.spyOn(store, 'appendBatch')
    const baseEvent = {
      actualProxyInfo: null,
      authFailure: false,
      decision: decisionFor('https://example.com/'),
      errorCode: null,
      httpStatus: 200,
      incognito: false,
      internal: false,
      platform: 'CHROMIUM' as const,
      requestType: 'XMLHTTPREQUEST' as const,
      tabId: 3,
      timestamp: new Date('2026-01-01T00:00:00.000Z'),
      totalDurationMs: 10,
      url: 'https://example.com/path',
    }

    await service.record(config(), baseEvent)
    await service.record(config({ general: { ...config().general, loggingEnabled: false } }), {
      ...baseEvent,
      requestType: 'MAIN_FRAME',
    })
    await service.record(config(), { ...baseEvent, internal: true, requestType: 'MAIN_FRAME' })
    await service.record(config(), {
      ...baseEvent,
      errorCode: 'FAILED',
    })

    expect(append).toHaveBeenCalledTimes(1)
  })

  it('keeps private logs in memory and clears them with the private session', async () => {
    const store = new SpyLogStore()
    const privateBuffer = new PrivateLogBuffer(2)
    const service = new LoggingService(store, privateBuffer)
    const event = {
      actualProxyInfo: null,
      authFailure: false,
      decision: decisionFor('https://example.com/'),
      errorCode: null,
      httpStatus: 200,
      incognito: true,
      internal: false,
      platform: 'CHROMIUM' as const,
      requestType: 'MAIN_FRAME' as const,
      tabId: 3,
      timestamp: new Date('2026-01-01T00:00:00.000Z'),
      totalDurationMs: 10,
      url: 'https://example.com/path',
    }

    await service.record(config(), event)

    expect(store.entries).toEqual([])
    expect(privateBuffer.size).toBe(1)
    service.clearPrivateSession()
    expect(privateBuffer.size).toBe(0)
  })
})
