import { connect, type AddressInfo, type Socket } from 'node:net'
import { createServer, type Server as TlsServer } from 'node:tls'

import { createEphemeralCertificate } from '../servers/test-certificate'
import {
  startHttpProxy,
  type CapturedProxyRequest,
  type HttpProxyOptions,
  type ProxyFailureMode,
} from './http-proxy'

export interface HttpsProxyFixture {
  readonly host: '127.0.0.1'
  readonly port: number
  readonly requests: CapturedProxyRequest[]
  readonly url: string
  reset(): void
  setFailureMode(mode: ProxyFailureMode): void
  close(): Promise<void>
}

const listen = (server: TlsServer): Promise<AddressInfo> =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(server.address() as AddressInfo)
    })
  })

const close = (server: TlsServer, sockets: ReadonlySet<Socket>): Promise<void> =>
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
  })

export const startHttpsProxy = async (
  options: HttpProxyOptions = {},
): Promise<HttpsProxyFixture> => {
  const [backend, certificate] = await Promise.all([
    startHttpProxy(options),
    createEphemeralCertificate(),
  ])
  const sockets = new Set<Socket>()
  const server = createServer(
    {
      cert: certificate.certificate,
      key: certificate.privateKey,
    },
    (clientSocket) => {
      sockets.add(clientSocket)
      clientSocket.once('close', () => sockets.delete(clientSocket))
      const backendSocket = connect(backend.port, backend.host, () => {
        clientSocket.pipe(backendSocket)
        backendSocket.pipe(clientSocket)
      })
      sockets.add(backendSocket)
      backendSocket.once('close', () => sockets.delete(backendSocket))
      backendSocket.on('error', () => clientSocket.destroy())
      clientSocket.on('error', () => backendSocket.destroy())
    },
  )
  try {
    const address = await listen(server)
    return {
      close: async () => {
        await Promise.all([close(server, sockets), backend.close(), certificate.close()])
      },
      host: '127.0.0.1',
      port: address.port,
      requests: backend.requests,
      reset: () => backend.reset(),
      setFailureMode: (mode) => backend.setFailureMode(mode),
      url: `https://127.0.0.1:${address.port}`,
    }
  } catch (error) {
    await Promise.all([backend.close(), certificate.close()])
    throw error
  }
}
