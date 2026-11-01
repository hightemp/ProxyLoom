import { describe, expect, it } from 'vitest'

import { RuleApplicationService } from '../../../src/application/rules/rule-service'
import { asRuleId } from '../../../src/domain/types/brand'
import type { Clock } from '../../../src/domain/types/entities'
import { config, rule } from '../domain/fixtures'

const clock: Clock = { now: () => new Date('2026-11-01T00:00:00.000Z') }
const service = new RuleApplicationService({ next: () => 'id' }, clock)
const rules = [rule('a', 0), rule('b', 1), rule('c', 2)]

describe('bulk rule commands', () => {
  it('enables or disables every selected rule in one config change', () => {
    const result = service.setManyEnabled(config({ rules }), [asRuleId('a'), asRuleId('c')], false)
    if (!result.ok) throw new Error(result.error.code)
    expect(result.value.config.rules.map((entry) => entry.enabled)).toEqual([false, true, false])
  })

  it('deletes selected rules and renumbers the remaining global order', () => {
    const result = service.deleteMany(config({ rules }), [asRuleId('a'), asRuleId('b')])
    if (!result.ok) throw new Error(result.error.code)
    expect(result.value.config.rules.map((entry) => [entry.id, entry.position])).toEqual([['c', 0]])
  })

  it('changes nothing when a selected rule is missing', () => {
    const appConfig = config({ rules })
    expect(service.deleteMany(appConfig, [asRuleId('a'), asRuleId('missing')])).toMatchObject({
      error: { code: 'RULE_NOT_FOUND' },
      ok: false,
    })
    expect(service.setManyEnabled(appConfig, [asRuleId('missing')], true)).toMatchObject({
      error: { code: 'RULE_NOT_FOUND' },
      ok: false,
    })
  })
})
