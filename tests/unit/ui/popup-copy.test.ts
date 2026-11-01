import { message, runtimeState, setRuntimeResponder } from './support'

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PopupApp from '../../../entrypoints/popup/App.vue'
import { endpoint, profile } from '../domain/fixtures'

const office = profile('office', {
  httpEndpoint: { ...endpoint('192.0.2.1', 8080), password: 'pw', username: 'bob' },
  useSameProxy: true,
})

afterEach(() => {
  setRuntimeResponder(() => ({ ok: true, value: null }))
})

describe('popup copy URL', () => {
  it('copies the active global profile as a URL', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const state = runtimeState({ profiles: [office] })
    setRuntimeResponder(() => ({
      ok: true,
      value: {
        ...state,
        config: {
          ...state.config,
          general: { ...state.config.general, activeProxyProfileId: office.id },
        },
      },
    }))
    const wrapper = mount(PopupApp)
    await flushPromises()
    const copy = wrapper.findAll('button').find((button) => button.text() === message('copyUrl'))
    expect(copy).toBeDefined()
    await copy!.trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('http://bob:pw@192.0.2.1:8080')
    expect(wrapper.text()).toContain(message('copiedWithPassword'))
  })
})
