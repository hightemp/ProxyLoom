import { hasFlag } from 'country-flag-icons'
import { shallowRef, watchEffect, type Ref } from 'vue'

export interface CountryDisplay {
  /** Upper-case ISO 3166-1 alpha-2 code with a bundled flag, or null for free-text values. */
  readonly code: string | null
  readonly name: string
}

// The UI is English; region names follow it.
const regionNames = new Intl.DisplayNames(['en'], { fallback: 'none', type: 'region' })

/** Turns a check provider's country value into a readable name and, when known, an ISO code. */
export const countryDisplay = (value: string): CountryDisplay => {
  const trimmed = value.trim()
  const code = trimmed.toUpperCase()
  // Every assigned ISO code has a bundled flag; anything else (e.g. ZZ, "Atlantis") is verbatim.
  if (!/^[A-Z]{2}$/.test(code) || !hasFlag(code)) {
    return { code: null, name: trimmed }
  }
  let name: string | undefined
  try {
    name = regionNames.of(code)
  } catch {
    name = undefined
  }
  return { code, name: name ?? code }
}

type FlagModule = Readonly<Record<string, string | undefined>>
let flags: Promise<FlagModule> | null = null

/**
 * Bundled SVG flag as a data URL; never fetched from the network. The ~175 KB flag set is a
 * separate lazy chunk so the popup's first paint does not pay for it.
 */
export const loadFlagSrc = async (code: string): Promise<string | null> => {
  flags ??= import('country-flag-icons/string/3x2') as unknown as Promise<FlagModule>
  const svg = (await flags)[code]
  return svg === undefined ? null : `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export const useFlagSrc = (code: () => string | null): Ref<string | null> => {
  const src = shallowRef<string | null>(null)
  watchEffect(() => {
    const current = code()
    src.value = null
    if (current === null) return
    void loadFlagSrc(current).then((loaded) => {
      if (code() === current) src.value = loaded
    })
  })
  return src
}
