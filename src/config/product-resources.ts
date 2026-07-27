import type { ProductConfig } from './product'

export interface ProductResourceLink {
  readonly kind: 'PRIVACY' | 'SUPPORT'
  readonly url: string
}

const publicHttpsUrl = (value: string): string => {
  const parsed = new URL(value)
  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error(
      'Product resource links must use public HTTPS URLs without credentials or fragments.',
    )
  }
  return parsed.href
}

export const productResourceLinks = (
  product: Pick<ProductConfig, 'privacyPolicyUrl' | 'supportUrl'>,
): readonly ProductResourceLink[] =>
  [
    product.supportUrl === null
      ? null
      : { kind: 'SUPPORT' as const, url: publicHttpsUrl(product.supportUrl) },
    product.privacyPolicyUrl === null
      ? null
      : { kind: 'PRIVACY' as const, url: publicHttpsUrl(product.privacyPolicyUrl) },
  ].filter((link): link is ProductResourceLink => link !== null)
