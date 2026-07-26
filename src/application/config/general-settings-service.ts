import type {
  AppConfig,
  AppearanceSettings,
  GeneralSettings,
  GlobalMode,
} from '../../domain/types/entities'
import type { ProxyProfileId } from '../../domain/types/brand'
import { err, ok, type Result } from '../../domain/types/result'

export type GeneralSettingsError =
  | { readonly code: 'ACTIVE_PROFILE_REQUIRED' }
  | { readonly code: 'PROFILE_NOT_FOUND'; readonly profileId: string }

export class GeneralSettingsService {
  setMode(config: AppConfig, mode: GlobalMode): Result<AppConfig, GeneralSettingsError> {
    if (mode === 'PROXY' && config.general.activeProxyProfileId === null) {
      return err({ code: 'ACTIVE_PROFILE_REQUIRED' })
    }
    return ok({ ...config, general: { ...config.general, mode } })
  }

  useProfileGlobally(
    config: AppConfig,
    profileId: ProxyProfileId,
  ): Result<AppConfig, GeneralSettingsError> {
    if (!config.profiles.some((profile) => profile.id === profileId)) {
      return err({ code: 'PROFILE_NOT_FOUND', profileId })
    }
    return ok({
      ...config,
      general: {
        ...config.general,
        activeProxyProfileId: profileId,
        mode: 'PROXY',
      },
    })
  }

  updateGeneral(config: AppConfig, settings: GeneralSettings): AppConfig {
    return { ...config, general: settings }
  }

  updateAppearance(config: AppConfig, appearance: AppearanceSettings): AppConfig {
    return { ...config, appearance }
  }
}
