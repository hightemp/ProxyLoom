const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...(value as Readonly<Record<string, unknown>>) }
    : null

/**
 * v3 → v4: appearance gains an accent color. An accent already present is kept, so running the
 * step twice yields the same config; anything else is left for schema validation to reject.
 */
export const addAppearanceAccentFromVersionThree = (input: unknown): unknown => {
  const source = asRecord(input)
  if (source === null) return input
  const appearance = asRecord(source.appearance) ?? {}
  return {
    ...source,
    appearance: { ...appearance, accent: appearance.accent ?? 'INDIGO' },
    schemaVersion: 4,
  }
}
