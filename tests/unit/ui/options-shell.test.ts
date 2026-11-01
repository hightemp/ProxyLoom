import { message, runtimeState, setRuntimeResponder } from './support'

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import OptionsApp from '../../../entrypoints/options/App.vue'

afterEach(() => {
  setRuntimeResponder(() => ({ ok: true, value: null }))
  document.body.innerHTML = ''
})

const mountApp = async () => {
  setRuntimeResponder(() => ({ ok: true, value: runtimeState() }))
  Object.assign((globalThis as unknown as { chrome: object }).chrome, {
    storage: { onChanged: { addListener: () => undefined, removeListener: () => undefined } },
  })
  const wrapper = mount(OptionsApp, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('options shell', () => {
  it('names each section with its label and a decorative icon', async () => {
    const wrapper = await mountApp()
    const buttons = wrapper.get('nav').findAll('button')
    expect(buttons.map((button) => button.text())).toEqual([
      message('sectionGeneral'),
      message('sectionProxies'),
      message('sectionRules'),
      message('sectionOverrides'),
      message('sectionLogs'),
      message('sectionImportExport'),
      message('appearanceTitle'),
      message('diagnosticsTitle'),
      message('sectionHelp'),
    ])
    for (const button of buttons) {
      expect(button.get('svg').attributes('aria-hidden')).toBe('true')
    }
  })

  it('shows the section title with its subtitle and the apply status', async () => {
    const wrapper = await mountApp()
    expect(wrapper.get('.page-header h1').text()).toBe(message('sectionGeneral'))
    expect(wrapper.get('.page-header p').text()).toBe(message('sectionGeneralEyebrow'))
    expect(wrapper.get('.sidebar-status').text()).toContain(message('applyStateApplied'))
  })
})
