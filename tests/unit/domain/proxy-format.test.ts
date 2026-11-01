import { execFileSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import {
  formatProfile,
  formatProxyCompact,
  formatProxyCurl,
  formatProxyList,
  formatProxyUrl,
  shellQuote,
} from '../../../src/domain/profiles/proxy-format'
import { parseProxyString } from '../../../src/domain/profiles/proxy-string'
import type { ProxyEndpoint } from '../../../src/domain/types/entities'
import { endpoint, profile } from './fixtures'

const withCredentials = (
  base: ProxyEndpoint,
  username: string,
  password: string,
): ProxyEndpoint => ({ ...base, password, username })

describe('proxy URL format', () => {
  it.each([
    [endpoint('192.0.2.10', 8080), 'http://192.0.2.10:8080'],
    [endpoint('proxy.example', 8443, 'HTTPS'), 'https://proxy.example:8443'],
    [
      withCredentials(endpoint('proxy.example', 3128), 'alice', ''),
      'http://alice@proxy.example:3128',
    ],
    [
      withCredentials(endpoint('proxy.example', 3128), 'a@b:c', "p:@/%'"),
      "http://a%40b%3Ac:p%3A%40%2F%25'@proxy.example:3128",
    ],
    [endpoint('[2001:db8::10]', 8080), 'http://[2001:db8::10]:8080'],
  ] as const)('formats %j as %s', (input, expected) => {
    expect(formatProxyUrl(input)).toBe(expected)
  })
})

describe('compact format', () => {
  it('writes host:port and host:port:user:pass', () => {
    expect(formatProxyCompact(endpoint('192.0.2.10', 8080))).toBe('192.0.2.10:8080')
    expect(formatProxyCompact(withCredentials(endpoint('192.0.2.10', 8080), 'bob', 'pw'))).toBe(
      '192.0.2.10:8080:bob:pw',
    )
  })

  it('returns null when credentials cannot be represented without ambiguity', () => {
    expect(formatProxyCompact(withCredentials(endpoint('h.example', 1), 'a:b', 'pw'))).toBeNull()
    expect(formatProxyCompact(withCredentials(endpoint('h.example', 1), 'bob', ''))).toBeNull()
    expect(formatProxyCompact(withCredentials(endpoint('h.example', 1), 'bob', 'p w'))).toBeNull()
  })
})

describe('curl format', () => {
  it('quotes every argument so the shell passes them through unchanged', () => {
    const proxy = withCredentials(
      endpoint('proxy.example', 8443, 'HTTPS'),
      'al ice',
      "it's $(x)`y`",
    )
    const command = formatProxyCurl(proxy, 'https://check.example/ip?a=1&b=2')
    const argv = execFileSync('bash', ['-c', command.replace(/^curl /u, "printf '%s\\n' ")], {
      encoding: 'utf8',
    })
    expect(argv.split('\n').slice(0, -1)).toEqual([
      '-x',
      formatProxyUrl(proxy),
      'https://check.example/ip?a=1&b=2',
    ])
  })

  it('quotes single quotes POSIX-style', () => {
    expect(shellQuote("a'b")).toBe(`'a'\\''b'`)
  })
})

describe('profile and list formats', () => {
  const same = profile('same', {
    httpEndpoint: withCredentials(endpoint('192.0.2.1', 8080), 'u', 'p'),
    useSameProxy: true,
  })
  const split = profile('split', {
    httpEndpoint: endpoint('192.0.2.2', 8080),
    httpsEndpoint: endpoint('192.0.2.3', 8443, 'HTTPS'),
    useSameProxy: false,
  })

  it('writes one line for a single-endpoint profile and two labelled lines otherwise', () => {
    expect(formatProfile(same, 'URL')).toBe('http://u:p@192.0.2.1:8080')
    expect(formatProfile(split, 'URL')).toBe(
      '# HTTP/WS targets\nhttp://192.0.2.2:8080\n# HTTPS/WSS targets\nhttps://192.0.2.3:8443',
    )
    expect(formatProfile(same, 'CURL')).toBe(
      `curl -x 'http://u:p@192.0.2.1:8080' '${same.checkUrl}'`,
    )
  })

  it('falls back to a URL line when compact form cannot represent a profile', () => {
    const colon = profile('colon', {
      httpEndpoint: withCredentials(endpoint('192.0.2.4', 8080), 'a:b', 'p'),
      useSameProxy: true,
    })
    expect(formatProxyList([same, colon], 'COMPACT')).toBe(
      '192.0.2.1:8080:u:p\nhttp://a%3Ab:p@192.0.2.4:8080\n',
    )
  })
})

describe('round trip with the parser', () => {
  // Deterministic pseudo-random endpoints; covers reserved characters in credentials.
  let seed = 7
  const random = (max: number): number => {
    seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31
    return seed % max
  }
  const alphabet = 'abcXYZ019-._~:@/?#[]!$&\'()*+,;=% "`é'
  const text = (length: number): string =>
    Array.from({ length }, () => alphabet[random(alphabet.length)]).join('')

  it('parses every formatted URL back to the same endpoint', () => {
    for (let index = 0; index < 300; index += 1) {
      const username = random(4) === 0 ? '' : text(1 + random(8))
      const password = username === '' ? '' : text(random(10))
      const source: ProxyEndpoint = {
        host:
          random(2) === 0 ? `h${random(999)}.example` : `10.${random(255)}.0.${1 + random(254)}`,
        password,
        port: 1 + random(65_535),
        transport: random(2) === 0 ? 'HTTP' : 'HTTPS',
        username,
      }
      expect(parseProxyString(formatProxyUrl(source))).toEqual({
        kind: 'SUCCESS',
        proxy: {
          host: source.host,
          password: source.password === '' ? null : source.password,
          port: source.port,
          transport: source.transport,
          username: source.username === '' ? null : source.username,
        },
      })
    }
  })
})
