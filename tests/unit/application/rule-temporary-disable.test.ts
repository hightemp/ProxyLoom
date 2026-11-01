import { describe, expect, it } from 'vitest'

import { RuleDisableService } from '../../../src/application/rules/rule-disable-service'
import { resolveRoute } from '../../../src/domain/routing/resolver'
import { buildRoutingSnapshot } from '../../../src/domain/routing/snapshot'
import { applyRuleDisables } from '../../../src/domain/rules/temporary-disable'
import { asIsoTimestamp, asRuleId } from '../../../src/domain/types/brand'
import type { Clock } from '../../../src/domain/types/entities'
import { buildPacProgramIR } from '../../../src/platform/chromium/pac/ir'
import { MemoryStorageArea } from '../../../src/storage/config/storage-area'
import { SessionRepository } from '../../../src/storage/session/session-repository'
import { config, profile, rule } from '../domain/fixtures'

const now = new Date('2026-11-01T10:00:00.000Z')
const clock: Clock = { now: () => now }
const office = profile('office', { useSameProxy: true })
const viaOffice = rule('work', 0, {
  action: { targetProxyProfileId: office.id, type: 'PROXY' },
  pattern: '^https://work\\.example/$',
})
const appConfig = config({
  general: { ...config().general, mode: 'RULES' },
  profiles: [office],
  rules: [viaOffice, rule('other', 1)],
})

const setup = () => {
  const session = new SessionRepository(new MemoryStorageArea())
  return { service: new RuleDisableService(session, clock), session }
}

describe('temporary rule disable service', () => {
  it.each([
    ['MINUTES_5', '2026-11-01T10:05:00.000Z'],
    ['MINUTES_15', '2026-11-01T10:15:00.000Z'],
    ['HOUR_1', '2026-11-01T11:00:00.000Z'],
  ] as const)('disables a rule for %s', async (duration, until) => {
    const { service, session } = setup()
    expect(await service.set(appConfig, viaOffice.id, duration)).toEqual({
      ok: true,
      value: { kind: 'UNTIL', until },
    })
    expect(await session.getRuleDisables()).toEqual([
      { ruleId: viaOffice.id, state: { kind: 'UNTIL', until } },
    ])
  })

  it('disables until restart, replaces an earlier choice and clears on request', async () => {
    const { service, session } = setup()
    await service.set(appConfig, viaOffice.id, 'MINUTES_5')
    await service.set(appConfig, viaOffice.id, 'UNTIL_RESTART')
    expect(await session.getRuleDisables()).toEqual([
      { ruleId: viaOffice.id, state: { kind: 'UNTIL_RESTART', until: null } },
    ])
    await service.clear(appConfig, viaOffice.id)
    expect(await session.getRuleDisables()).toEqual([])
  })

  it('rejects unknown rules and prunes records of deleted rules', async () => {
    const { service, session } = setup()
    await session.setRuleDisables([
      { ruleId: asRuleId('deleted'), state: { kind: 'UNTIL_RESTART', until: null } },
    ])
    expect(await service.set(appConfig, asRuleId('missing'), 'MINUTES_5')).toEqual({
      error: { code: 'RULE_NOT_FOUND', ruleId: 'missing' },
      ok: false,
    })
    await service.set(appConfig, viaOffice.id, 'MINUTES_5')
    expect((await session.getRuleDisables()).map((record) => record.ruleId)).toEqual([viaOffice.id])
  })
})

describe('applying session disables to routing', () => {
  it('overlays session records and ignores any persisted value', () => {
    const persisted = config({
      rules: [
        { ...viaOffice, temporaryDisable: { kind: 'UNTIL_RESTART', until: null } },
        rule('other', 1),
      ],
    })
    const overlaid = applyRuleDisables(persisted, [
      { ruleId: asRuleId('other'), state: { kind: 'UNTIL_RESTART', until: null } },
      { ruleId: asRuleId('gone'), state: { kind: 'UNTIL_RESTART', until: null } },
    ])
    expect(overlaid.rules.map((entry) => entry.temporaryDisable)).toEqual([
      null,
      { kind: 'UNTIL_RESTART', until: null },
    ])
    expect(overlaid.rules[0]?.enabled).toBe(true)
  })

  it('skips a temporarily disabled rule in both the resolver and the PAC program', () => {
    const overlaid = applyRuleDisables(appConfig, [
      {
        ruleId: viaOffice.id,
        state: { kind: 'UNTIL', until: asIsoTimestamp('2026-11-01T10:05:00.000Z') },
      },
    ])
    const snapshot = buildRoutingSnapshot(overlaid, [], now)
    if (!snapshot.ok) throw new Error(snapshot.error.code)
    const decision = resolveRoute(snapshot.value, {
      incognito: false,
      now,
      platform: 'CHROMIUM',
      tabId: 1,
      url: 'https://work.example/',
    })
    expect(decision).toMatchObject({ action: 'DIRECT', source: 'FALLBACK' })
    expect(decision.trace[0]).toEqual({ ruleId: viaOffice.id, status: 'TEMPORARILY_DISABLED' })
    const pac = buildPacProgramIR(snapshot.value)
    if (!pac.ok) throw new Error(pac.error.code)
    expect(pac.value.rules.map((entry) => entry.pattern)).not.toContain(viaOffice.pattern)

    const expired = buildRoutingSnapshot(overlaid, [], new Date('2026-11-01T10:06:00.000Z'))
    if (!expired.ok) throw new Error(expired.error.code)
    const pacAfter = buildPacProgramIR(expired.value)
    if (!pacAfter.ok) throw new Error(pacAfter.error.code)
    expect(pacAfter.value.rules.map((entry) => entry.pattern)).toContain(viaOffice.pattern)
  })
})
