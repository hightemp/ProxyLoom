import { message, runtimeState } from './support'

import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ProfilesSection from '../../../src/ui/options/ProfilesSection.vue'

const open = async () => {
  const wrapper = mount(ProfilesSection, {
    attachTo: document.body,
    props: { busy: false, state: runtimeState() },
  })
  const add = wrapper.findAll('button').find((button) => button.text() === message('addProfile'))
  await add!.trigger('click')
  return wrapper
}

const fill = async (wrapper: VueWrapper, text: string) => {
  await wrapper.get('input[name="proxy-string"]').setValue(text)
  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.text() === message('fillFromString'))
  await button!.trigger('click')
}

const value = (wrapper: VueWrapper, selector: string) =>
  (wrapper.get(selector).element as HTMLInputElement).value

describe('profile editor proxy string paste', () => {
  it('fills transport, endpoint, credentials, one-endpoint mode and an empty name', async () => {
    const wrapper = await open()
    await fill(wrapper, 'https://alice:s3cret@192.0.2.10:8443')
    const endpoint = wrapper.get('fieldset.endpoint-block')
    const inputs = endpoint.findAll('input')
    expect((endpoint.get('select').element as HTMLSelectElement).value).toBe('HTTPS')
    expect(inputs.map((input) => (input.element as HTMLInputElement).value)).toEqual([
      '192.0.2.10',
      '8443',
      'alice',
      's3cret',
    ])
    expect(value(wrapper, 'input[name="proxy-string"]')).toBe('')
    expect(
      (wrapper.findAll('input[type="checkbox"]')[0]!.element as HTMLInputElement).checked,
    ).toBe(true)
    expect(value(wrapper, 'input[maxlength="256"]')).toBe('192.0.2.10:8443')
  })

  it('keeps an existing name', async () => {
    const wrapper = await open()
    await wrapper.get('input[maxlength="256"]').setValue('Office')
    await fill(wrapper, '192.0.2.10:3128')
    expect(value(wrapper, 'input[maxlength="256"]')).toBe('Office')
  })

  it('asks which reading to use for ambiguous four-field strings', async () => {
    const wrapper = await open()
    await fill(wrapper, '1.2.3.4:8080:john.doe:12345')
    const choices = wrapper.findAll('input[type="radio"][name="paste-order"]')
    expect(choices).toHaveLength(2)
    await choices[1]!.setValue(true)
    const use = wrapper.findAll('button').find((button) => button.text() === message('useReading'))
    await use!.trigger('click')
    const inputs = wrapper.get('fieldset.endpoint-block').findAll('input')
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('john.doe')
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('12345')
  })

  it('shows a localized error without echoing the pasted text', async () => {
    const wrapper = await open()
    await fill(wrapper, 'socks4://secret-user:secret-pass@proxy.example:1080')
    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toBe(message('proxyStringSocks4Unsupported'))
    expect(alert.text()).not.toContain('secret')
  })
})
