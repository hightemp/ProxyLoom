import { message } from './support'

import { Pencil } from '@lucide/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'

import FileInput from '../../../src/ui/components/FileInput.vue'
import IconButton from '../../../src/ui/components/IconButton.vue'
import Modal from '../../../src/ui/components/Modal.vue'
import PasswordInput from '../../../src/ui/components/PasswordInput.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('IconButton', () => {
  it('names the icon-only button and shows the same text as a tooltip', async () => {
    const wrapper = mount(IconButton, { props: { icon: Pencil, label: 'Edit Office' } })
    const button = wrapper.get('button')
    expect(button.attributes('aria-label')).toBe('Edit Office')
    expect(button.attributes('title')).toBe('Edit Office')
    expect(button.find('svg').attributes('aria-hidden')).toBe('true')
    await button.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})

describe('Modal', () => {
  it('is a labelled centered modal with a footer that closes on Escape and the close button', async () => {
    const wrapper = mount(Modal, {
      attachTo: document.body,
      props: { open: true, title: 'Edit proxy profile' },
      slots: {
        default: () => h('input', { 'aria-label': 'Name' }),
        footer: () => h('button', { type: 'button' }, 'Save'),
      },
    })
    await nextTick()
    const dialog = wrapper.get('dialog.modal')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(wrapper.get(`#${dialog.attributes('aria-labelledby')}`).text()).toBe(
      'Edit proxy profile',
    )
    expect(wrapper.get('.modal-footer').text()).toBe('Save')
    await dialog.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
    await wrapper.get(`button[aria-label="${message('close')}"]`).trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)
  })
})

describe('FileInput', () => {
  const file = new File(['192.0.2.1:8080'], 'proxies.txt', { type: 'text/plain' })

  it('opens the file picker from a real button and reports the chosen file', async () => {
    const wrapper = mount(FileInput, { props: { accept: '.txt', label: 'Proxy list file' } })
    const input = wrapper.get('input[type="file"]')
    expect(input.attributes('accept')).toBe('.txt')
    expect(input.classes()).toContain('sr-only')
    const button = wrapper.get('button')
    expect(button.text()).toBe(message('chooseFile'))
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    expect(wrapper.emitted('file')?.[0]?.[0]).toBe(file)
    expect(wrapper.text()).toContain('proxies.txt')
  })

  it('accepts a dropped file', async () => {
    const wrapper = mount(FileInput, { props: { accept: '.txt', label: 'Proxy list file' } })
    const zone = wrapper.get('.file-drop')
    await zone.trigger('dragover')
    expect(zone.classes()).toContain('dragging')
    await zone.trigger('drop', { dataTransfer: { files: [file] } })
    await flushPromises()
    expect(wrapper.emitted('file')?.[0]?.[0]).toBe(file)
    expect(zone.classes()).not.toContain('dragging')
  })
})

describe('PasswordInput', () => {
  it('toggles visibility with a pressed-state button', async () => {
    const wrapper = mount(PasswordInput, { props: { modelValue: 'secret', label: 'Password' } })
    const input = wrapper.get('input')
    expect(input.attributes('type')).toBe('password')
    expect(input.attributes('aria-label')).toBeUndefined()
    const toggle = wrapper.get('button')
    expect(toggle.attributes('aria-label')).toBe(message('showPassword'))
    expect(toggle.attributes('aria-pressed')).toBe('false')
    await toggle.trigger('click')
    expect(input.attributes('type')).toBe('text')
    expect(toggle.attributes('aria-pressed')).toBe('true')
    await input.setValue('changed')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['changed'])
  })
})
