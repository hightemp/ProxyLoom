import { message, runtimeState } from './support'

import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import ProfilesSection from '../../../src/ui/options/ProfilesSection.vue'
import { endpoint, profile, rule } from '../domain/fixtures'

const longUser = `user-${'x'.repeat(120)}`
const office = profile('office', {
  httpEndpoint: {
    ...endpoint('very-long-hostname-for-a-proxy-provider.example.com', 8443, 'HTTPS'),
    password: 'TopSecret',
    username: longUser,
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

const row = (wrapper: VueWrapper, name: string) =>
  wrapper.findAll('li.proxy-row').find((entry) => entry.get('h3').text() === name)!

afterEach(() => {
  document.body.innerHTML = ''
})

describe('proxy rows', () => {
  it('shows endpoint, user, usage and check status and truncates long values with a tooltip', () => {
    const wrapper = mountSection()
    const officeRow = row(wrapper, 'Office')
    expect(officeRow.text()).toContain('OF')
    const host = officeRow.get('.proxy-endpoint .truncate')
    expect(host.text()).toBe('very-long-hostname-for-a-proxy-provider.example.com:8443')
    expect(host.attributes('title')).toBe(host.text())
    const user = officeRow.get('.proxy-user .truncate')
    expect(user.text()).toBe(longUser)
    expect(user.attributes('title')).toBe(longUser)
    expect(officeRow.text()).toContain(message('usedByRules', '1'))
    expect(officeRow.get('.proxy-status').text()).toContain('707')
    expect(wrapper.text()).not.toContain('TopSecret')
    expect(row(wrapper, 'Split').findAll('.proxy-endpoint .truncate')).toHaveLength(2)
  })

  it('offers Edit, Use globally and Check as named one-click buttons', async () => {
    const wrapper = mountSection()
    const officeRow = row(wrapper, 'Office')
    expect(
      officeRow.find(`button[aria-label="${message('editProfileNamed', 'Office')}"]`).exists(),
    ).toBe(true)
    expect(
      officeRow.find(`button[aria-label="${message('checkProfileNamed', 'Office')}"]`).exists(),
    ).toBe(true)
    await officeRow
      .get(`button[aria-label="${message('useProfileGloballyNamed', 'Office')}"]`)
      .trigger('click')
    expect(wrapper.emitted('command')?.[0]?.[0]).toEqual({
      profileId: office.id,
      type: 'USE_PROFILE',
    })
    expect(row(wrapper, 'Split').find('.global-marker').exists()).toBe(true)
    expect(
      row(wrapper, 'Split')
        .find(`button[aria-label="${message('useProfileGloballyNamed', 'Split')}"]`)
        .exists(),
    ).toBe(false)
  })

  it('keeps less frequent actions in the menu', async () => {
    const wrapper = mountSection()
    await row(wrapper, 'Office').get('button[aria-haspopup="menu"]').trigger('click')
    await nextTick()
    expect(
      row(wrapper, 'Office')
        .findAll('[role="menuitem"]')
        .map((item) => item.text()),
    ).toEqual([
      message('duplicate'),
      message('copyUrl'),
      message('copyCurl'),
      message('copyCompact'),
      message('delete'),
    ])
  })

  it('opens the editor as a centered modal and returns focus to the Edit button', async () => {
    const wrapper = mountSection()
    const edit = row(wrapper, 'Office').get(
      `button[aria-label="${message('editProfileNamed', 'Office')}"]`,
    )
    ;(edit.element as HTMLButtonElement).focus()
    await edit.trigger('click')
    await nextTick()
    const dialog = wrapper.get('dialog.modal')
    expect(wrapper.get(`#${dialog.attributes('aria-labelledby')}`).text()).toBe(
      message('editProxyProfile'),
    )
    expect(dialog.find('input[type="password"]').exists()).toBe(true)
    const cancel = dialog.findAll('button').find((button) => button.text() === message('cancel'))!
    await cancel.trigger('click')
    await nextTick()
    await nextTick()
    expect(wrapper.find('dialog.modal').exists()).toBe(false)
    expect(document.activeElement).toBe(edit.element)
  })
})
