import { randomUUID } from 'node:crypto'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { createServer, type AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { asProxyProfileId, asRuleId } from '../../src/domain/types/brand'
import type { AppConfig, ProxyProfile, Rule } from '../../src/domain/types/entities'
import { createDefaultConfig } from '../../src/storage/seed/create-default-config'
import { startSocks5Proxy } from './proxies/socks5-proxy'
import { startHttpOrigin } from './servers/http-origin'
import { launchPreparedFirefox, stopAllFirefox } from './support/firefox-bidi'

// PL-145: the production Firefox build routes through local SOCKS5 fixtures (ADR-016).
const FIREFOX_BUILD = resolve('.output/firefox-mv3')
const GECKO_ID = 'proxy-routing@local.invalid'
const USER = 'synthetic-socks-user'
const PASSWORD = 'synthetic-socks-password'

const closables: { close(): Promise<void> }[] = []
const directories: string[] = []

afterEach(async () => {
  await stopAllFirefox()
  await Promise.all(closables.splice(0).map(async (fixture) => fixture.close()))
  await Promise.all(
    directories.splice(0).map(async (directory) => rm(directory, { force: true, recursive: true })),
  )
})

const closedPort = async (): Promise<number> => {
  const server = createServer()
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  await new Promise((done) => server.close(done))
  return port
}

const at = '2026-11-04T00:00:00.000Z'
const socksProfile = (
  id: string,
  port: number,
  credentials = { password: '', username: '' },
): ProxyProfile =>
  ({
    checkUrl: 'http://127.0.0.1/',
    color: '#3154D5',
    createdAt: at,
    generatedShortName: id.slice(0, 3).toUpperCase(),
    httpEndpoint: { host: '127.0.0.1', port, transport: 'SOCKS5', ...credentials },
    httpsEndpoint: { host: '127.0.0.1', port, transport: 'SOCKS5', ...credentials },
    id: asProxyProfileId(id),
    lastCheck: null,
    name: id,
    note: '',
    shortName: null,
    updatedAt: at,
    useSameProxy: true,
  }) as ProxyProfile

const hostRule = (position: number, host: string, originPort: number, profileId: string): Rule =>
  ({
    action: { targetProxyProfileId: asProxyProfileId(profileId), type: 'PROXY' },
    createdAt: at,
    description: '',
    enabled: true,
    flags: 'i',
    id: asRuleId(`rule-${profileId}`),
    matcherType: 'ORIGIN',
    name: profileId,
    pattern: `^http://${host.replaceAll('.', '\\.')}:${originPort}/$`,
    position,
    temporaryDisable: null,
    updatedAt: at,
    validity: 'VALID',
  }) as Rule

describe('Firefox production build over SOCKS5 (PL-145)', () => {
  it('routes with proxy-side DNS and ProxyInfo credentials, and fails closed', async () => {
    await access(join(FIREFOX_BUILD, 'manifest.json'))
    const origin = await startHttpOrigin()
    const open = await startSocks5Proxy()
    const auth = await startSocks5Proxy({ password: PASSWORD, username: USER })
    closables.push(origin, open, auth)
    const originPort = Number(new URL(origin.origin).port)
    const downPort = await closedPort()
    const base = createDefaultConfig()
    const config: AppConfig = {
      ...base,
      general: { ...base.general, mode: 'RULES' },
      profiles: [
        socksProfile('open', open.port),
        socksProfile('auth', auth.port, { password: PASSWORD, username: USER }),
        socksProfile('wrong', auth.port, { password: 'wrong-password', username: USER }),
        socksProfile('down', downPort),
      ],
      revision: 1,
      rules: [
        hostRule(0, 'remote.proxyloom.test', originPort, 'open'),
        hostRule(1, 'authok.proxyloom.test', originPort, 'auth'),
        hostRule(2, 'wrong.proxyloom.test', originPort, 'wrong'),
        hostRule(3, 'down.proxyloom.test', originPort, 'down'),
      ],
    }

    const directory = await mkdtemp(join(process.cwd(), '.proxyloom-firefox-socks5-'))
    directories.push(directory)
    const uuid = randomUUID()
    const launched = await launchPreparedFirefox({
      directory,
      extensionDirectories: [FIREFOX_BUILD],
      prefs: {
        'dom.security.https_first': false,
        'dom.security.https_first_schemeless': false,
        'dom.security.https_only_mode': false,
        'extensions.webextensions.uuids': JSON.stringify({ [GECKO_ID]: uuid }),
        // Only these resolve locally, so a hidden DIRECT fallback would reach the origin.
        'network.dns.localDomains': 'wrong.proxyloom.test,down.proxyloom.test',
        'network.proxy.type': 0,
      },
    })
    const { bidi } = launched
    try {
      // browsingContext.create hangs in headless Firefox here; the initial tab is enough.
      const tree = await bidi.send<{ contexts: { context: string }[] }>(
        'browsingContext.getTree',
        {},
      )
      const context = tree.contexts[0]?.context
      if (context === undefined) throw new Error('No Firefox browsing context.')
      const navigate = async (url: string): Promise<string | null> => {
        try {
          await bidi.send('browsingContext.navigate', { context, url, wait: 'complete' })
          return null
        } catch (error) {
          return error instanceof Error ? error.message : String(error)
        }
      }
      await navigate(`moz-extension://${uuid}/options.html`)
      await bidi.send('script.evaluate', {
        awaitPromise: true,
        expression: `browser.storage.local.set({ 'config.v1': ${JSON.stringify(config)} })`,
        target: { context },
      })

      const reached = (path: string) => origin.requests.some((request) => request.path === path)
      const deadline = Date.now() + 15_000
      let attempt = 0
      while (!reached(`/ff-open-${attempt}`) && Date.now() < deadline) {
        attempt += 1
        await navigate(`http://remote.proxyloom.test:${originPort}/ff-open-${attempt}`)
      }
      expect(reached(`/ff-open-${attempt}`)).toBe(true)
      expect(open.connections).toContainEqual(
        expect.objectContaining({
          addressType: 'DOMAIN',
          outcome: 'TUNNELED',
          target: `remote.proxyloom.test:${originPort}`,
        }),
      )

      await navigate(`http://authok.proxyloom.test:${originPort}/ff-auth`)
      expect(reached('/ff-auth')).toBe(true)
      expect(auth.connections).toContainEqual(
        expect.objectContaining({
          authMethod: 'USERNAME_PASSWORD',
          authenticated: true,
          outcome: 'TUNNELED',
          target: `authok.proxyloom.test:${originPort}`,
        }),
      )

      await navigate(`http://wrong.proxyloom.test:${originPort}/ff-wrong`)
      await navigate(`http://down.proxyloom.test:${originPort}/ff-down`)
      expect(reached('/ff-wrong')).toBe(false)
      expect(reached('/ff-down')).toBe(false)
      expect(JSON.stringify([open.connections, auth.connections])).not.toContain(PASSWORD)
    } finally {
      bidi.close()
    }
  }, 60_000)
})
