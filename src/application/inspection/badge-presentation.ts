import type { TabInspection } from './current-tab-inspection'
import type { AppConfig } from '../../domain/types/entities'

export interface BadgePresentation {
  readonly backgroundColor: string
  readonly text: string
  readonly titleCode:
    | 'PROXY_CONNECTION_FAILED'
    | 'DIRECT'
    | 'CONFIGURATION_ERROR'
    | 'GLOBAL_PROXY_MISSING'
    | 'GLOBAL_PROXY'
    | 'RULES_DIRECT'
    | 'RULES_PROXY'
  readonly titleDetail: string | null
}

const NEUTRAL_COLOR = '#64748b'
const ERROR_COLOR = '#b91c1c'

export const buildBadgePresentation = (
  config: AppConfig,
  inspection: TabInspection | null,
  hasProxyError: boolean,
): BadgePresentation => {
  if (hasProxyError) {
    return {
      backgroundColor: ERROR_COLOR,
      text: '!',
      titleCode: 'PROXY_CONNECTION_FAILED',
      titleDetail: null,
    }
  }

  if (config.general.mode === 'DIRECT') {
    return {
      backgroundColor: NEUTRAL_COLOR,
      text: 'D',
      titleCode: 'DIRECT',
      titleDetail: null,
    }
  }

  const decision = inspection?.supported === true ? inspection.decision : null
  if (decision?.action === 'CONFIG_ERROR') {
    return {
      backgroundColor: ERROR_COLOR,
      text: '!',
      titleCode: 'CONFIGURATION_ERROR',
      titleDetail: decision.errorCode,
    }
  }

  const profile =
    decision?.action === 'PROXY'
      ? config.profiles.find((candidate) => candidate.id === decision.profileId)
      : config.general.mode === 'PROXY'
        ? config.profiles.find((candidate) => candidate.id === config.general.activeProxyProfileId)
        : undefined

  if (config.general.mode === 'PROXY') {
    return profile === undefined
      ? {
          backgroundColor: ERROR_COLOR,
          text: '!',
          titleCode: 'GLOBAL_PROXY_MISSING',
          titleDetail: null,
        }
      : {
          backgroundColor: profile.color,
          text: profile.shortName ?? profile.generatedShortName,
          titleCode: 'GLOBAL_PROXY',
          titleDetail: profile.name,
        }
  }

  return {
    backgroundColor: profile?.color ?? NEUTRAL_COLOR,
    text: 'R',
    titleCode: profile === undefined ? 'RULES_DIRECT' : 'RULES_PROXY',
    titleDetail: profile?.name ?? null,
  }
}
