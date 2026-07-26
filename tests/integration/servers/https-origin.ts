import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:https'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'

import type { CapturedOriginRequest } from './http-origin'
import { createEphemeralCertificate, type EphemeralCertificate } from './test-certificate'

export interface HttpsOriginFixture {
  readonly origin: string
  readonly requests: CapturedOriginRequest[]
  readonly websocketConnections: string[]
  reset(): void
  close(): Promise<void>
}

const listen = (server: Server): Promise<AddressInfo> =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(server.address() as AddressInfo)
    })
  })

const close = (
  server: Server,
  certificate: EphemeralCertificate,
  sockets: ReadonlySet<Duplex>,
): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      void certificate.close().then(() => {
        if (error !== undefined) {
          reject(error)
          return
        }
        resolve()
      }, reject)
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

export const startHttpsOrigin = async (): Promise<HttpsOriginFixture> => {
  const certificate = await createEphemeralCertificate()
  const requests: CapturedOriginRequest[] = []
  const websocketConnections: string[] = []
  const sockets = new Set<Duplex>()
  const server = createServer(
    {
      cert: certificate.certificate,
      key: certificate.privateKey,
    },
    (request, response) => {
      const requestUrl = new URL(request.url ?? '/', 'https://127.0.0.1')
      requests.push({
        headers: {},
        method: request.method ?? 'GET',
        path: `${requestUrl.pathname}${requestUrl.search}`,
      })
      if (requestUrl.pathname === '/download') {
        response.writeHead(200, {
          'content-disposition': 'attachment; filename="proxyloom-secure-test.txt"',
          'content-type': 'text/plain; charset=utf-8',
        })
        response.end('deterministic secure download')
        return
      }
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'x-proxyloom-origin': 'secure-origin',
      })
      response.end('<!doctype html><title>Secure origin</title><h1>Secure origin</h1>')
    },
  )
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
    acceptWebSocket(socket, key, 'secure-origin-websocket')
  })
  const address = await listen(server)
  return {
    close: () => close(server, certificate, sockets),
    origin: `https://127.0.0.1:${address.port}`,
    requests,
    reset: () => {
      requests.splice(0)
      websocketConnections.splice(0)
    },
    websocketConnections,
  }
}
