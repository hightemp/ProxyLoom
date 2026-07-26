import type { BrowserPlatform } from '../../domain/types/entities'

export type IncognitoHelp = 'CHROMIUM_EXTENSION_DETAILS' | 'FIREFOX_MANAGE_EXTENSION'

export interface IncognitoCapabilityStatus {
  readonly allowed: boolean | null
  readonly help: IncognitoHelp
}

export class IncognitoCapabilityService {
  constructor(private readonly isAllowed: () => Promise<boolean>) {}

  async status(platform: BrowserPlatform): Promise<IncognitoCapabilityStatus> {
    try {
      return {
        allowed: await this.isAllowed(),
        help: platform === 'FIREFOX' ? 'FIREFOX_MANAGE_EXTENSION' : 'CHROMIUM_EXTENSION_DETAILS',
      }
    } catch {
      return {
        allowed: null,
        help: platform === 'FIREFOX' ? 'FIREFOX_MANAGE_EXTENSION' : 'CHROMIUM_EXTENSION_DETAILS',
      }
    }
  }
}
