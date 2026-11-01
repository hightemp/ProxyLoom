import type { TemporaryOverride } from '../../domain/types/entities'

const canonicalHost = (hostname: string): string =>
  hostname.toLocaleLowerCase('en-US').replace(/\.$/u, '')

/**
 * Overrides whose scope covers a hostname, for display next to the current site. Routing itself
 * always goes through the resolver; this only mirrors the two scopes the override generator emits.
 */
export const overridesForSite = (
  overrides: readonly TemporaryOverride[],
  hostname: string,
): readonly TemporaryOverride[] => {
  const host = canonicalHost(hostname)
  return overrides.filter((override) => {
    const key = canonicalHost(override.originKey)
    return override.scope === 'EXACT_HOSTNAME'
      ? host === key
      : host === key || host.endsWith(`.${key}`)
  })
}
