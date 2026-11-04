import { z } from 'zod'

import type { AppConfig } from '../types/entities'
import { err, ok, type Result } from '../types/result'
import { addAppearanceAccentFromVersionThree } from '../config/accent-migration'
import { addSpeedTestFromVersionFour } from '../config/speed-migration'
import { addSocks5TransportFromVersionFive } from '../config/socks5-migration'
import { parseAppConfig } from '../config/schema'
import { isValidProxyHost } from '../profiles/profile'
import {
  removeGroupsFromVersionOne,
  upgradeLegacyExamplesFromVersionTwo,
} from '../config/remove-groups-migration'
import { parseSafeJson, type SafeJsonErrorCode } from './safe-json'

export const NATIVE_EXPORT_FORMAT = 'proxyloom-config'
export const NATIVE_EXPORT_FORMAT_VERSION = 1
export { MAX_IMPORT_BYTES, MAX_IMPORT_DEPTH } from './safe-json'

const endpointSchema = z
  .object({
    host: z.string().min(1).max(253).refine(isValidProxyHost),
    password: z.string().max(4_096).optional(),
    port: z.number().int().min(1).max(65_535),
    transport: z.enum(['HTTP', 'HTTPS', 'SOCKS5']),
    username: z.string().max(1_024).optional(),
  })
  .strict()

const exportProfileSchema = z
  .object({
    checkUrl: z.string().url().max(2_048),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    createdAt: z.string().min(20).max(64),
    generatedShortName: z.string().min(1).max(3),
    httpEndpoint: endpointSchema,
    httpsEndpoint: endpointSchema,
    id: z.string().min(1).max(128),
    lastCheck: z
      .object({
        availability: z.boolean(),
        checkedAt: z.string().min(20).max(64),
        connectDurationMs: z.number().nonnegative().nullable(),
        country: z.string().max(128).nullable(),
        downloadMbps: z.number().nonnegative().max(1_000_000).nullable().optional(),
        errorCode: z.string().max(256).nullable(),
        externalIp: z.string().max(64).nullable(),
        httpStatus: z.number().int().min(100).max(599).nullable(),
        speedErrorCode: z.string().max(256).nullable().optional(),
        totalDurationMs: z.number().nonnegative(),
      })
      .strict()
      .nullable(),
    name: z.string().min(1).max(256),
    note: z.string().max(4_096),
    shortName: z.string().min(1).max(3).nullable(),
    updatedAt: z.string().min(20).max(64),
    useSameProxy: z.boolean(),
  })
  .strict()

const configShape = z
  .object({
    appearance: z.unknown(),
    general: z.unknown(),
    groups: z.array(z.unknown()).max(10_000).optional(),
    profiles: z.array(exportProfileSchema).max(10_000),
    revision: z.number().int().nonnegative(),
    rules: z.array(z.unknown()).max(10_000),
    schemaVersion: z.number().int().positive(),
  })
  .strict()

export const nativeExportSchema = z
  .object({
    config: configShape,
    exportedAt: z.string().datetime(),
    format: z.literal(NATIVE_EXPORT_FORMAT),
    formatVersion: z.literal(NATIVE_EXPORT_FORMAT_VERSION),
    includesCredentials: z.boolean(),
  })
  .strict()

export interface NativeExportDocument {
  readonly config: AppConfig
  readonly exportedAt: string
  readonly format: typeof NATIVE_EXPORT_FORMAT
  readonly formatVersion: typeof NATIVE_EXPORT_FORMAT_VERSION
  readonly includesCredentials: boolean
}

export type NativeImportParseErrorCode = SafeJsonErrorCode | 'SCHEMA_INVALID' | 'CONFIG_INVALID'

export interface NativeImportParseError {
  readonly code: NativeImportParseErrorCode
  readonly issues: readonly string[]
}

export const parseNativeExportText = (
  text: string,
): Result<NativeExportDocument, NativeImportParseError> => {
  const raw = parseSafeJson(text)
  if (!raw.ok) {
    return raw
  }
  const parsedDocument = nativeExportSchema.safeParse(raw.value)
  if (!parsedDocument.success) {
    return err({
      code: 'SCHEMA_INVALID',
      issues: parsedDocument.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      ),
    })
  }
  const configCandidate = {
    ...parsedDocument.data.config,
    profiles: parsedDocument.data.config.profiles.map((profile) => ({
      ...profile,
      httpEndpoint: {
        ...profile.httpEndpoint,
        password: profile.httpEndpoint.password ?? '',
        username: profile.httpEndpoint.username ?? '',
      },
      httpsEndpoint: {
        ...profile.httpsEndpoint,
        password: profile.httpsEndpoint.password ?? '',
        username: profile.httpsEndpoint.username ?? '',
      },
    })),
  }
  const versionTwoCandidate =
    configCandidate.schemaVersion === 1
      ? removeGroupsFromVersionOne(configCandidate)
      : configCandidate
  const migratedCandidate =
    configCandidate.schemaVersion === 1 || configCandidate.schemaVersion === 2
      ? upgradeLegacyExamplesFromVersionTwo(versionTwoCandidate)
      : versionTwoCandidate
  const sourceVersion =
    typeof configCandidate.schemaVersion === 'number' ? configCandidate.schemaVersion : 0
  const versionFourCandidate =
    sourceVersion <= 3 ? addAppearanceAccentFromVersionThree(migratedCandidate) : migratedCandidate
  const versionFiveCandidate =
    sourceVersion <= 4 ? addSpeedTestFromVersionFour(versionFourCandidate) : versionFourCandidate
  const versionSixCandidate =
    sourceVersion <= 5
      ? addSocks5TransportFromVersionFive(versionFiveCandidate)
      : versionFiveCandidate
  const config = parseAppConfig(versionSixCandidate)
  if (!config.ok) {
    return err({
      code: 'CONFIG_INVALID',
      issues: config.error.issues.map((issue) => `${issue.path}: ${issue.message}`),
    })
  }
  return ok({
    config: config.value,
    exportedAt: parsedDocument.data.exportedAt,
    format: NATIVE_EXPORT_FORMAT,
    formatVersion: NATIVE_EXPORT_FORMAT_VERSION,
    includesCredentials: parsedDocument.data.includesCredentials,
  })
}
