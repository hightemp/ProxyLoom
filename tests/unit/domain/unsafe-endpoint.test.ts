import { describe, expect, it } from 'vitest'

import { serializeNativeExport } from '../../../src/application/import-export/export'
import { NativeImportService } from '../../../src/application/import-export/import'
import { buildRoutingSnapshot } from '../../../src/domain/routing/snapshot'
import { config, endpoint, profile, rule } from './fixtures'

// Host strings that would change the meaning of a PAC directive or a ProxyInfo if they reached a
// browser: a second entry, a DIRECT fallback, userinfo (stock Chromium turns it into DIRECT), etc.
const HOSTILE_HOSTS = [
  '127.0.0.1:1; DIRECT',
  '127.0.0.1;DIRECT',
  'user:pass@127.0.0.1',
  '127.0.0.1 8080',
  'proxy.example\nDIRECT',
  '127.0.0.1:8080',
  '"; return "DIRECT',
]

const now = new Date('2026-01-01T12:00:00.000Z')

describe('unsafe proxy endpoints never reach routing (PL-168)', () => {
  it.each(HOSTILE_HOSTS)('rejects native import with host %j', (host) => {
    const document = JSON.parse(
      serializeNativeExport(config({ profiles: [profile('safe')] }), {
        includeCredentials: false,
        now,
      }),
    ) as { config: { profiles: { httpEndpoint: { host: string } }[] } }
    const [first] = document.config.profiles
    if (first === undefined) throw new Error('fixture profile missing')
    first.httpEndpoint.host = host

    const preview = new NativeImportService({ next: () => 'id' }).preview(
      JSON.stringify(document),
      config(),
    )

    expect(preview.ok).toBe(false)
  })

  it.each(HOSTILE_HOSTS)('refuses to build a routing snapshot for stored host %j', (host) => {
    const unsafe = profile('unsafe', { httpEndpoint: endpoint(host, 8080) })
    const snapshot = buildRoutingSnapshot(
      config({
        profiles: [unsafe],
        rules: [rule('r', 0, { action: { targetProxyProfileId: unsafe.id, type: 'PROXY' } })],
      }),
      [],
      now,
    )

    expect(snapshot).toEqual({
      error: { code: 'PROFILE_INVALID', profileId: unsafe.id },
      ok: false,
    })
  })

  it('still builds snapshots for valid IPv4, IPv6 and host names', () => {
    const snapshot = buildRoutingSnapshot(
      config({
        profiles: [
          profile('v4', { httpEndpoint: endpoint('192.0.2.1', 3128) }),
          profile('v6', { httpEndpoint: endpoint('[2001:db8::1]', 3128) }),
          profile('name', { httpEndpoint: endpoint('proxy.example', 3128) }),
        ],
      }),
      [],
      now,
    )
    expect(snapshot.ok).toBe(true)
  })
})

describe('profile host whitespace (PL-168)', () => {
  it('stores a trimmed host instead of a padded one that would break the PAC directive', async () => {
    const { ProfileApplicationService } =
      await import('../../../src/application/profiles/profile-service')
    const service = new ProfileApplicationService({ next: () => 'trimmed' }, { now: () => now })
    const base = profile('input')
    const created = service.create(config(), {
      checkUrl: base.checkUrl,
      color: base.color,
      httpEndpoint: endpoint('  proxy.example  ', 3128),
      httpsEndpoint: endpoint('\tsecure.example ', 8443, 'HTTPS'),
      name: 'Padded',
      note: '',
      shortName: null,
      useSameProxy: false,
    })
    if (!created.ok) throw new Error(created.error.code)
    expect(created.value.profile.httpEndpoint.host).toBe('proxy.example')
    expect(created.value.profile.httpsEndpoint.host).toBe('secure.example')
  })
})
