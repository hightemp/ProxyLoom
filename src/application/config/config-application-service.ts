import { buildRoutingSnapshot } from '../../domain/routing/snapshot'
import type { AppConfig, TemporaryOverride } from '../../domain/types/entities'
import { err, type Result } from '../../domain/types/result'
import type { PlatformApplyError, ProxyPlatformAdapter } from '../ports/proxy-platform'

export interface AppliedConfiguration {
  readonly persistedRevision: number
  readonly appliedRevision: number
  readonly snapshotHash: string
}

export class ConfigApplicationService {
  #latestRequestedRevision = -1

  constructor(private readonly adapter: ProxyPlatformAdapter) {}

  async apply(
    config: AppConfig,
    overrides: readonly TemporaryOverride[],
    now: Date,
  ): Promise<Result<AppliedConfiguration, PlatformApplyError>> {
    this.#latestRequestedRevision = Math.max(this.#latestRequestedRevision, config.revision)
    const snapshot = buildRoutingSnapshot(config, overrides, now)
    if (!snapshot.ok) {
      return err({
        code: 'SNAPSHOT_ERROR',
        message: snapshot.error.code,
      })
    }

    const result =
      config.general.mode === 'DIRECT'
        ? await this.adapter.applyDirect(config.revision)
        : await this.adapter.applySnapshot(snapshot.value)
    if (!result.ok) {
      return result
    }
    if (config.revision !== this.#latestRequestedRevision) {
      return err({
        code: 'API_ERROR',
        message: 'A newer configuration superseded this apply result.',
      })
    }
    return {
      ok: true,
      value: {
        appliedRevision: result.value,
        persistedRevision: config.revision,
        snapshotHash: snapshot.value.hash,
      },
    }
  }
}
