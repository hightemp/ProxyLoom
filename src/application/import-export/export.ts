import type { AppConfig, ProxyEndpoint, ProxyProfile } from '../../domain/types/entities'
import {
  NATIVE_EXPORT_FORMAT,
  NATIVE_EXPORT_FORMAT_VERSION,
} from '../../domain/import-export/native-schema'

export interface NativeExportOptions {
  readonly includeCredentials: boolean
  readonly now: Date
}

type ExportEndpoint = Omit<ProxyEndpoint, 'username' | 'password'> & {
  readonly username?: string
  readonly password?: string
}

type ExportProfile = Omit<ProxyProfile, 'httpEndpoint' | 'httpsEndpoint'> & {
  readonly httpEndpoint: ExportEndpoint
  readonly httpsEndpoint: ExportEndpoint
}

const exportEndpoint = (endpoint: ProxyEndpoint, includeCredentials: boolean): ExportEndpoint => {
  const common = {
    host: endpoint.host,
    port: endpoint.port,
    transport: endpoint.transport,
  }
  return includeCredentials
    ? {
        ...common,
        password: endpoint.password,
        username: endpoint.username,
      }
    : common
}

const exportProfile = (profile: ProxyProfile, includeCredentials: boolean): ExportProfile => ({
  ...profile,
  httpEndpoint: exportEndpoint(profile.httpEndpoint, includeCredentials),
  httpsEndpoint: exportEndpoint(profile.httpsEndpoint, includeCredentials),
})

export const serializeNativeExport = (config: AppConfig, options: NativeExportOptions): string =>
  JSON.stringify(
    {
      config: {
        ...config,
        profiles: config.profiles.map((profile) =>
          exportProfile(profile, options.includeCredentials),
        ),
      },
      exportedAt: options.now.toISOString(),
      format: NATIVE_EXPORT_FORMAT,
      formatVersion: NATIVE_EXPORT_FORMAT_VERSION,
      includesCredentials: options.includeCredentials,
    },
    null,
    2,
  )

export const nativeExportFilename = (now: Date): string =>
  `proxyloom-${now.toISOString().slice(0, 10)}.json`
