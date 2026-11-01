import { message, runtimeMessages, runtimeState, setRuntimeResponder } from './support'

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { confirmController } from '../../../src/ui/confirm/confirm-controller'
import LogsSection from '../../../src/ui/options/LogsSection.vue'
import ProfilesSection from '../../../src/ui/options/ProfilesSection.vue'
import { endpoint, profile } from '../domain/fixtures'

afterEach(() => {
  vi.useRealTimers()
  runtimeMessages.splice(0)
  setRuntimeResponder(() => ({ ok: true, value: null }))
  if (confirmController.pending.value !== null) confirmController.answer(false)
  document.body.innerHTML = ''
})

describe('logs filters', () => {
  it('apply as you type without an Apply button and use a labelled switch for errors', async () => {
    vi.useFakeTimers()
    const wrapper = mount(LogsSection, { props: { busy: false, state: runtimeState() } })
    expect(wrapper.findAll('button').map((button) => button.text())).not.toContain(
      message('applyFilters'),
    )
    await wrapper.get('input[type="search"]').setValue('example')
    vi.advanceTimersByTime(400)
    expect(wrapper.emitted('reloadLogs')?.at(-1)?.[0]).toMatchObject({
      errorsOnly: false,
      hostname: 'example',
      offset: 0,
    })
    const toggle = wrapper.get('input[role="switch"]')
    await toggle.setValue(true)
    expect(wrapper.emitted('reloadLogs')?.at(-1)?.[0]).toMatchObject({ errorsOnly: true })
  })
})

describe('proxy rows polish', () => {
  const office = profile('office', {
    httpEndpoint: endpoint('192.0.2.1', 8080),
    name: 'Office with a long name',
    useSameProxy: true,
  })

  it('marks the global profile with a labelled icon instead of text', () => {
    const state = runtimeState({ profiles: [office] })
    const wrapper = mount(ProfilesSection, {
      props: {
        busy: false,
        state: {
          ...state,
          config: {
            ...state.config,
            general: { ...state.config.general, activeProxyProfileId: office.id },
          },
        },
      },
    })
    const marker = wrapper.get('.global-marker')
    expect(marker.text()).toBe('')
    expect(marker.attributes('aria-label')).toBe(message('globalProxyMarker'))
    expect(marker.attributes('title')).toBe(message('globalProxyMarker'))
  })

  it('animates the status while a check runs', async () => {
    let finish: (value: unknown) => void = () => undefined
    setRuntimeResponder(() => new Promise((resolve) => (finish = resolve)))
    const wrapper = mount(ProfilesSection, {
      attachTo: document.body,
      props: { busy: true, state: runtimeState({ profiles: [office] }) },
    })
    await wrapper.setProps({ busy: false })
    await wrapper
      .get(`button[aria-label="${message('checkProfileNamed', office.name)}"]`)
      .trigger('click')
    confirmController.answer(true)
    await flushPromises()
    await wrapper.setProps({ busy: true })
    const status = wrapper.get('.proxy-status')
    expect(status.text()).toContain(message('checkingNow'))
    expect(status.find('.spin').exists()).toBe(true)
    finish({ ok: true, value: null })
  })
})
