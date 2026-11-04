import { connect, createServer, type AddressInfo, type Server, type Socket } from 'node:net'

// Minimal RFC 1928 SOCKS5 server (CONNECT only) with optional RFC 1929 username/password.
// Test-only fixture: synthetic credentials, records the requested target without resolving it,
// so tests can tell proxy-side DNS (DOMAIN) from browser-side DNS (IPV4/IPV6).

export type Socks5AddressType = 'IPV4' | 'DOMAIN' | 'IPV6'
export type Socks5AuthMethod = 'NONE' | 'USERNAME_PASSWORD' | 'NO_ACCEPTABLE'
export type Socks5Outcome = 'TUNNELED' | 'REJECTED' | 'TARGET_UNREACHABLE' | 'UNSUPPORTED'

export interface CapturedSocksConnection {
  readonly addressType: Socks5AddressType | null
  readonly authMethod: Socks5AuthMethod
  readonly authenticated: boolean
  readonly outcome: Socks5Outcome
  readonly target: string | null
}

export interface Socks5ProxyOptions {
  readonly username?: string
  readonly password?: string
}

export interface Socks5ProxyFixture {
  readonly host: '127.0.0.1'
  readonly port: number
  readonly connections: CapturedSocksConnection[]
  reset(): void
  close(): Promise<void>
}

const VERSION = 0x05
const METHOD_NONE = 0x00
const METHOD_USERPASS = 0x02
const METHOD_NO_ACCEPTABLE = 0xff
const REPLY_SUCCEEDED = 0x00
const REPLY_HOST_UNREACHABLE = 0x04
const REPLY_COMMAND_NOT_SUPPORTED = 0x07
const REPLY_ADDRESS_NOT_SUPPORTED = 0x08

const reply = (code: number): Buffer => Buffer.from([VERSION, code, 0x00, 0x01, 0, 0, 0, 0, 0, 0])

// Test host names are only resolvable by the proxy, which proves proxy-side DNS.
const resolveTestHost = (host: string): string =>
  host === 'proxyloom.test' || host.endsWith('.proxyloom.test') ? '127.0.0.1' : host

const formatIpv6 = (bytes: Buffer): string => {
  const groups: string[] = []
  for (let index = 0; index < 16; index += 2) groups.push(bytes.readUInt16BE(index).toString(16))
  return groups.join(':')
}

/** Reads from a paused socket until `length` bytes are buffered; null when the peer closed. */
const createReader = (socket: Socket) => {
  let buffered = Buffer.alloc(0)
  let ended = false
  let waiter: (() => void) | null = null
  socket.on('data', (chunk: Buffer) => {
    buffered = Buffer.concat([buffered, chunk])
    waiter?.()
  })
  socket.on('close', () => {
    ended = true
    waiter?.()
  })
  socket.on('error', () => undefined)
  const take = async (length: number): Promise<Buffer | null> => {
    while (buffered.length < length) {
      if (ended) return null
      await new Promise<void>((resolve) => {
        waiter = () => {
          waiter = null
          resolve()
        }
      })
    }
    const result = buffered.subarray(0, length)
    buffered = buffered.subarray(length)
    return result
  }
  const rest = (): Buffer => {
    const result = buffered
    buffered = Buffer.alloc(0)
    return result
  }
  return { rest, take }
}

