import { DEFAULT_SPEED_TEST_ENDPOINT } from '../../config/defaults'

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...(value as Readonly<Record<string, unknown>>) }
    : null

const withSpeedFields = (check: unknown): unknown => {
  const record = asRecord(check)
  if (record === null) return check
  return {
    ...record,
    downloadMbps: record.downloadMbps ?? null,
    speedErrorCode: record.speedErrorCode ?? null,
  }
}

/**
 * v4 → v5: General gains the Test speed download URL and stored check results gain empty speed
 * fields. Present values are kept, so running the step twice yields the same config.
 */
export const addSpeedTestFromVersionFour = (input: unknown): unknown => {
  const source = asRecord(input)
  if (source === null) return input
  const general = asRecord(source.general) ?? {}
  const profiles = Array.isArray(source.profiles)
    ? source.profiles.map((entry: unknown) => {
        const profile = asRecord(entry)
        if (profile === null || profile.lastCheck === null || profile.lastCheck === undefined) {
          return entry
        }
        return { ...profile, lastCheck: withSpeedFields(profile.lastCheck) }
      })
    : source.profiles
  return {
    ...source,
    general: {
      ...general,
      speedTestEndpoint: general.speedTestEndpoint ?? DEFAULT_SPEED_TEST_ENDPOINT,
    },
    profiles,
    schemaVersion: 5,
  }
}
