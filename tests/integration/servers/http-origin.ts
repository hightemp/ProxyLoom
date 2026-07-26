import { createHash } from 'node:crypto'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'

export interface CapturedOriginRequest {
  readonly method: string
  readonly path: string
  readonly headers: Readonly<Record<string, string>>
}

export interface HttpOriginFixture {
  readonly origin: string
  readonly requests: CapturedOriginRequest[]
  readonly websocketConnections: string[]
  reset(): void
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

export const startHttpOrigin = async (): Promise<HttpOriginFixture> => {
  const requests: CapturedOriginRequest[] = []
  const websocketConnections: string[] = []
  const sockets = new Set<Duplex>()
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
    requests.push({
      headers: redactHeaders(request.headers),
      method: request.method ?? 'GET',
      path: `${requestUrl.pathname}${requestUrl.search}`,
    })

    if (requestUrl.pathname === '/delay') {
      const delayMs = Math.min(Number(requestUrl.searchParams.get('ms') ?? 0), 5_000)
      setTimeout(() => {
        response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
        response.end('delayed')
      }, delayMs)
      return
    }
    if (requestUrl.pathname === '/download') {
      response.writeHead(200, {
        'content-disposition': 'attachment; filename="proxyloom-test.txt"',
        'content-type': 'text/plain; charset=utf-8',
      })
      response.end('deterministic download')
      return
    }
    if (requestUrl.pathname === '/ip') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ country: 'Testland', ip: '192.0.2.10' }))
      return
    }
    if (requestUrl.pathname === '/site-auth') {
      response.writeHead(401, { 'www-authenticate': 'Basic realm="origin-test"' })
      response.end('origin authentication required')
      return
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'x-proxyloom-origin': 'direct-or-forwarded',
    })
    response.end('<!doctype html><title>Origin response</title><h1>Origin response</h1>')
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  server.on('upgrade', (request, socket) => {
    const key = request.headers['sec-websocket-key']
    if (typeof key !== 'string') {
      socket.destroy()
      return
    }
    websocketConnections.push(request.url ?? '')
    acceptWebSocket(socket, key, 'origin-websocket')
  })
  const address = await listen(server)

  return {
    close: () => close(server, sockets),
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    reset: () => {
      requests.splice(0)
      websocketConnections.splice(0)
    },
    websocketConnections,
  }
}
