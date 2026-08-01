import { z } from 'zod'

import type { AppConfig } from '../types/entities'
import { err, ok, type Result } from '../types/result'

const id = z.string().min(1).max(128)
const timestamp = z.string().min(20).max(64)

const endpointSchema = z
  .object({
    host: z.string().min(1).max(253),
    password: z.string().max(4_096),
    port: z.number().int().min(1).max(65_535),
    transport: z.enum(['HTTP', 'HTTPS']),
    username: z.string().max(1_024),
  })
  .strict()

const checkResultSchema = z
  .object({
    availability: z.boolean(),
    checkedAt: timestamp,
    connectDurationMs: z.number().nonnegative().nullable(),
    country: z.string().max(128).nullable(),
    errorCode: z.string().max(256).nullable(),
    externalIp: z.string().max(64).nullable(),
    httpStatus: z.number().int().min(100).max(599).nullable(),
    totalDurationMs: z.number().nonnegative(),
  })
  .strict()

const profileSchema = z
  .object({
    checkUrl: z.string().url().max(2_048),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    createdAt: timestamp,
    generatedShortName: z.string().min(1).max(3),
    httpEndpoint: endpointSchema,
    httpsEndpoint: endpointSchema,
    id,
    lastCheck: checkResultSchema.nullable(),
    name: z.string().min(1).max(256),
    note: z.string().max(4_096),
    shortName: z.string().min(1).max(3).nullable(),
    updatedAt: timestamp,
    useSameProxy: z.boolean(),
  })
  .strict()

const temporaryDisableSchema = z
  .object({
    kind: z.enum(['UNTIL', 'UNTIL_RESTART']),
    until: timestamp.nullable(),
  })
  .strict()

const actionSchema = z
  .object({
    targetProxyProfileId: id.nullable(),
    type: z.enum(['DIRECT', 'PROXY']),
  })
  .strict()

const ruleSchema = z
  .object({
    action: actionSchema,
    createdAt: timestamp,
    description: z.string().max(4_096),
    enabled: z.boolean(),
    flags: z.string().max(8),
    id,
    matcherType: z.enum(['ORIGIN', 'FULL_URL']),
    name: z.string().min(1).max(256),
    pattern: z.string().min(1).max(2_048),
    position: z.number().int().nonnegative(),
    temporaryDisable: temporaryDisableSchema.nullable(),
    updatedAt: timestamp,
    validity: z.enum(['VALID', 'INVALID_REFERENCE', 'INVALID_PATTERN']),
  })
  .strict()

export const appConfigSchema = z
  .object({
    appearance: z
      .object({
        theme: z.enum(['SYSTEM', 'LIGHT', 'DARK']),
      })
      .strict(),
    general: z
      .object({
        activeProxyProfileId: id.nullable(),
        confirmDangerousActions: z.boolean(),
        errorPageEnabled: z.boolean(),
        geoIpEnabled: z.boolean(),
        ipGeoProviderEndpoint: z.string().url().max(2_048),
        logLevel: z.enum(['ERROR', 'INFO', 'DEBUG']),
        loggingEnabled: z.boolean(),
        loggingMode: z.enum(['NAVIGATIONS_AND_FAILURES', 'ALL_SUPPORTED_REQUESTS']),
        loggingPaused: z.boolean(),
        mode: z.enum(['DIRECT', 'PROXY', 'RULES']),
        proxyCheckTimeoutMs: z.number().int().min(1_000).max(120_000),
      })
      .strict(),
    profiles: z.array(profileSchema).max(10_000),
    revision: z.number().int().nonnegative(),
    rules: z.array(ruleSchema).max(10_000),
    schemaVersion: z.literal(2),
  })
  .strict()

export interface ConfigSchemaError {
  readonly code: 'INVALID_CONFIG'
  readonly issues: readonly {
    readonly path: string
    readonly message: string
  }[]
}

export const parseAppConfig = (input: unknown): Result<AppConfig, ConfigSchemaError> => {
  const result = appConfigSchema.safeParse(input)
  if (!result.success) {
    return err({
      code: 'INVALID_CONFIG',
      issues: result.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join('.'),
      })),
    })
  }
  return ok(result.data as unknown as AppConfig)
}
