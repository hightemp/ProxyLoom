import { connect, type Socket } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'

import { startSocks5Proxy } from './proxies/socks5-proxy'
import { startHttpOrigin } from './servers/http-origin'

interface Closable {
  close(): Promise<void>
}

const started: Closable[] = []

afterEach(async () => {
  await Promise.all(started.splice(0).map(async (fixture) => fixture.close()))
})

const openSocket = (port: number): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => resolve(socket))
    socket.once('error', reject)
  })

// Reads exactly `length` bytes, or resolves with what arrived before the server closed.
const read = (socket: Socket, length: number): Promise<Buffer> =>
  new Promise((resolve) => {
    let buffered = Buffer.alloc(0)
    const finish = () => {
      socket.off('data', onData)
      socket.off('close', finish)
      resolve(buffered)
    }
    const onData = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk])
      if (buffered.length >= length) {
        socket.pause()
        const extra = buffered.subarray(length)
        buffered = buffered.subarray(0, length)
        if (extra.length > 0) socket.unshift(extra)
        finish()
      }
    }
    socket.on('data', onData)
    socket.once('close', finish)
    socket.resume()
  })

const domainConnect = (host: string, port: number): Buffer =>
  Buffer.concat([
    Buffer.from([0x05, 0x01, 0x00, 0x03, host.length]),
    Buffer.from(host, 'utf8'),
    Buffer.from([port >> 8, port & 0xff]),
  ])

const ipv4Connect = (port: number): Buffer =>
  Buffer.from([0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1, port >> 8, port & 0xff])

const httpGet = async (socket: Socket, host: string, path: string): Promise<string> => {
  socket.write(`GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`)
  const chunks: Buffer[] = []
  socket.on('data', (chunk: Buffer) => chunks.push(chunk))
  socket.resume()
  await new Promise((resolve) => socket.once('close', resolve))
  return Buffer.concat(chunks).toString('utf8')
}

describe('local SOCKS5 proxy fixture', () => {
  it('tunnels a no-auth DOMAIN CONNECT and records the unresolved host name', async () => {
    const origin = await startHttpOrigin()
    const proxy = await startSocks5Proxy()
    started.push(origin, proxy)
    const originPort = Number(new URL(origin.origin).port)

    const socket = await openSocket(proxy.port)
    socket.write(Buffer.from([0x05, 0x01, 0x00]))
    expect([...(await read(socket, 2))]).toEqual([0x05, 0x00])
    socket.write(domainConnect('origin.proxyloom.test', originPort))
    const reply = await read(socket, 10)
    expect(reply[1]).toBe(0x00)
    const response = await httpGet(socket, 'origin.proxyloom.test', '/socks-domain')

    expect(response).toContain('Origin response')
    expect(origin.requests.map((request) => request.path)).toEqual(['/socks-domain'])
    expect(proxy.connections).toEqual([
      {
        addressType: 'DOMAIN',
        authMethod: 'NONE',
        authenticated: true,
        outcome: 'TUNNELED',
        target: `origin.proxyloom.test:${originPort}`,
      },
    ])
  })

  it('requires RFC 1929 username/password and never records the password', async () => {
    const origin = await startHttpOrigin()
    const proxy = await startSocks5Proxy({ password: 'socks-password', username: 'socks-user' })
    started.push(origin, proxy)
    const originPort = Number(new URL(origin.origin).port)

    const noAuthOnly = await openSocket(proxy.port)
    noAuthOnly.write(Buffer.from([0x05, 0x01, 0x00]))
    expect([...(await read(noAuthOnly, 2))]).toEqual([0x05, 0xff])

    const wrong = await openSocket(proxy.port)
    wrong.write(Buffer.from([0x05, 0x02, 0x00, 0x02]))
    expect([...(await read(wrong, 2))]).toEqual([0x05, 0x02])
    wrong.write(
      Buffer.from([0x01, 0x0a, ...Buffer.from('socks-user'), 0x03, ...Buffer.from('bad')]),
    )
    expect([...(await read(wrong, 2))]).toEqual([0x01, 0x01])

    const right = await openSocket(proxy.port)
    right.write(Buffer.from([0x05, 0x01, 0x02]))
    expect([...(await read(right, 2))]).toEqual([0x05, 0x02])
    right.write(
      Buffer.concat([
        Buffer.from([0x01, 0x0a]),
        Buffer.from('socks-user'),
        Buffer.from([0x0e]),
        Buffer.from('socks-password'),
      ]),
    )
    expect([...(await read(right, 2))]).toEqual([0x01, 0x00])
    right.write(ipv4Connect(originPort))
    expect((await read(right, 10))[1]).toBe(0x00)
    expect(await httpGet(right, '127.0.0.1', '/socks-auth')).toContain('Origin response')

    expect(
      proxy.connections.map(({ authMethod, authenticated, outcome }) => ({
        authMethod,
        authenticated,
        outcome,
      })),
    ).toEqual([
      { authMethod: 'NO_ACCEPTABLE', authenticated: false, outcome: 'REJECTED' },
      { authMethod: 'USERNAME_PASSWORD', authenticated: false, outcome: 'REJECTED' },
      { authMethod: 'USERNAME_PASSWORD', authenticated: true, outcome: 'TUNNELED' },
    ])
    expect(proxy.connections[2]).toMatchObject({
      addressType: 'IPV4',
      target: `127.0.0.1:${originPort}`,
    })
    expect(JSON.stringify(proxy.connections)).not.toContain('socks-password')
  })

  it('reports an unreachable target with a SOCKS failure reply instead of a tunnel', async () => {
    const proxy = await startSocks5Proxy()
    started.push(proxy)

    const socket = await openSocket(proxy.port)
    socket.write(Buffer.from([0x05, 0x01, 0x00]))
    await read(socket, 2)
    socket.write(ipv4Connect(1))
    const reply = await read(socket, 10)

    expect(reply[1]).not.toBe(0x00)
    expect(proxy.connections[0]).toMatchObject({ outcome: 'TARGET_UNREACHABLE' })
  })
})
