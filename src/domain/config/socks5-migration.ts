const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...(value as Readonly<Record<string, unknown>>) }
    : null

/**
 * v5 → v6: endpoints may now use the SOCKS5 transport (ADR-016). Existing HTTP/HTTPS data is
 * already valid, so the step only advances the version; running it twice yields the same config.
 * The bump keeps older releases, which cannot route SOCKS5, from loading a v6 config.
 */
export const addSocks5TransportFromVersionFive = (input: unknown): unknown => {
  const source = asRecord(input)
  if (source === null) return input
  return { ...source, schemaVersion: 6 }
}