export const startSocks5Proxy = async (
  options: Socks5ProxyOptions = {},
): Promise<Socks5ProxyFixture> => {
  const connections: CapturedSocksConnection[] = []
  const sockets = new Set<Socket>()
  const username = options.username ?? ''
  const password = options.password ?? ''
  const authenticationRequired = username.length > 0 || password.length > 0

  const handle = async (client: Socket): Promise<void> => {
    const reader = createReader(client)
    const greeting = await reader.take(2)
    if (greeting === null || greeting[0] !== VERSION) {
      client.destroy()
      return
    }
    const methods = await reader.take(greeting[1] ?? 0)
    if (methods === null) return
    const wanted = authenticationRequired ? METHOD_USERPASS : METHOD_NONE
    if (!methods.includes(wanted)) {
      connections.push({
        addressType: null,
        authMethod: 'NO_ACCEPTABLE',
        authenticated: false,
        outcome: 'REJECTED',
        target: null,
      })
      client.end(Buffer.from([VERSION, METHOD_NO_ACCEPTABLE]))
      return
    }
    client.write(Buffer.from([VERSION, wanted]))
    const authMethod: Socks5AuthMethod = authenticationRequired ? 'USERNAME_PASSWORD' : 'NONE'

    if (authenticationRequired) {
      const header = await reader.take(2)
      if (header === null) return
      const user = await reader.take(header[1] ?? 0)
      const passwordLength = await reader.take(1)
      if (user === null || passwordLength === null) return
      const pass = await reader.take(passwordLength[0] ?? 0)
      if (pass === null) return
      const accepted = user.toString('utf8') === username && pass.toString('utf8') === password
      if (!accepted) {
        connections.push({
          addressType: null,
          authMethod,
          authenticated: false,
          outcome: 'REJECTED',
          target: null,
        })
        client.end(Buffer.from([0x01, 0x01]))
        return
      }
      client.write(Buffer.from([0x01, 0x00]))
    }

    const request = await reader.take(4)
    if (request === null) return
    const command = request[1]
    const atyp = request[3]
    let addressType: Socks5AddressType
    let host: string
    if (atyp === 0x01) {
      const bytes = await reader.take(4)
      if (bytes === null) return
      addressType = 'IPV4'
      host = [...bytes].join('.')
    } else if (atyp === 0x03) {
      const length = await reader.take(1)
      if (length === null) return
      const name = await reader.take(length[0] ?? 0)
      if (name === null) return
      addressType = 'DOMAIN'
      host = name.toString('utf8')
    } else if (atyp === 0x04) {
      const bytes = await reader.take(16)
      if (bytes === null) return
      addressType = 'IPV6'
      host = formatIpv6(bytes)
    } else {
      connections.push({
        addressType: null,
        authMethod,
        authenticated: true,
        outcome: 'UNSUPPORTED',
        target: null,
      })
      client.end(reply(REPLY_ADDRESS_NOT_SUPPORTED))
      return
    }
    const portBytes = await reader.take(2)
    if (portBytes === null) return
    const port = portBytes.readUInt16BE(0)
    const target = addressType === 'IPV6' ? `[${host}]:${port}` : `${host}:${port}`
    if (command !== 0x01) {
      connections.push({
        addressType,
        authMethod,
        authenticated: true,
        outcome: 'UNSUPPORTED',
        target,
      })
      client.end(reply(REPLY_COMMAND_NOT_SUPPORTED))
      return
    }

    const upstream = connect(port, resolveTestHost(host))
    let tunneled = false
    sockets.add(upstream)
    upstream.once('close', () => sockets.delete(upstream))
    upstream.once('error', () => {
      if (!tunneled) {
        connections.push({
          addressType,
          authMethod,
          authenticated: true,
          outcome: 'TARGET_UNREACHABLE',
          target,
        })
        client.end(reply(REPLY_HOST_UNREACHABLE))
      }
      client.destroy()
    })
    upstream.once('connect', () => {
      tunneled = true
      connections.push({
        addressType,
        authMethod,
        authenticated: true,
        outcome: 'TUNNELED',
        target,
      })
      client.write(reply(REPLY_SUCCEEDED))
      const early = reader.rest()
      if (early.length > 0) upstream.write(early)
      client.removeAllListeners('data')
      client.pipe(upstream)
      upstream.pipe(client)
      client.once('close', () => upstream.destroy())
      upstream.once('close', () => client.destroy())
    })
  }

  const server: Server = createServer((client) => {
    sockets.add(client)
    client.once('close', () => sockets.delete(client))
    void handle(client).catch(() => client.destroy())
  })
  const address = await new Promise<AddressInfo>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(server.address() as AddressInfo)
    })
  })

  return {
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy()
        server.close(() => resolve())
      }),
    connections,
    host: '127.0.0.1',
    port: address.port,
    reset: () => {
      connections.splice(0)
    },
  }
}
