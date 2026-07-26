import { createHash } from 'node:crypto'
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { connect, type AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'

export type ProxyFailureMode = 'NONE' | 'DROP' | 'HANG'

export interface CapturedProxyRequest {
  readonly kind: 'HTTP' | 'CONNECT' | 'WEBSOCKET'
  readonly method: string
  readonly target: string
  readonly authenticated: boolean
  readonly headers: Readonly<Record<string, string>>
}

export interface HttpProxyOptions {
  readonly username?: string
  readonly password?: string
  readonly failureMode?: ProxyFailureMode
  readonly marker?: string
}

export interface HttpProxyFixture {
  readonly host: '127.0.0.1'
  readonly port: number
  readonly requests: CapturedProxyRequest[]
  readonly url: string
  reset(): void
  setFailureMode(mode: ProxyFailureMode): void
  close(): Promise<void>
}

const redactHeaders = (headers: IncomingHttpHeaders): Readonly<Record<string, string>> => {
  const safe: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (name === 'authorization' || name === 'proxy-authorization' || value === undefined) {
      continue
    }
    safe[name] = Array.isArray(value) ? value.join(', ') : value
  }
  return safe
}

const expectedAuthorization = (username: string, password: string): string =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`

const listen = (server: Server): Promise<AddressInfo> =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(server.address() as AddressInfo)
    })
  })

const close = (server: Server, sockets: ReadonlySet<Duplex>): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error)
        return
      }
      resolve()
    })
    for (const socket of sockets) {
      socket.destroy()
    }
    server.closeAllConnections()
  })

const rejectAuthentication = (response: ServerResponse): void => {
  response.writeHead(407, {
    'content-type': 'text/plain; charset=utf-8',
    'proxy-authenticate': 'Basic realm="proxyloom-test"',
  })
  response.end('proxy authentication required')
}

const rejectConnectAuthentication = (socket: Duplex): void => {
  socket.end(
    'HTTP/1.1 407 Proxy Authentication Required\r\n' +
      'Proxy-Authenticate: Basic realm="proxyloom-test"\r\n' +
      'Content-Length: 0\r\n\r\n',
  )
}

const acceptWebSocket = (socket: Duplex, key: string, marker: string): void => {
  const accept = createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64')
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  )
  const payload = Buffer.from(marker, 'utf8')
  socket.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]))
}

export const startHttpProxy = async (options: HttpProxyOptions = {}): Promise<HttpProxyFixture> => {
  const requests: CapturedProxyRequest[] = []
  const sockets = new Set<Duplex>()
  const username = options.username ?? ''
  const password = options.password ?? ''
  const authenticationRequired = username.length > 0 || password.length > 0
  let failureMode = options.failureMode ?? 'NONE'
  const isAuthenticated = (headers: IncomingHttpHeaders): boolean =>
    !authenticationRequired ||
    headers['proxy-authorization'] === expectedAuthorization(username, password)

  const server = createServer((request, response) => {
    const authenticated = isAuthenticated(request.headers)
    requests.push({
      authenticated,
      headers: redactHeaders(request.headers),
      kind: 'HTTP',
      method: request.method ?? 'GET',
      target: request.url ?? '',
    })
    if (!authenticated) {
      rejectAuthentication(response)
      return
    }
    if (failureMode === 'HANG') {
      return
    }
    if (failureMode === 'DROP') {
      request.socket.destroy()
      return
    }

    let target: URL
    try {
      target = new URL(request.url ?? '')
    } catch {
      response.writeHead(400)
      response.end('absolute proxy URL required')
      return
    }
    if (target.protocol !== 'http:') {
      response.writeHead(501)
      response.end('CONNECT is required for non-HTTP targets')
      return
    }
    const headers = { ...request.headers }
    delete headers['proxy-authorization']
    headers.host = target.host
    headers['x-proxyloom-test-proxy'] = options.marker ?? 'proxy'
    const upstream = httpRequest(
      {
        headers,
        hostname: target.hostname.endsWith('.proxyloom.test') ? '127.0.0.1' : target.hostname,
        method: request.method,
        path: `${target.pathname}${target.search}`,
        port: target.port.length > 0 ? Number(target.port) : 80,
      },
      (upstreamResponse: IncomingMessage) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
        upstreamResponse.pipe(response)
      },
    )
    upstream.on('error', () => {
      if (!response.headersSent) {
        response.writeHead(502)
      }
      response.end('upstream unavailable')
    })
    request.pipe(upstream)
  })

  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })

  server.on('connect', (request, clientSocket, head) => {
    const authenticated = isAuthenticated(request.headers)
    requests.push({
      authenticated,
      headers: redactHeaders(request.headers),
      kind: 'CONNECT',
      method: request.method ?? 'CONNECT',
      target: request.url ?? '',
    })
    if (!authenticated) {
      rejectConnectAuthentication(clientSocket)
      return
    }
    if (failureMode === 'HANG') {
      return
    }
    if (failureMode === 'DROP') {
      clientSocket.destroy()
      return
    }
    const separator = (request.url ?? '').lastIndexOf(':')
    const host = separator >= 0 ? (request.url ?? '').slice(0, separator) : request.url
    const port = separator >= 0 ? Number((request.url ?? '').slice(separator + 1)) : 443
    if (host === undefined || host.length === 0 || !Number.isInteger(port)) {
      clientSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
      return
    }
    const upstreamHost = host.endsWith('.proxyloom.test') ? '127.0.0.1' : host
    const upstream = connect(port, upstreamHost, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length > 0) {
        upstream.write(head)
      }
      upstream.pipe(clientSocket)
      clientSocket.pipe(upstream)
    })
    sockets.add(upstream)
    upstream.once('close', () => sockets.delete(upstream))
    upstream.on('error', () => {
      if (!clientSocket.destroyed && !clientSocket.writableEnded) {
        clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      }
    })
  })

  server.on('upgrade', (request, socket) => {
    const authenticated = isAuthenticated(request.headers)
    requests.push({
      authenticated,
      headers: redactHeaders(request.headers),
      kind: 'WEBSOCKET',
      method: request.method ?? 'GET',
      target: request.url ?? '',
    })
    if (!authenticated) {
      rejectConnectAuthentication(socket)
      return
    }
    if (failureMode === 'HANG') {
      return
    }
    if (failureMode === 'DROP') {
      socket.destroy()
      return
    }
    const key = request.headers['sec-websocket-key']
    if (typeof key !== 'string') {
      socket.destroy()
      return
    }
    acceptWebSocket(socket, key, `${options.marker ?? 'proxy'}-websocket`)
  })

  const address = await listen(server)
  return {
    close: () => close(server, sockets),
    host: '127.0.0.1',
    port: address.port,
    requests,
    reset: () => {
      requests.splice(0)
    },
    setFailureMode: (mode) => {
      failureMode = mode
    },
    url: `http://127.0.0.1:${address.port}`,
  }
}
