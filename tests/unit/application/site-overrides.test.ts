import { describe, expect, it } from 'vitest'

import { overridesForSite } from '../../../src/application/overrides/site-overrides'
import { override } from '../domain/fixtures'

describe('overrides for the current site', () => {
  const exact = override({ id: 'exact' as never, originKey: 'www.example.com' })
  const domain = override({
    id: 'domain' as never,
    originKey: 'example.com',
    scope: 'REGISTRABLE_DOMAIN',
  })
  const other = override({ id: 'other' as never, originKey: 'example.org' })
  const lookalike = override({
    id: 'lookalike' as never,
    originKey: 'ample.com',
    scope: 'REGISTRABLE_DOMAIN',
  })

  it('includes exact matches and registrable-domain overrides that cover the hostname', () => {
    expect(
      overridesForSite([exact, domain, other, lookalike], 'www.example.com').map(
        (entry) => entry.id,
      ),
    ).toEqual(['exact', 'domain'])
  })

  it('matches hostnames case-insensitively and ignores a trailing dot', () => {
    expect(overridesForSite([exact], 'WWW.Example.com.').map((entry) => entry.id)).toEqual([
      'exact',
    ])
  })

  it('does not treat an exact-hostname override as covering subdomains', () => {
    expect(overridesForSite([exact], 'a.www.example.com')).toEqual([])
  })
})
