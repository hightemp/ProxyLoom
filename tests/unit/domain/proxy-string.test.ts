import { describe, expect, it } from 'vitest'

import {
  parseProxyString,
  type ParsedProxyString,
  type ProxyStringErrorCode,
} from '../../../src/domain/profiles/proxy-string'
import type { ProxyTransport } from '../../../src/domain/types/entities'

const proxy = (
  host: string,
  port: number,
  transport: ProxyTransport | null = null,
  username: string | null = null,
  password: string | null = null,
): ParsedProxyString => ({ host, password, port, transport, username })

const parsed: readonly (readonly [string, ParsedProxyString])[] = [
  ['192.0.2.10:8080', proxy('192.0.2.10', 8080)],
  [
    '192.0.2.10:64239:demo-user:demo-pass',
    proxy('192.0.2.10', 64239, null, 'demo-user', 'demo-pass'),
  ],
  [
    'demo-user:demo-pass@proxy.example:1080',
    proxy('proxy.example', 1080, null, 'demo-user', 'demo-pass'),
  ],
  ['demo-user@proxy.example:1080', proxy('proxy.example', 1080, null, 'demo-user')],
  ['http://proxy.example:8080', proxy('proxy.example', 8080, 'HTTP')],
  ['HTTP://proxy.example:8080/', proxy('proxy.example', 8080, 'HTTP')],
  [
    'https://demo-user:demo-pass@proxy.example:8443',
    proxy('proxy.example', 8443, 'HTTPS', 'demo-user', 'demo-pass'),
  ],
  [
    'http://demo%40user:p%3Aa%25ss+1@proxy.example:8080',
    proxy('proxy.example', 8080, 'HTTP', 'demo@user', 'p:a%ss+1'),
  ],
  [
    'proxy.example:1080:demo%40user:pass',
    proxy('proxy.example', 1080, null, 'demo%40user', 'pass'),
  ],
  ['192.0.2.10:1080 https', proxy('192.0.2.10', 1080, 'HTTPS')],
  [
    '192.0.2.10:64239:demo-user:demo-pass HTTP',
    proxy('192.0.2.10', 64239, 'HTTP', 'demo-user', 'demo-pass'),
  ],
  [
    'demo-user:demo-pass@proxy.example:1080 http',
    proxy('proxy.example', 1080, 'HTTP', 'demo-user', 'demo-pass'),
  ],
  ['https proxy.example:8443', proxy('proxy.example', 8443, 'HTTPS')],
  [
    'http proxy.example:1080:demo-user:demo-pass',
    proxy('proxy.example', 1080, 'HTTP', 'demo-user', 'demo-pass'),
  ],
  ['https://proxy.example:8443 https', proxy('proxy.example', 8443, 'HTTPS')],
  ['proxy.example 1080', proxy('proxy.example', 1080)],
  ['proxy.example 1080 https', proxy('proxy.example', 1080, 'HTTPS')],
  [
    'proxy.example 1080 demo-user demo-pass',
    proxy('proxy.example', 1080, null, 'demo-user', 'demo-pass'),
  ],
  [
    '  proxy.example   1080 demo-user demo-pass http  ',
    proxy('proxy.example', 1080, 'HTTP', 'demo-user', 'demo-pass'),
  ],
  [
    'proxy.example,1080,demo-user,demo-pass,https',
    proxy('proxy.example', 1080, 'HTTPS', 'demo-user', 'demo-pass'),
  ],
  [
    'proxy.example;1080;demo-user;demo-pass',
    proxy('proxy.example', 1080, null, 'demo-user', 'demo-pass'),
  ],
  ['proxy.example\t1080\thttps', proxy('proxy.example', 1080, 'HTTPS')],
  ['proxy.example,1080', proxy('proxy.example', 1080)],
  ['proxy.example,1080,,,http', proxy('proxy.example', 1080, 'HTTP')],
  ['demo-user:pa,ss@proxy.example:1080', proxy('proxy.example', 1080, null, 'demo-user', 'pa,ss')],
  ['demo-user:demo-pass:45.10.1.2:8000', proxy('45.10.1.2', 8000, null, 'demo-user', 'demo-pass')],
  [
    'http demo-user:demo-pass:proxy.example:8000',
    proxy('proxy.example', 8000, 'HTTP', 'demo-user', 'demo-pass'),
  ],
  ['45.10.1.2:8000:user:12345', proxy('45.10.1.2', 8000, null, 'user', '12345')],
  ['Demo-User:Pass@Proxy.EXAMPLE:1080', proxy('proxy.example', 1080, null, 'Demo-User', 'Pass')],
  ['localhost:1080', proxy('localhost', 1080)],
  ['[2001:db8::10]:1080', proxy('[2001:db8::10]', 1080)],
  [
    'http://demo-user:demo-pass@[2001:DB8::10]:1080',
    proxy('[2001:db8::10]', 1080, 'HTTP', 'demo-user', 'demo-pass'),
  ],
  [
    '[2001:db8::10]:1080:demo-user:demo-pass https',
    proxy('[2001:db8::10]', 1080, 'HTTPS', 'demo-user', 'demo-pass'),
  ],
  ['bücher.example:3128', proxy('xn--bcher-kva.example', 3128)],
  ['http://user:p@ss@proxy.example:8080', proxy('proxy.example', 8080, 'HTTP', 'user', 'p@ss')],
]

