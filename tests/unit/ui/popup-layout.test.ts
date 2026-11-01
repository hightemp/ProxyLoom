import { message, runtimeMessages, runtimeState, setRuntimeResponder } from './support'

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PopupApp from '../../../entrypoints/popup/App.vue'
import type { AppRuntimeState } from '../../../src/application/runtime/contracts'
import { endpoint, profile, rule } from '../domain/fixtures'

const office = profile('office', {
  httpEndpoint: endpoint('192.0.2.1', 8080),
  lastCheck: {
    availability: true,
    checkedAt: '2026-11-01T00:00:00.000Z' as never,
    connectDurationMs: null,
    country: 'DE',
    errorCode: null,
    downloadMbps: null,
    speedErrorCode: null,
    externalIp: '192.0.2.99',
    httpStatus: 200,
    totalDurationMs: 707,
  },
  name: 'Office',
  shortName: 'OF',
  useSameProxy: true,
})
const work = rule('work', 0, {
  action: { targetProxyProfileId: office.id, type: 'PROXY' },
  name: 'Work sites',
})

const popupState = (): AppRuntimeState => {
  const base = runtimeState({ profiles: [office], rules: [work] })
  return {
    ...base,
    activeTabId: 3,
    config: {
      ...base.config,
      general: { ...base.config.general, activeProxyProfileId: office.id, mode: 'RULES' },
    },
    inspection: {
      controlStatus: 'CONTROLLED_BY_THIS_EXTENSION',
      decision: {
        action: 'PROXY',
        endpoint: office.httpEndpoint,
        errorCode: null,
        matchedOverrideId: null,
        matchedRuleId: work.id,
        normalizedTarget: 'https://shop.example.org/',
        profileId: office.id,
        source: 'RULE',
        targetScheme: 'https',
        trace: [],
      },
      hostname: 'shop.example.org',
      platform: 'CHROMIUM',
      scopeWarning: 'CHROMIUM_ORIGIN_SCOPE',
      supported: true,
    },
  }
}

const mountPopup = async () => {
  setRuntimeResponder(() => ({ ok: true, value: popupState() }))
  const wrapper = mount(PopupApp, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

afterEach(() => {
  runtimeMessages.splice(0)
  setRuntimeResponder(() => ({ ok: true, value: null }))
  document.body.innerHTML = ''
})

describe('popup layout', () => {
  it('leads with the current site, its route as a profile chip and the rule that decided it', async () => {
    const wrapper = await mountPopup()
    const hero = wrapper.get('.current-site')
    expect(hero.get('h1').text()).toBe('shop.example.org')
    expect(hero.text()).toContain('OF')
    expect(hero.text()).toContain('Office')
    expect(hero.text()).toContain(message('sourceRuleNamed', 'Work sites'))
  })

  it('explains the selected mode', async () => {
    const wrapper = await mountPopup()
    expect(wrapper.text()).toContain(message('modeDescriptionRules'))
  })

  it('shows the last check of the global profile', async () => {
    const wrapper = await mountPopup()
    expect(wrapper.get('.global-status').text()).toContain(message('available'))
    expect(wrapper.get('.global-status').text()).toContain('707')
    expect(wrapper.get('.global-status .check-country').text()).toBe('Germany')
    await vi.waitFor(() => expect(wrapper.find('.global-status img.flag').exists()).toBe(true))
  })

  it('creates a Once route to a profile from a single route selector', async () => {
    const wrapper = await mountPopup()
    await wrapper.get('select[name="site-route"]').setValue(`PROFILE:${office.id}`)
    setRuntimeResponder((request) =>
      (request as { type: string }).type === 'PREVIEW_SITE_ACTION'
        ? {
            ok: true,
            value: {
              chromiumScopeWarning: true,
              generatedPattern: '^x$',
              originKey: 'shop.example.org',
              platformScope: 'ORIGIN',
            },
          }
        : { ok: true, value: popupState() },
    )
    const once = wrapper.findAll('button').find((button) => button.text() === message('once'))
    await once!.trigger('click')
    await flushPromises()
    ;(document.querySelector('[data-confirm-accept]') as HTMLButtonElement).click()
    await flushPromises()
    expect(runtimeMessages).toContainEqual({
      action: { targetProxyProfileId: office.id, type: 'PROXY' },
      scope: 'EXACT_HOSTNAME',
      type: 'CREATE_OVERRIDE',
    })
  })

  it('links to settings and logs in the footer', async () => {
    const wrapper = await mountPopup()
    const footer = wrapper.get('footer')
    await footer
      .findAll('button')
      .find((button) => button.text() === message('logsLink'))!
      .trigger('click')
    await flushPromises()
    expect(runtimeMessages).toContainEqual({ section: 'logs', type: 'OPEN_SETTINGS' })
    expect(footer.text()).toContain(message('openSettings'))
  })
})
