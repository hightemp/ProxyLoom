import type { ProxyProfile, ProxyTransport } from '../../domain/types/entities'

export interface ProfileFilter {
  readonly query: string
  readonly transport: 'ALL' | ProxyTransport
  readonly check: 'ALL' | 'AVAILABLE' | 'UNAVAILABLE' | 'NEVER'
}

const endpoints = (profile: ProxyProfile) =>
  profile.useSameProxy ? [profile.httpEndpoint] : [profile.httpEndpoint, profile.httpsEndpoint]

/** Name/host search plus transport and last-check filters for the Proxies list. */
export const filterProfiles = (
  profiles: readonly ProxyProfile[],
  filter: ProfileFilter,
): readonly ProxyProfile[] => {
  const query = filter.query.trim().toLocaleLowerCase('en-US')
  return profiles.filter((profile) => {
    const matchesQuery =
      query === '' ||
      profile.name.toLocaleLowerCase('en-US').includes(query) ||
      endpoints(profile).some((endpoint) =>
        `${endpoint.host}:${endpoint.port}`.toLocaleLowerCase('en-US').includes(query),
      )
    const matchesTransport =
      filter.transport === 'ALL' ||
      endpoints(profile).some((endpoint) => endpoint.transport === filter.transport)
    const matchesCheck =
      filter.check === 'ALL' ||
      (filter.check === 'NEVER'
        ? profile.lastCheck === null
        : profile.lastCheck !== null &&
          profile.lastCheck.availability === (filter.check === 'AVAILABLE'))
    return matchesQuery && matchesTransport && matchesCheck
  })
}
