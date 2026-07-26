import { generateShortName, validateProxyProfile } from '../../domain/profiles/profile'
import {
  asIsoTimestamp,
  asProxyProfileId,
  type IdGenerator,
  type ProxyProfileId,
  type RuleId,
} from '../../domain/types/brand'
import type { AppConfig, Clock, ProxyProfile } from '../../domain/types/entities'
import { err, ok, type Result } from '../../domain/types/result'

export type EditableProfile = Omit<
  ProxyProfile,
  'id' | 'createdAt' | 'updatedAt' | 'generatedShortName' | 'lastCheck'
>

export interface ProfileDeleteImpact {
  readonly activeGlobally: boolean
  readonly referringRuleIds: readonly RuleId[]
}

export type ProfileCommandError =
  | { readonly code: 'PROFILE_NOT_FOUND' | 'CONFIRMATION_REQUIRED'; readonly profileId: string }
  | {
      readonly code: 'PROFILE_INVALID'
      readonly field: string
      readonly validationCode: string
    }

const generatedNames = (
  config: AppConfig,
  excludedId: ProxyProfileId | null = null,
): ReadonlySet<string> =>
  new Set(
    config.profiles
      .filter((profile) => profile.id !== excludedId)
      .map((profile) => profile.shortName ?? profile.generatedShortName),
  )

export class ProfileApplicationService {
  constructor(
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  create(
    config: AppConfig,
    input: EditableProfile,
  ): Result<{ config: AppConfig; profile: ProxyProfile }, ProfileCommandError> {
    const timestamp = asIsoTimestamp(this.clock.now().toISOString())
    const draft: ProxyProfile = {
      ...input,
      createdAt: timestamp,
      generatedShortName: generateShortName(input.name, generatedNames(config)),
      id: asProxyProfileId('pending-profile'),
      lastCheck: null,
      updatedAt: timestamp,
    }
    const validated = validateProxyProfile(draft)
    if (!validated.ok) {
      return err({
        code: 'PROFILE_INVALID',
        field: validated.error.field,
        validationCode: validated.error.code,
      })
    }
    const candidate: ProxyProfile = {
      ...draft,
      id: asProxyProfileId(this.ids.next()),
    }
    return ok({
      config: { ...config, profiles: [...config.profiles, candidate] },
      profile: candidate,
    })
  }

  update(
    config: AppConfig,
    profileId: ProxyProfileId,
    input: EditableProfile,
  ): Result<{ config: AppConfig; profile: ProxyProfile }, ProfileCommandError> {
    const current = config.profiles.find((profile) => profile.id === profileId)
    if (current === undefined) {
      return err({ code: 'PROFILE_NOT_FOUND', profileId })
    }
    const candidate: ProxyProfile = {
      ...current,
      ...input,
      generatedShortName: generateShortName(input.name, generatedNames(config, profileId)),
      updatedAt: asIsoTimestamp(this.clock.now().toISOString()),
    }
    const validated = validateProxyProfile(candidate)
    if (!validated.ok) {
      return err({
        code: 'PROFILE_INVALID',
        field: validated.error.field,
        validationCode: validated.error.code,
      })
    }
    return ok({
      config: {
        ...config,
        profiles: config.profiles.map((profile) =>
          profile.id === profileId ? candidate : profile,
        ),
      },
      profile: candidate,
    })
  }

  duplicate(
    config: AppConfig,
    profileId: ProxyProfileId,
  ): Result<{ config: AppConfig; profile: ProxyProfile }, ProfileCommandError> {
    const current = config.profiles.find((profile) => profile.id === profileId)
    if (current === undefined) {
      return err({ code: 'PROFILE_NOT_FOUND', profileId })
    }
    return this.create(config, {
      checkUrl: current.checkUrl,
      color: current.color,
      httpEndpoint: current.httpEndpoint,
      httpsEndpoint: current.httpsEndpoint,
      name: `${current.name} copy`,
      note: current.note,
      shortName: null,
      useSameProxy: current.useSameProxy,
    })
  }

  analyzeDelete(config: AppConfig, profileId: ProxyProfileId): ProfileDeleteImpact {
    return {
      activeGlobally: config.general.activeProxyProfileId === profileId,
      referringRuleIds: config.rules
        .filter((rule) => rule.action.targetProxyProfileId === profileId)
        .map((rule) => rule.id),
    }
  }

  delete(
    config: AppConfig,
    profileId: ProxyProfileId,
    confirmed: boolean,
  ): Result<{ config: AppConfig; impact: ProfileDeleteImpact }, ProfileCommandError> {
    if (!config.profiles.some((profile) => profile.id === profileId)) {
      return err({ code: 'PROFILE_NOT_FOUND', profileId })
    }
    const impact = this.analyzeDelete(config, profileId)
    if ((impact.activeGlobally || impact.referringRuleIds.length > 0) && !confirmed) {
      return err({ code: 'CONFIRMATION_REQUIRED', profileId })
    }
    return ok({
      config: {
        ...config,
        general: {
          ...config.general,
          activeProxyProfileId: impact.activeGlobally ? null : config.general.activeProxyProfileId,
          mode: impact.activeGlobally ? 'DIRECT' : config.general.mode,
        },
        profiles: config.profiles.filter((profile) => profile.id !== profileId),
        rules: config.rules.map((rule) =>
          rule.action.targetProxyProfileId === profileId
            ? { ...rule, validity: 'INVALID_REFERENCE' }
            : rule,
        ),
      },
      impact,
    })
  }
}
