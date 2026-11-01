import type { AppearanceAccent, AppearanceSettings } from '../../domain/types/entities'

interface AccentScheme {
  /** Accent text and borders on neutral surfaces. */
  readonly primary: string
  /** Filled buttons and selected states; white text sits on it. */
  readonly fill: string
  /** Tinted backgrounds such as the active navigation item. */
  readonly soft: string
  /** Focus ring color. */
  readonly ring: string
}

/** The single source of accent colors; unit tests check every pair for WCAG AA contrast. */
export const ACCENTS: Readonly<
  Record<AppearanceAccent, { readonly light: AccentScheme; readonly dark: AccentScheme }>
> = {
  AMBER: {
    dark: { fill: '#92400e', primary: '#fbbf24', ring: 'rgb(251 191 36 / 40%)', soft: '#3a2c12' },
    light: { fill: '#92400e', primary: '#92400e', ring: 'rgb(146 64 14 / 30%)', soft: '#fdf3e1' },
  },
  INDIGO: {
    dark: { fill: '#3a52e0', primary: '#8c9cff', ring: 'rgb(140 156 255 / 40%)', soft: '#232a4c' },
    light: { fill: '#3a52e0', primary: '#3a52e0', ring: 'rgb(58 82 224 / 32%)', soft: '#eef1ff' },
  },
  ROSE: {
    dark: { fill: '#be123c', primary: '#fb7185', ring: 'rgb(251 113 133 / 40%)', soft: '#3b1d27' },
    light: { fill: '#be123c', primary: '#be123c', ring: 'rgb(190 18 60 / 30%)', soft: '#fdecef' },
  },
  SLATE: {
    dark: { fill: '#475569', primary: '#cbd5e1', ring: 'rgb(203 213 225 / 40%)', soft: '#273041' },
    light: { fill: '#334155', primary: '#334155', ring: 'rgb(51 65 85 / 30%)', soft: '#eef1f5' },
  },
  TEAL: {
    dark: { fill: '#0f766e', primary: '#2dd4bf', ring: 'rgb(45 212 191 / 40%)', soft: '#13332f' },
    light: { fill: '#0f766e', primary: '#0f766e', ring: 'rgb(15 118 110 / 30%)', soft: '#e3f5f2' },
  },
  VIOLET: {
    dark: { fill: '#6d28d9', primary: '#b79cff', ring: 'rgb(183 156 255 / 40%)', soft: '#2c2350' },
    light: { fill: '#6d28d9', primary: '#6d28d9', ring: 'rgb(109 40 217 / 30%)', soft: '#f1ebfd' },
  },
}

export const ACCENT_ORDER: readonly AppearanceAccent[] = [
  'INDIGO',
  'TEAL',
  'VIOLET',
  'ROSE',
  'AMBER',
  'SLATE',
]

/**
 * Applies the theme and accent to an extension page. Both light (`--accent-l-*`) and dark
 * (`--accent-d-*`) variables are set so that the System theme can still switch with the OS.
 */
export const applyAppearance = (root: HTMLElement, appearance: AppearanceSettings): void => {
  root.dataset.theme = appearance.theme.toLocaleLowerCase('en-US')
  root.dataset.accent = appearance.accent.toLocaleLowerCase('en-US')
  const accent = ACCENTS[appearance.accent]
  for (const [prefix, scheme] of [
    ['l', accent.light],
    ['d', accent.dark],
  ] as const) {
    root.style.setProperty(`--accent-${prefix}-primary`, scheme.primary)
    root.style.setProperty(`--accent-${prefix}-fill`, scheme.fill)
    root.style.setProperty(`--accent-${prefix}-soft`, scheme.soft)
    root.style.setProperty(`--accent-${prefix}-ring`, scheme.ring)
  }
}
