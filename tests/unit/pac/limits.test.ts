import { describe, expect, it } from 'vitest'

import { compilePac } from '../../../src/platform/chromium/pac/compiler'
import {
  MAX_PAC_BYTES,
  PAC_WARNING_BYTES,
  validatePacSize,
} from '../../../src/platform/chromium/pac/limits'
import { buildRoutingSnapshot } from '../../../src/domain/routing/snapshot'
import { config, rule } from '../domain/fixtures'

describe('PAC size and performance limits', () => {
  it('returns warning and rejection metrics at exact UTF-8 boundaries', () => {
    expect(validatePacSize('a'.repeat(PAC_WARNING_BYTES))).toMatchObject({
      ok: true,
      value: { byteLength: PAC_WARNING_BYTES, warning: 'PAC_APPROACHING_LIMIT' },
    })
    expect(validatePacSize('a'.repeat(MAX_PAC_BYTES + 1))).toMatchObject({
      error: {
        byteLength: MAX_PAC_BYTES + 1,
        code: 'PAC_TOO_LARGE',
        maximumByteLength: MAX_PAC_BYTES,
      },
      ok: false,
    })
  })

  it('compiles a representative 1000-rule snapshot below the release limit', () => {
    const rules = Array.from({ length: 1_000 }, (_, index) =>
      rule(`rule-${String(index)}`, index, {
        pattern: `^https://(?:sub\\.)?host-${String(index)}\\.example(?::8443)?/$`,
      }),
    )
    const snapshot = buildRoutingSnapshot(
      config({ rules }),
      [],
      new Date('2026-01-01T00:00:00.000Z'),
    )
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) {
      return
    }
    const startedAt = performance.now()
    const compiled = compilePac(snapshot.value)
    const durationMs = performance.now() - startedAt

    expect(compiled.ok).toBe(true)
    if (compiled.ok) {
      expect(compiled.value.byteLength).toBeLessThan(PAC_WARNING_BYTES)
    }
    expect(durationMs).toBeLessThan(500)
  })

  it('rejects a worst-case snapshot before the browser API call', () => {
    const rules = Array.from({ length: 1_000 }, (_, index) =>
      rule(`rule-${String(index)}`, index, {
        pattern: `^https://${'a'.repeat(2_000)}-${String(index)}\\.example/$`,
      }),
    )
    const snapshot = buildRoutingSnapshot(
      config({ rules }),
      [],
      new Date('2026-01-01T00:00:00.000Z'),
    )
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) {
      return
    }

    expect(compilePac(snapshot.value)).toMatchObject({
      error: { code: 'PAC_TOO_LARGE' },
      ok: false,
    })
  })
})
