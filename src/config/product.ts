export interface ProductConfig {
  readonly description: string
  readonly displayName: string
  readonly firefoxExtensionId: string
  readonly privacyPolicyUrl: string | null
  readonly shortName: string
  readonly slug: string
  readonly supportUrl: string | null
}

export const PRODUCT: Readonly<ProductConfig> = Object.freeze({
  displayName: 'ProxyLoom',
  shortName: 'ProxyLoom',
  slug: 'proxyloom',
  description: 'Clear, deterministic HTTP and HTTPS proxy routing.',
  firefoxExtensionId: 'proxy-routing@local.invalid',
  privacyPolicyUrl: null,
  supportUrl: null,
})
