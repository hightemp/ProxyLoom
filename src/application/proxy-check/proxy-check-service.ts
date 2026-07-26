import { asIsoTimestamp } from '../../domain/types/brand'
import type {
  Clock,
  GeneralSettings,
  ProxyCheckResult,
  ProxyProfile,
} from '../../domain/types/entities'
import type { Result } from '../../domain/types/result'
import type { IpGeoProviderError, IpGeoResult } from './ip-geo-provider'

export interface ProxyCheckRequestPort {
  lookup(
    profile: ProxyProfile,
    settings: Pick<
      GeneralSettings,
      'ipGeoProviderEndpoint' | 'proxyCheckTimeoutMs' | 'geoIpEnabled'
    >,
    signal: AbortSignal,
  ): Promise<Result<IpGeoResult, IpGeoProviderError>>
}

export type ProxyCheckServiceError =
  { readonly code: 'CHECK_ALREADY_RUNNING' } | { readonly code: 'CHECK_CANCELLED' }

export class ProxyCheckService {
  #controller: AbortController | null = null

  constructor(
    private readonly request: ProxyCheckRequestPort,
    private readonly clock: Clock,
  ) {}

  async check(
    profile: ProxyProfile,
    settings: Pick<
      GeneralSettings,
      'ipGeoProviderEndpoint' | 'proxyCheckTimeoutMs' | 'geoIpEnabled'
    >,
  ): Promise<Result<ProxyCheckResult, ProxyCheckServiceError>> {
    if (this.#controller !== null) {
      return { error: { code: 'CHECK_ALREADY_RUNNING' }, ok: false }
    }
    const controller = new AbortController()
    this.#controller = controller
    const startedAt = performance.now()
    try {
      const result = await this.request.lookup(profile, settings, controller.signal)
      if (controller.signal.aborted) {
        return { error: { code: 'CHECK_CANCELLED' }, ok: false }
      }
      const duration = Math.max(0, performance.now() - startedAt)
      return {
        ok: true,
        value: result.ok
          ? {
              availability: true,
              checkedAt: asIsoTimestamp(this.clock.now().toISOString()),
              connectDurationMs: null,
              country: result.value.country,
              errorCode: null,
              externalIp: result.value.externalIp,
              httpStatus: result.value.httpStatus,
              totalDurationMs: duration,
            }
          : {
              availability: false,
              checkedAt: asIsoTimestamp(this.clock.now().toISOString()),
              connectDurationMs: null,
              country: null,
              errorCode: result.error.code,
              externalIp: null,
              httpStatus: result.error.httpStatus,
              totalDurationMs: duration,
            },
      }
    } finally {
      if (this.#controller === controller) {
        this.#controller = null
      }
    }
  }

  cancel(): void {
    this.#controller?.abort()
  }

  get running(): boolean {
    return this.#controller !== null
  }
}
