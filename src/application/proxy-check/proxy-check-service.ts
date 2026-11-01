import { asIsoTimestamp } from '../../domain/types/brand'
import type {
  Clock,
  GeneralSettings,
  ProxyCheckResult,
  ProxyProfile,
} from '../../domain/types/entities'
import type { Result } from '../../domain/types/result'
import {
  DEFAULT_SPEED_TEST_ENDPOINT,
  SPEED_TEST_MAX_BYTES,
  SPEED_TEST_MAX_MS,
} from '../../config/defaults'
import type { IpGeoProviderError, IpGeoResult } from './ip-geo-provider'
import { downloadMbps, type SpeedSample, type SpeedTestRequest } from './speed'

export type CheckSettings = Pick<
  GeneralSettings,
  'ipGeoProviderEndpoint' | 'proxyCheckTimeoutMs' | 'geoIpEnabled'
> &
  Partial<Pick<GeneralSettings, 'speedTestEndpoint'>>

export interface ProxyLookupResult extends IpGeoResult {
  /** Present only when a speed test was requested and the check itself succeeded. */
  readonly speed?: SpeedSample
  /** Wall time of the speed phase, excluded from the reported response time. */
  readonly speedPhaseMs?: number
}

export interface ProxyCheckRequestPort {
  lookup(
    profile: ProxyProfile,
    settings: CheckSettings,
    signal: AbortSignal,
    speed: SpeedTestRequest | null,
  ): Promise<Result<ProxyLookupResult, IpGeoProviderError>>
}

export interface ProxyCheckOptions {
  /** Also download a test file through the profile (Test speed). */
  readonly measureSpeed?: boolean
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
    settings: CheckSettings,
    options: ProxyCheckOptions = {},
  ): Promise<Result<ProxyCheckResult, ProxyCheckServiceError>> {
    if (this.#controller !== null) {
      return { error: { code: 'CHECK_ALREADY_RUNNING' }, ok: false }
    }
    const controller = new AbortController()
    this.#controller = controller
    const startedAt = performance.now()
    try {
      const speedRequest: SpeedTestRequest | null =
        options.measureSpeed === true
          ? {
              endpoint: settings.speedTestEndpoint ?? DEFAULT_SPEED_TEST_ENDPOINT,
              maxBytes: SPEED_TEST_MAX_BYTES,
              maxMs: SPEED_TEST_MAX_MS,
            }
          : null
      const result = await this.request.lookup(profile, settings, controller.signal, speedRequest)
      if (controller.signal.aborted) {
        return { error: { code: 'CHECK_CANCELLED' }, ok: false }
      }
      const duration = Math.max(
        0,
        performance.now() - startedAt - (result.ok ? (result.value.speedPhaseMs ?? 0) : 0),
      )
      return {
        ok: true,
        value: result.ok
          ? {
              availability: true,
              checkedAt: asIsoTimestamp(this.clock.now().toISOString()),
              connectDurationMs: null,
              country: result.value.country,
              downloadMbps:
                result.value.speed?.ok === true
                  ? downloadMbps(result.value.speed.bytes, result.value.speed.durationMs)
                  : null,
              errorCode: null,
              externalIp: result.value.externalIp,
              httpStatus: result.value.httpStatus,
              speedErrorCode: result.value.speed?.ok === false ? result.value.speed.code : null,
              totalDurationMs: duration,
            }
          : {
              availability: false,
              checkedAt: asIsoTimestamp(this.clock.now().toISOString()),
              connectDurationMs: null,
              country: null,
              downloadMbps: null,
              errorCode: result.error.code,
              externalIp: null,
              httpStatus: result.error.httpStatus,
              speedErrorCode: null,
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
