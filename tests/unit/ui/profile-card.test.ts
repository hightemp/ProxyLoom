import { message, runtimeState } from './support'

import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import ProfilesSection from '../../../src/ui/options/ProfilesSection.vue'
import { endpoint, profile, rule } from '../domain/fixtures'

const office = profile('office', {
  httpEndpoint: {
    ...endpoint('192.0.2.1', 8443, 'HTTPS'),
    password: 'TopSecret',
    username: 'alice',
  },
  lastCheck: {
    availability: true,
    checkedAt: '2026-11-01T00:00:00.000Z' as never,
    connectDurationMs: null,
    country: 'DE',
    errorCode: null,
    externalIp: '198.51.100.7',
    httpStatus: 200,
    totalDurationMs: 707.4,
  },
  name: 'Office',
  shortName: 'OF',
  useSameProxy: true,
})
const split = profile('split', {
  httpEndpoint: endpoint('192.0.2.2', 8080),
  httpsEndpoint: endpoint('192.0.2.3', 8443, 'HTTPS'),
  name: 'Split',
  useSameProxy: false,
})

const mountSection = () => {
  const state = runtimeState({
    profiles: [office, split],
    rules: [rule('r1', 0, { action: { targetProxyProfileId: office.id, type: 'PROXY' } })],
  })
  return mount(ProfilesSection, {
    attachTo: document.body,
    props: {
      busy: false,
      state: {
        ...state,
        config: {
          ...state.config,
          general: { ...state.config.general, activeProxyProfileId: split.id },
        },
      },
    },
  })
}

const card = (wrapper: VueWrapper, name: string) =>
  wrapper.findAll('article.profile-card').find((entry) => entry.get('h3').text() === name)!

afterEach(() => {
  document.body.innerHTML = ''
})

describe('profile card', () => {
  it('summarizes endpoints, usage and the last check without the password', () => {
    const wrapper = mountSection()
    const officeCard = card(wrapper, 'Office')
    expect(officeCard.text()).toContain('OF')
    expect(officeCard.get('.endpoint-list').text()).toContain(message('allSchemes'))
    expect(officeCard.get('.endpoint-list').text()).toContain('192.0.2.1:8443')
    expect(officeCard.get('.endpoint-list').text()).toContain('alice')
    expect(officeCard.text()).toContain(message('usedByRules', '1'))
    expect(officeCard.get('.check-pill').text()).toBe(
      `${message('available')} · 707 ${message('millisecondsShort')} · 198.51.100.7 · DE`,
    )
    expect(wrapper.text()).not.toContain('TopSecret')

    const splitCard = card(wrapper, 'Split')
    expect(splitCard.findAll('.endpoint-list > div')).toHaveLength(2)
    expect(splitCard.text()).toContain(message('notUsedByRules'))
  })

  it('offers Use globally only for profiles that are not the global proxy', async () => {
    const wrapper = mountSection()
    expect(card(wrapper, 'Split').text()).toContain(message('global'))
    expect(
      card(wrapper, 'Split')
        .findAll('button')
        .map((button) => button.text()),
    ).not.toContain(message('useGlobally'))
    const use = card(wrapper, 'Office')
      .findAll('button')
      .find((button) => button.text() === message('useGlobally'))!
    await use.trigger('click')
    expect(wrapper.emitted('command')?.[0]?.[0]).toEqual({
      profileId: office.id,
      type: 'USE_PROFILE',
    })
  })

  it('keeps secondary actions in a labelled menu', async () => {
    const wrapper = mountSection()
    const trigger = card(wrapper, 'Office').get('button[aria-haspopup="menu"]')
    expect(trigger.attributes('aria-label')).toBe(message('moreActionsFor', 'Office'))
    await trigger.trigger('click')
    await nextTick()
    expect(
      card(wrapper, 'Office')
        .findAll('[role="menuitem"]')
        .map((item) => item.text()),
    ).toEqual([
      message('edit'),
      message('duplicate'),
      message('copyUrl'),
      message('copyCurl'),
      message('copyCompact'),
      message('delete'),
    ])
  })

  it('opens the editor in a labelled drawer and returns focus to the menu button', async () => {
    const wrapper = mountSection()
    const trigger = card(wrapper, 'Office').get('button[aria-haspopup="menu"]')
    await trigger.trigger('click')
    await nextTick()
    await card(wrapper, 'Office').findAll('[role="menuitem"]')[0]!.trigger('click')
    await nextTick()
    const dialog = wrapper.get('dialog.drawer')
    expect(wrapper.get(`#${dialog.attributes('aria-labelledby')}`).text()).toBe(
      message('editProxyProfile'),
    )
    const cancel = dialog.findAll('button').find((button) => button.text() === message('cancel'))!
    await cancel.trigger('click')
    await nextTick()
    await nextTick()
    expect(wrapper.find('dialog.drawer').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
  })
})
