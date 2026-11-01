import { message, runtimeMessages, runtimeState, setRuntimeResponder } from './support'

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import { confirmController } from '../../../src/ui/confirm/confirm-controller'
import ProfilesSection from '../../../src/ui/options/ProfilesSection.vue'
import { endpoint, profile, rule } from '../domain/fixtures'

const office = profile('office', {
  httpEndpoint: endpoint('10.0.0.1', 8080),
  name: 'Office',
  useSameProxy: true,
})
const home = profile('home', {
  httpEndpoint: endpoint('proxy.example', 8443, 'HTTPS'),
  name: 'Home',
  useSameProxy: true,
})
const lab = profile('lab', {
  httpEndpoint: endpoint('10.0.0.3', 3128),
  name: 'Lab',
  useSameProxy: true,
})

const mountSection = () =>
  mount(ProfilesSection, {
    attachTo: document.body,
    props: {
      busy: false,
      state: runtimeState({
        profiles: [office, home, lab],
        rules: [rule('r1', 0, { action: { targetProxyProfileId: home.id, type: 'PROXY' } })],
      }),
    },
  })

const headings = (wrapper: VueWrapper) => wrapper.findAll('h3').map((heading) => heading.text())
const button = (wrapper: VueWrapper, text: string) => {
  const found = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (found === undefined) throw new Error(`Button not found: ${text}`)
  return found
}

afterEach(() => {
  if (confirmController.pending.value !== null) confirmController.answer(false)
  runtimeMessages.splice(0)
  setRuntimeResponder(() => ({ ok: true, value: null }))
  document.body.innerHTML = ''
})

describe('profile list search and bulk actions', () => {
  it('searches by name or host and filters by transport', async () => {
    const wrapper = mountSection()
    await wrapper.get('input[type="search"]').setValue('10.0.0')
    expect(headings(wrapper)).toEqual(['Office', 'Lab'])
    await wrapper.get('input[type="search"]').setValue('')
    await wrapper.get('select[name="profile-transport-filter"]').setValue('HTTPS')
    expect(headings(wrapper)).toEqual(['Home'])
    expect(wrapper.text()).toContain(message('showingCount', ['1', '3']))
  })

  it('selects shown profiles and deletes them after an impact preview', async () => {
    const wrapper = mountSection()
    await wrapper.get('input[type="search"]').setValue('o')
    await button(wrapper, message('selectAllShown')).trigger('click')
    await button(wrapper, message('deleteSelected', '2')).trigger('click')
    expect(confirmController.pending.value).toMatchObject({ tone: 'danger' })
    expect(confirmController.pending.value?.details).toContain(
      message('deleteProfileImpactRules', '1'),
    )
    confirmController.answer(true)
    await flushPromises()
    expect(wrapper.emitted('command')?.[0]?.[0]).toEqual({
      profileIds: [office.id, home.id],
      type: 'DELETE_PROFILES',
    })
  })

  it('checks selected profiles one after another and can stop', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined
    setRuntimeResponder((request) =>
      (request as { type: string }).type === 'CHECK_PROFILE' &&
      runtimeMessages.filter((entry) => (entry as { type: string }).type === 'CHECK_PROFILE')
        .length === 1
        ? new Promise((resolve) => {
            resolveFirst = resolve
          })
        : { ok: true, value: null },
    )
    const wrapper = mountSection()
    const boxes = wrapper.findAll('input[name="profile-select"]')
    await boxes[0]!.setValue(true)
    await boxes[2]!.setValue(true)
    await button(wrapper, message('checkSelected', '2')).trigger('click')
    expect(confirmController.pending.value?.title).toBe(message('manualCheckTitle'))
    confirmController.answer(true)
    await flushPromises()
    expect(wrapper.text()).toContain(message('checkingProgress', ['1', '2']))

    await button(wrapper, message('stopChecks')).trigger('click')
    resolveFirst({ ok: true, value: null })
    await flushPromises()
    const checks = runtimeMessages.filter(
      (entry) => (entry as { type: string }).type === 'CHECK_PROFILE',
    )
    expect(checks).toEqual([{ profileId: office.id, type: 'CHECK_PROFILE' }])
    expect(runtimeMessages).toContainEqual({ type: 'CANCEL_PROXY_CHECK' })
    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })
})
