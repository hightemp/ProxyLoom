import { describe, expect, it } from 'vitest'

import { asIsoTimestamp, asRuleId, asTemporaryOverrideId } from '../../../src/domain/types/brand'
import { MemoryStorageArea } from '../../../src/storage/config/storage-area'
import { SessionRepository } from '../../../src/storage/session/session-repository'
import { override } from '../domain/fixtures'

describe('session repository', () => {
  it('stores overrides and temporary disables outside persistent config', async () => {
    const repository = new SessionRepository(new MemoryStorageArea())
    await repository.setOverrides([override()])
    await repository.setRuleDisables([
      {
        ruleId: asRuleId('rule-1'),
        state: { kind: 'UNTIL_RESTART', until: null },
      },
    ])
    expect(await repository.getOverrides()).toHaveLength(1)
    expect(await repository.getRuleDisables()).toEqual([
      {
        ruleId: 'rule-1',
        state: { kind: 'UNTIL_RESTART', until: null },
      },
    ])
  })

  it('stores transient recovery state without credentials', async () => {
    const storage = new MemoryStorageArea()
    const repository = new SessionRepository(storage)
    await repository.setTransientState({
      authAttempts: { request: 1 },
      proxyCheckRecoveryRevision: 2,
    })
    expect(await repository.getTransientState()).toEqual({
      authAttempts: { request: 1 },
      proxyCheckRecoveryRevision: 2,
    })
    await repository.setErrorContexts([
      {
        context: {
          hostname: 'example.com',
          incognito: false,
          occurredAt: '2026-01-01T00:00:00.000Z',
          platform: 'CHROMIUM',
          profileId: null,
          profileName: null,
          requestId: 'request-1',
          ruleId: null,
          ruleName: null,
          tabId: 7,
          technicalCode: 'net::ERR_PROXY_CONNECTION_FAILED',
          token: 'token-1',
        },
        expiresAt: Date.parse('2026-01-01T00:05:00.000Z'),
        originalUrl: 'https://example.com/private/path?token=one-time',
      },
    ])
    expect(await repository.getErrorContexts()).toHaveLength(1)
    expect(await storage.get(['session.error-contexts'])).toMatchObject({
      'session.error-contexts': { schemaVersion: 1 },
    })
    await repository.clear()
    expect(await repository.getOverrides()).toEqual([])
    expect(await repository.getErrorContexts()).toEqual([])
    expect(await repository.getTransientState()).toEqual({
      authAttempts: {},
      proxyCheckRecoveryRevision: null,
    })
  })

  it('treats malformed session payloads as empty rather than activating stale state', async () => {
    const repository = new SessionRepository(
      new MemoryStorageArea({
        'session.overrides': [{ sourceTabId: 'not-a-tab' }],
        'session.rule-disables': [{ state: { kind: 'UNTIL', until: 'not-a-date' } }],
        'session.error-contexts': { contexts: [], schemaVersion: 99 },
      }),
    )

    expect(await repository.getOverrides()).toEqual([])
    expect(await repository.getRuleDisables()).toEqual([])
    expect(await repository.getErrorContexts()).toEqual([])
  })

  it('reconciles closed tabs, restart-only state, and expired disables idempotently', async () => {
    const repository = new SessionRepository(new MemoryStorageArea())
    await repository.setOverrides([
      override({ sourceTabId: 7 }),
      override({ id: asTemporaryOverrideId('override-2'), sourceTabId: 8 }),
    ])
    await repository.setRuleDisables([
      {
        ruleId: asRuleId('restart'),
        state: { kind: 'UNTIL_RESTART', until: null },
      },
      {
        ruleId: asRuleId('expired'),
        state: {
          kind: 'UNTIL',
          until: asIsoTimestamp('2025-01-01T00:00:00.000Z'),
        },
      },
      {
        ruleId: asRuleId('future'),
        state: {
          kind: 'UNTIL',
          until: asIsoTimestamp('2027-01-01T00:00:00.000Z'),
        },
      },
    ])
    await repository.setErrorContexts([
      {
        context: {
          hostname: 'live.example',
          incognito: false,
          occurredAt: '2026-01-01T00:00:00.000Z',
          platform: 'CHROMIUM',
          profileId: null,
          profileName: null,
          requestId: 'live',
          ruleId: null,
          ruleName: null,
          tabId: 7,
          technicalCode: 'FAILED',
          token: 'live',
        },
        expiresAt: Date.parse('2027-01-01T00:00:00.000Z'),
        originalUrl: 'https://live.example/path',
      },
    ])

    const first = await repository.reconcileRouting(
      new Set([7, 8]),
      new Set([7]),
      new Date('2026-01-01T00:00:00.000Z'),
      true,
    )
    await repository.reconcileErrorContexts(
      new Set([7]),
      new Date('2026-01-01T00:00:00.000Z'),
      true,
    )
    const second = await repository.reconcileRouting(
      new Set([7]),
      new Set([7]),
      new Date('2026-01-01T00:00:00.000Z'),
      true,
    )

    expect(first.overrides.map((entry) => entry.sourceTabId)).toEqual([7])
    expect(first.disables.map((entry) => entry.ruleId)).toEqual(['future'])
    expect(second).toEqual(first)
    expect(await repository.getErrorContexts()).toEqual([])
  })

  it('does not delete an override added after the owner-tab inventory snapshot', async () => {
    const repository = new SessionRepository(new MemoryStorageArea())
    await repository.setOverrides([
      override({ sourceTabId: 7 }),
      override({ id: asTemporaryOverrideId('concurrent'), sourceTabId: 9 }),
    ])

    const result = await repository.reconcileRouting(
      new Set([7]),
      new Set(),
      new Date('2026-01-01T00:00:00.000Z'),
      false,
    )

    expect(result.overrides.map((entry) => entry.sourceTabId)).toEqual([9])
  })

  it('retains only live, unexpired error contexts during the same browser session', async () => {
    const repository = new SessionRepository(new MemoryStorageArea())
    const stored = (token: string, tabId: number, expiresAt: string) => ({
      context: {
        hostname: `${token}.example`,
        incognito: false,
        occurredAt: '2026-01-01T00:00:00.000Z',
        platform: 'CHROMIUM' as const,
        profileId: null,
        profileName: null,
        requestId: token,
        ruleId: null,
        ruleName: null,
        tabId,
        technicalCode: 'FAILED',
        token,
      },
      expiresAt: Date.parse(expiresAt),
      originalUrl: `https://${token}.example/path`,
    })
    await repository.setErrorContexts([
      stored('live', 7, '2027-01-01T00:00:00.000Z'),
      stored('closed', 8, '2027-01-01T00:00:00.000Z'),
      stored('expired', 7, '2025-01-01T00:00:00.000Z'),
    ])

    await repository.reconcileErrorContexts(
      new Set([7]),
      new Date('2026-01-01T00:00:00.000Z'),
      false,
    )

    expect((await repository.getErrorContexts()).map(({ context }) => context.token)).toEqual([
      'live',
    ])
  })
})
