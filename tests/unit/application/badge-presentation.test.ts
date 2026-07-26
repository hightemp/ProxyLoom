import { describe, expect, it } from 'vitest'

import { buildBadgePresentation } from '../../../src/application/inspection/badge-presentation'
import type { TabInspection } from '../../../src/application/inspection/current-tab-inspection'
import { asProxyProfileId } from '../../../src/domain/types/brand'
import type { AppConfig } from '../../../src/domain/types/entities'
import { config as createConfig, profile as createProfile } from '../domain/fixtures'

const inspection = (
  action: 'DIRECT' | 'PROXY' | 'CONFIG_ERROR',
  profileId: string | null = null,
): TabInspection => ({
  controlStatus: 'CONTROLLED_BY_THIS_EXTENSION',
  decision: {
    action,
    endpoint: null,
    errorCode: action === 'CONFIG_ERROR' ? 'INVALID_REFERENCE' : null,
    matchedOverrideId: null,
    matchedRuleId: null,
    normalizedTarget: 'https://example.com/',
    profileId: profileId === null ? null : asProxyProfileId(profileId),
    source: 'FALLBACK',
    targetScheme: 'https',
    trace: [],
  },
  hostname: 'example.com',
  platform: 'CHROMIUM',
  scopeWarning: null,
  supported: true,
})

const withMode = (mode: AppConfig['general']['mode']): AppConfig => {
  const value = createConfig()
  const profile = createProfile('PRX', { shortName: 'PX' })
  return {
    ...value,
    general: {
      ...value.general,
      activeProxyProfileId: mode === 'PROXY' ? profile.id : null,
      mode,
    },
    profiles: [profile],
  }
}

describe('badge presentation', () => {
  it('uses the exact global mode labels and neutral direct color', () => {
    expect(buildBadgePresentation(withMode('DIRECT'), inspection('DIRECT'), false)).toEqual({
      backgroundColor: '#64748b',
      text: 'D',
      titleCode: 'DIRECT',
      titleDetail: null,
    })
    expect(buildBadgePresentation(withMode('RULES'), inspection('DIRECT'), false)).toEqual({
      backgroundColor: '#64748b',
      text: 'R',
      titleCode: 'RULES_DIRECT',
      titleDetail: null,
    })
  })

  it('uses a profile short name/color in PROXY and profile color in RULES', () => {
    const proxyConfig = withMode('PROXY')
    const profile = proxyConfig.profiles[0]
    if (profile === undefined) throw new Error('Profile fixture missing')
    expect(buildBadgePresentation(proxyConfig, inspection('PROXY', profile.id), false)).toEqual({
      backgroundColor: profile.color,
      text: profile.shortName ?? profile.generatedShortName,
      titleCode: 'GLOBAL_PROXY',
      titleDetail: profile.name,
    })

    expect(
      buildBadgePresentation(
        { ...proxyConfig, general: { ...proxyConfig.general, mode: 'RULES' } },
        inspection('PROXY', profile.id),
        false,
      ),
    ).toMatchObject({ backgroundColor: profile.color, text: 'R' })
  })

  it('gives proxy failures and configuration errors precedence', () => {
    expect(buildBadgePresentation(withMode('RULES'), inspection('DIRECT'), true)).toMatchObject({
      text: '!',
      titleCode: 'PROXY_CONNECTION_FAILED',
    })
    expect(
      buildBadgePresentation(withMode('RULES'), inspection('CONFIG_ERROR'), false),
    ).toMatchObject({ text: '!' })
  })
})
