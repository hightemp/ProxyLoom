import { message, runtimeMessages, runtimeState, setRuntimeResponder } from './support'

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import ProxyLineImportPanel from '../../../src/ui/options/ProxyLineImportPanel.vue'

const mountPanel = () =>
  mount(ProxyLineImportPanel, { props: { busy: false, state: runtimeState() } })

afterEach(() => {
  runtimeMessages.splice(0)
  setRuntimeResponder(() => ({ ok: true, value: null }))
})

describe('proxy line import panel', () => {
  it('previews pasted lines with status and without passwords', async () => {
    const wrapper = mountPanel()
    await wrapper
      .get('textarea')
      .setValue('http://user:TopSecret@192.0.2.1:8080\n# comment\nnot a proxy')
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain(message('importStatusNew'))
    expect(rows[0]!.text()).toContain('192.0.2.1:8080')
    expect(rows[0]!.text()).toContain('user')
    expect(rows[1]!.text()).toContain(message('importStatusError'))
    expect(rows[1]!.text()).toContain(message('proxyStringFormat'))
    expect(wrapper.text()).not.toContain('TopSecret')
  })

  it('applies the default protocol and the field order for ambiguous lines', async () => {
    const wrapper = mountPanel()
    await wrapper.get('textarea').setValue('1.2.3.4:8080:john.doe:12345')
    expect(wrapper.get('tbody tr').text()).toContain('HTTP 1.2.3.4:8080')
    await wrapper.get('select[name="default-transport"]').setValue('HTTPS')
    await wrapper.get('select[name="field-order"]').setValue('CREDENTIALS_FIRST')
    expect(wrapper.get('tbody tr').text()).toContain('HTTPS john.doe:12345')
  })

  it('imports through the background and reports the counts', async () => {
    setRuntimeResponder(() => ({ ok: true, value: { created: 2, skipped: 1, updated: 0 } }))
    const wrapper = mountPanel()
    const text = '192.0.2.1:8080\n192.0.2.2:8080\nbroken'
    await wrapper.get('textarea').setValue(text)
    const importButton = wrapper
      .findAll('button')
      .find((button) => button.text() === message('importProxies', '2'))
    expect(importButton).toBeDefined()
    await importButton!.trigger('click')
    await flushPromises()

    expect(runtimeMessages.at(-1)).toEqual({
      options: { defaultTransport: 'HTTP', fieldOrder: 'HOST_FIRST' },
      text,
      type: 'APPLY_PROXY_LINES',
    })
    expect(wrapper.emitted('status')?.[0]?.[0]).toBe(message('proxyImportResult', ['2', '0', '1']))
    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })

  it('refuses files larger than the import limit', async () => {
    const wrapper = mountPanel()
    const input = wrapper.get('input[type="file"]')
    const big = new File(['x'.repeat(1024 * 1024 + 1)], 'big.txt', { type: 'text/plain' })
    Object.defineProperty(input.element, 'files', { value: [big] })
    await input.trigger('change')
    await flushPromises()
    expect(wrapper.text()).toContain(message('errorInputTooLarge'))
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('')
  })
})
