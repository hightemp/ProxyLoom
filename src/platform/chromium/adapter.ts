import { browser } from 'wxt/browser'

import type { RoutingSnapshot } from '../../domain/routing/snapshot'
import { err, ok, type Result } from '../../domain/types/result'
import type { ControlStatus } from '../../domain/types/entities'
import type {
  PlatformApplyError,
  ProxyPlatformAdapter,
} from '../../application/ports/proxy-platform'
import { compilePac } from './pac/compiler'

type LevelOfControl =
  | 'not_controllable'
  | 'controlled_by_other_extensions'
  | 'controllable_by_this_extension'
  | 'controlled_by_this_extension'

const mapControlStatus = (level: LevelOfControl | undefined): ControlStatus => {
  switch (level) {
    case 'controlled_by_this_extension':
      return 'CONTROLLED_BY_THIS_EXTENSION'
    case 'controllable_by_this_extension':
      return 'CONTROLLABLE'
    case 'not_controllable':
      return 'NOT_CONTROLLABLE'
    case 'controlled_by_other_extensions':
      return 'CONTROLLED_BY_OTHER_EXTENSION'
    default:
      return 'NOT_CONTROLLABLE'
  }
}

const apiError = (error: unknown): PlatformApplyError => ({
  code: 'API_ERROR',
  message: error instanceof Error ? error.message : String(error),
})

export class ChromiumProxyAdapter implements ProxyPlatformAdapter {
  readonly capabilities = {
    actualProxyInfo: false,
    fullUrlRules: false,
    guaranteedErrorPage: false,
    platform: 'CHROMIUM',
    tabSpecificOverrides: false,
  } as const

  async getControlStatus(): Promise<ControlStatus> {
    try {
      const settings = await browser.proxy.settings.get({ incognito: false })
      return mapControlStatus(settings.levelOfControl)
    } catch {
      return 'NOT_CONTROLLABLE'
    }
  }

  async applyDirect(revision: number): Promise<Result<number, PlatformApplyError>> {
    const status = await this.getControlStatus()
    if (status !== 'CONTROLLABLE' && status !== 'CONTROLLED_BY_THIS_EXTENSION') {
      return err({ code: 'NOT_CONTROLLABLE', message: status })
    }
    try {
      await browser.proxy.settings.set({
        scope: 'regular',
        value: { mode: 'direct' },
      })
      return ok(revision)
    } catch (error) {
      return err(apiError(error))
    }
  }

  async applySnapshot(snapshot: RoutingSnapshot): Promise<Result<number, PlatformApplyError>> {
    const compiledPac = compilePac(snapshot)
    if (!compiledPac.ok) {
      return err({
        code: 'PAC_COMPILE_ERROR',
        message: compiledPac.error.code,
      })
    }
    const status = await this.getControlStatus()
    if (status !== 'CONTROLLABLE' && status !== 'CONTROLLED_BY_THIS_EXTENSION') {
      return err({ code: 'NOT_CONTROLLABLE', message: status })
    }
    try {
      await browser.proxy.settings.set({
        scope: 'regular',
        value: {
          mode: 'pac_script',
          pacScript: {
            data: compiledPac.value.script,
            mandatory: true,
          },
        },
      })
      return ok(snapshot.revision)
    } catch (error) {
      return err(apiError(error))
    }
  }
}
