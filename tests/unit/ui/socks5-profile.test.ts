import { message, runtimeState } from './support'

import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import ProfilesSection from '../../../src/ui/options/ProfilesSection.vue'
import ProxyLineImportPanel from '../../../src/ui/options/ProxyLineImportPanel.vue'
import { endpoint, profile } from '../domain/fixtures'

const socksAuth = profile('socks-auth', {
  httpEndpoint: {
    ...endpoint('192.0.2.5', 1080, 'SOCKS5'),
    password: 'Secret1',
    username: 'alice',
  },
  name: 'SOCKS auth',
  useSameProxy: true,
})
const socksOpen = profile('socks-open', {
  httpEndpoint: endpoint('192.0.2.6', 1080, 'SOCKS5'),
  name: 'SOCKS open',
  useSameProxy: true,
})

const mountSection = (socks5Auth: boolean) => {
  const state = runtimeState({ profiles: [socksAuth, socksOpen] })
  return mount(ProfilesSection, {
    attachTo: document.body,
    props: {
      busy: false,
      state: {
        ...state,
        diagnostics: {
          ...state.diagnostics,
          capabilities: { ...state.diagnostics.capabilities, socks5Auth },
        },
      },
    },
  })
}

const row = (wrapper: VueWrapper, name: string) =>
  wrapper.findAll('li.proxy-row').find((entry) => entry.get('h3').text() === name)!

const openEditor = async (wrapper: VueWrapper, name: string) => {
  await row(wrapper, name)
    .get(`button[aria-label="${message('editProfileNamed', name)}"]`)
    .trigger('click')
  await nextTick()
  return wrapper.get('dialog.modal')
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('SOCKS5 profiles in the Proxies section (PL-145)', () => {
  it('offers SOCKS5 as a transport and as a filter', () => {
    const wrapper = mountSection(false)
    const filter = wrapper.get('select[name="profile-transport-filter"]')
    expect(filter.findAll('option').map((option) => option.attributes('value'))).toContain('SOCKS5')
    expect(row(wrapper, 'SOCKS open').get('.badge.protocol').text()).toBe(
      message('transportSocks5'),
    )
  })

  it('marks a Chromium SOCKS5 profile with credentials as authentication unsupported', () => {
    const wrapper = mountSection(false)
    const status = row(wrapper, 'SOCKS auth').get('.socks5-auth-unsupported')
    expect(status.text()).toContain(message('socks5AuthUnsupported'))
    expect(status.attributes('title')).toBe(message('socks5AuthUnsupportedDetail'))
    expect(row(wrapper, 'SOCKS open').find('.socks5-auth-unsupported').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Secret1')
  })

  it('keeps the credentials in the editor and explains why they are not used', async () => {
    const wrapper = mountSection(false)
    const dialog = await openEditor(wrapper, 'SOCKS auth')
    const transport = dialog.get('select[name="http-endpoint-transport"]')
    expect(transport.findAll('option').map((option) => option.attributes('value'))).toEqual([
      'HTTP',
      'HTTPS',
      'SOCKS5',
    ])
    expect((transport.element as HTMLSelectElement).value).toBe('SOCKS5')
    expect(dialog.get('.socks5-auth-warning').attributes('role')).toBe('status')
    expect(dialog.get('.socks5-auth-warning').text()).toBe(message('socks5AuthUnsupportedDetail'))
    expect(dialog.text()).toContain(message('socks5DnsNote'))
    expect((dialog.get('input[type="password"]').element as HTMLInputElement).value).toBe('Secret1')
  })

  it('shows no warning where the browser supports SOCKS5 authentication', async () => {
    const wrapper = mountSection(true)
    expect(row(wrapper, 'SOCKS auth').find('.socks5-auth-unsupported').exists()).toBe(false)
    const dialog = await openEditor(wrapper, 'SOCKS auth')
    expect(dialog.find('.socks5-auth-warning').exists()).toBe(false)
  })

  it('lets proxy line import default unlabeled lines to SOCKS5', () => {
    const wrapper = mount(ProxyLineImportPanel, {
      props: { busy: false, state: runtimeState() },
    })
    const select = wrapper.get('select[name="default-transport"]')
    expect(select.findAll('option').map((option) => option.attributes('value'))).toEqual([
      'HTTP',
      'HTTPS',
      'SOCKS5',
    ])
  })
})
