import { describe, expect, it } from 'vitest'

import { testRouting } from '../../../src/application/routing-tester/routing-tester'
import { buildRoutingSnapshot } from '../../../src/domain/routing/snapshot'
import { config, rule } from '../domain/fixtures'

describe('routing tester presenter', () => {
  it('reuses resolver output and adds entity labels', () => {
    const value = config({
      rules: [
        rule('disabled', 0, { enabled: false, name: 'Disabled rule' }),
        rule('selected', 1, { name: 'Selected rule' }),
      ],
    })
    const snapshot = buildRoutingSnapshot(value, [], new Date('2026-01-01T00:00:00.000Z'))
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) {
      return
    }

    expect(
      testRouting(snapshot.value, {
        incognito: false,
        now: new Date('2026-01-01T00:00:00.000Z'),
        platform: 'CHROMIUM',
        tabId: 1,
        url: 'https://example.com/path?secret=value',
      }),
    ).toMatchObject({
      action: 'DIRECT',
      matchedRuleId: 'selected',
      normalizedTarget: 'https://example.com/',
      source: 'RULE',
      trace: [
        { ruleName: 'Disabled rule', status: 'DISABLED' },
        { ruleName: 'Selected rule', status: 'MATCHED' },
      ],
    })
  })
})
