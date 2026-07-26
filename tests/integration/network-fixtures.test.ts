import { request } from 'node:http'
import { connect as tlsConnect } from 'node:tls'
import { afterEach, describe, expect, it } from 'vitest'

import { startHttpsProxy } from './proxies/https-proxy'
import type { HttpProxyFixture } from './proxies/http-proxy'
import { startHttpProxy } from './proxies/http-proxy'
import type { HttpOriginFixture } from './servers/http-origin'
import { startHttpOrigin } from './servers/http-origin'

const started: Array<{ close(): Promise<void> }> = []

afterEach(async () => {
  await Promise.all(started.splice(0).map(async (fixture) => fixture.close()))
})

const requestThroughProxy = (
  proxy: HttpProxyFixture,
  target: string,
  proxyAuthorization?: string,
): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const headers =
      proxyAuthorization === undefined ? {} : { 'proxy-authorization': proxyAuthorization }
    const clientRequest = request(
      {
        headers,
        host: proxy.host,
        method: 'GET',
        path: target,
        port: proxy.port,
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            status: response.statusCode ?? 0,
          })
        })
      },
    )
    clientRequest.on('error', reject)
    clientRequest.end()
  })

describe('local network fixtures', () => {
  it('captures a forwarded request at both the proxy and origin without secret headers', async () => {
    const origin: HttpOriginFixture = await startHttpOrigin()
    const proxy = await startHttpProxy({ marker: 'first' })
    started.push(origin, proxy)

    const response = await requestThroughProxy(proxy, `${origin.origin}/ok?case=forwarded`)

    expect(response.status).toBe(200)
    expect(response.body).toContain('Origin response')
    expect(proxy.requests).toMatchObject([
      {
        authenticated: true,
        kind: 'HTTP',
        target: `${origin.origin}/ok?case=forwarded`,
      },
    ])
    expect(origin.requests).toMatchObject([
      {
        headers: { 'x-proxyloom-test-proxy': 'first' },
        path: '/ok?case=forwarded',
      },
    ])
    expect(JSON.stringify(proxy.requests)).not.toContain('proxy-authorization')
  })

  it('challenges once and forwards only valid proxy credentials', async () => {
    const origin = await startHttpOrigin()
    const proxy = await startHttpProxy({ password: 'secret', username: 'alice' })
    started.push(origin, proxy)

    const challenge = await requestThroughProxy(proxy, `${origin.origin}/ok`)
    const accepted = await requestThroughProxy(
      proxy,
      `${origin.origin}/ok`,
      `Basic ${Buffer.from('alice:secret').toString('base64')}`,
    )

    expect(challenge.status).toBe(407)
    expect(accepted.status).toBe(200)
    expect(proxy.requests.map((entry) => entry.authenticated)).toEqual([false, true])
    expect(origin.requests).toHaveLength(1)
    expect(JSON.stringify(proxy.requests)).not.toContain('secret')
  })

  it('accepts absolute proxy requests over an ephemeral HTTPS transport', async () => {
    const origin = await startHttpOrigin()
    const proxy = await startHttpsProxy({ marker: 'secure-transport' })
    started.push(origin, proxy)

    const response = await new Promise<string>((resolve, reject) => {
      const socket = tlsConnect(
        {
          host: proxy.host,
          port: proxy.port,
          rejectUnauthorized: false,
        },
        () => {
          socket.write(
            `GET ${origin.origin}/through-tls HTTP/1.1\r\nHost: ${new URL(origin.origin).host}\r\nConnection: close\r\n\r\n`,
          )
        },
      )
      const chunks: Buffer[] = []
      socket.on('data', (chunk: Buffer) => chunks.push(chunk))
      socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      socket.on('error', reject)
    })

    expect(response).toContain('200 OK')
    expect(proxy.requests).toMatchObject([
      {
        authenticated: true,
        kind: 'HTTP',
        target: `${origin.origin}/through-tls`,
      },
    ])
    expect(origin.requests[0]?.headers['x-proxyloom-test-proxy']).toBe('secure-transport')
  })
})