const failures: readonly (readonly [string, ProxyStringErrorCode])[] = [
  ['http://proxy.example:8080 https', 'PROTOCOL_CONFLICT'],
  ['localhost:8080:user:pass', 'FOUR_FIELDS_INVALID'],
  ['socks5://demo-user:demo-pass@proxy.example:1080', 'SOCKS5_UNSUPPORTED'],
  ['192.0.2.10:1080 socks5', 'SOCKS5_UNSUPPORTED'],
  ['socks5h://proxy.example:1080', 'SOCKS5_UNSUPPORTED'],
  ['socks4://192.0.2.10:1080', 'SOCKS4_UNSUPPORTED'],
  ['socks4a://demo-user@proxy.example:1080', 'SOCKS4_UNSUPPORTED'],
  ['socks://proxy.example:1080', 'SOCKS_AMBIGUOUS'],
  ['ftp://proxy.example:21', 'SCHEME_UNSUPPORTED'],
  ['[2001:db8::zz]:1080', 'IPV6_INVALID'],
  ['proxy.example', 'PORT_REQUIRED'],
  ['http://proxy.example', 'PORT_REQUIRED'],
  ['proxy.example:0', 'PORT_INVALID'],
  ['proxy.example:65536', 'PORT_INVALID'],
  ['proxy.example:80a', 'PORT_INVALID'],
  ['999.1.1.1:8080', 'IPV4_INVALID'],
  ['-bad.example:8080', 'HOST_INVALID'],
  ['bad_host.example:8080', 'HOST_INVALID'],
  ['http://proxy.example:8080/path', 'PATH_NOT_ALLOWED'],
  ['http://proxy.example:8080?x=1', 'PATH_NOT_ALLOWED'],
  ['http://proxy.example:8080#frag', 'PATH_NOT_ALLOWED'],
  ['http://demo%4:pass@proxy.example:8080', 'PERCENT_ENCODING_INVALID'],
  ['http://demo%ZZ:pass@proxy.example:8080', 'PERCENT_ENCODING_INVALID'],
  ['http://demo%FF:pass@proxy.example:8080', 'UTF8_INVALID'],
  ['http://:pass@proxy.example:8080', 'USERNAME_REQUIRED'],
  [':pass@proxy.example:8080', 'USERNAME_REQUIRED'],
  ['http://demo%0Auser:pass@proxy.example:8080', 'CREDENTIALS_CONTROL'],
  ['proxy.example:1080:us\u0001er:pass', 'CONTROL_CHARACTER'],
  ['   ', 'EMPTY'],
  ['proxy.example:1080:user', 'FORMAT'],
  ['a@b@proxy.example:1080', 'FORMAT'],
  ['proxy.example 1080 user', 'FORMAT'],
  ['one two three four five six', 'FORMAT'],
  ['proxy.example,1080,user,pass,ftp', 'PROTOCOL_COLUMN_INVALID'],
  [`proxy.example:${'1'.repeat(8 * 1024)}`, 'TOO_LONG'],
]

describe('proxy string parser', () => {
  it.each(parsed)('parses %j', (input, expected) => {
    expect(parseProxyString(input)).toEqual({ kind: 'SUCCESS', proxy: expected })
  })

  it.each(failures)('rejects %j with %s', (input, code) => {
    expect(parseProxyString(input)).toEqual({ code, kind: 'FAILURE' })
  })

  it('returns both readings of a four-field record that is valid in either order', () => {
    expect(parseProxyString('1.2.3.4:8080:john.doe:12345 http')).toEqual({
      credentialsFirst: proxy('john.doe', 12345, 'HTTP', '1.2.3.4', '8080'),
      hostFirst: proxy('1.2.3.4', 8080, 'HTTP', 'john.doe', '12345'),
      kind: 'AMBIGUOUS',
    })
  })

  it('never echoes input or credentials in a failure', () => {
    const result = parseProxyString('socks4://secret-user:secret-pass@proxy.example:1080')
    expect(JSON.stringify(result)).not.toMatch(/secret/u)
  })

  it('keeps hostile characters inside credentials as data', () => {
    expect(parseProxyString('http://u%22%3B:p%27%60%24(x)@proxy.example:8080')).toEqual({
      kind: 'SUCCESS',
      proxy: proxy('proxy.example', 8080, 'HTTP', 'u";', "p'`$(x)"),
    })
  })
})
