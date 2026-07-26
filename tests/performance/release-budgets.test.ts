import { describe, expect, it } from 'vitest'

import { resolveRoute } from '../../src/domain/routing/resolver'
import { buildRoutingSnapshot } from '../../src/domain/routing/snapshot'
import { compilePac } from '../../src/platform/chromium/pac/compiler'
import { config, rule } from '../unit/domain/fixtures'

const percentile95 = (samples: readonly number[]): number => {
  const ordered = [...samples].sort((left, right) => left - right)
  return ordered[Math.ceil(ordered.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY
}

describe('release performance budgets', () => {
  it('resolves a worst-position match among 1000 Origin rules below 100 ms p95', () => {
    const rules = Array.from({ length: 1_000 }, (_, index) =>
      rule(`rule-${String(index)}`, index, {
        pattern:
          index === 999
            ? '^https://target\\.example/$'
            : `^https://miss-${String(index)}\\.example/$`,
      }),
    )
    const now = new Date('2026-01-01T00:00:00.000Z')
    const snapshot = buildRoutingSnapshot(config({ rules }), [], now)
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) return

    for (let warmup = 0; warmup < 10; warmup += 1) {
      resolveRoute(snapshot.value, {
        incognito: false,
        now,
        platform: 'CHROMIUM',
        tabId: 1,
        url: 'https://target.example/',
      })
    }
    const samples = Array.from({ length: 100 }, () => {
      const startedAt = performance.now()
      const decision = resolveRoute(snapshot.value, {
        incognito: false,
        now,
        platform: 'CHROMIUM',
        tabId: 1,
        url: 'https://target.example/',
      })
      expect(decision.matchedRuleId).toBe('rule-999')
      return performance.now() - startedAt
    })
    const p95 = percentile95(samples)
    expect(p95, `resolver p95=${p95.toFixed(2)} ms`).toBeLessThanOrEqual(100)
  })

  it('compiles a representative 1000-rule PAC below the 500 ms implementation budget p95', () => {
    const rules = Array.from({ length: 1_000 }, (_, index) =>
      rule(`rule-${String(index)}`, index, {
        pattern: `^https://host-${String(index)}\\.example/$`,
      }),
    )
    const snapshot = buildRoutingSnapshot(
      config({ rules }),
      [],
      new Date('2026-01-01T00:00:00.000Z'),
    )
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) return

    const samples = Array.from({ length: 20 }, () => {
      const startedAt = performance.now()
      const result = compilePac(snapshot.value)
      expect(result.ok).toBe(true)
      return performance.now() - startedAt
    })
    const p95 = percentile95(samples)
    expect(p95, `PAC compile p95=${p95.toFixed(2)} ms`).toBeLessThanOrEqual(500)
  })
})
