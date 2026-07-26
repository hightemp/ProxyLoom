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
    const repository = new SessionRepository(new MemoryStorageArea())
    await repository.setTransientState({
      authAttempts: { request: 1 },
      proxyCheckRecoveryRevision: 2,
    })
    expect(await repository.getTransientState()).toEqual({
      authAttempts: { request: 1 },
      proxyCheckRecoveryRevision: 2,
    })
    await repository.clear()
    expect(await repository.getOverrides()).toEqual([])
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
      }),
    )

    expect(await repository.getOverrides()).toEqual([])
    expect(await repository.getRuleDisables()).toEqual([])
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

    const first = await repository.reconcile(
      new Set([7]),
      new Date('2026-01-01T00:00:00.000Z'),
      true,
    )
    const second = await repository.reconcile(
      new Set([7]),
      new Date('2026-01-01T00:00:00.000Z'),
      true,
    )

    expect(first.overrides.map((entry) => entry.sourceTabId)).toEqual([7])
    expect(first.disables.map((entry) => entry.ruleId)).toEqual(['future'])
    expect(second).toEqual(first)
  })
})
