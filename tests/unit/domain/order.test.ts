import { describe, expect, it } from 'vitest'

import { moveRule, sortRules } from '../../../src/domain/rules/order'
import { rule } from './fixtures'

describe('global rule order', () => {
  it('sorts only by global position', () => {
    expect(sortRules([rule('b', 1), rule('a', 0)]).map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('moves and renumbers rules atomically', () => {
    const result = moveRule([rule('a', 0), rule('b', 1), rule('c', 2)], {
      filteredViewActive: false,
      ruleId: rule('c', 2).id,
      toIndex: 0,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.map((item) => [item.id, item.position])).toEqual([
        ['c', 0],
        ['a', 1],
        ['b', 2],
      ])
    }
  })

  it('blocks reorder in a filtered view', () => {
    expect(
      moveRule([rule('a', 0)], {
        filteredViewActive: true,
        ruleId: rule('a', 0).id,
        toIndex: 0,
      }),
    ).toEqual({ error: 'FILTERED_VIEW', ok: false })
  })
})
