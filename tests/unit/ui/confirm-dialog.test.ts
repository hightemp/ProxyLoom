import './support'

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import ConfirmDialog from '../../../src/ui/components/ConfirmDialog.vue'
import { createConfirmController } from '../../../src/ui/confirm/confirm-controller'

const mounted: { unmount(): void }[] = []

const mountDialog = (controller = createConfirmController()) => {
  const wrapper = mount(ConfirmDialog, {
    attachTo: document.body,
    props: { controller },
  })
  mounted.push(wrapper)
  return { controller, wrapper }
}

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
})

describe('confirm controller', () => {
  it('resolves true on accept and false on cancel', async () => {
    const controller = createConfirmController()
    const accepted = controller.request({ confirmLabel: 'Go', message: 'm', title: 'T' })
    controller.answer(true)
    await expect(accepted).resolves.toBe(true)

    const cancelled = controller.request({ confirmLabel: 'Go', message: 'm', title: 'T' })
    controller.answer(false)
    await expect(cancelled).resolves.toBe(false)
    expect(controller.pending.value).toBeNull()
  })

  it('cancels a superseded request instead of leaving it unresolved', async () => {
    const controller = createConfirmController()
    const first = controller.request({ confirmLabel: 'A', message: 'a', title: 'A' })
    const second = controller.request({ confirmLabel: 'B', message: 'b', title: 'B' })
    await expect(first).resolves.toBe(false)
    expect(controller.pending.value?.title).toBe('B')
    controller.answer(true)
    await expect(second).resolves.toBe(true)
  })

  it('skips destructive confirmation only when the user disabled it', async () => {
    const controller = createConfirmController()
    await expect(
      controller.destructive({ confirmLabel: 'Delete', message: 'm', title: 'T' }, false),
    ).resolves.toBe(true)
    expect(controller.pending.value).toBeNull()

    const asked = controller.destructive({ confirmLabel: 'Delete', message: 'm', title: 'T' }, true)
    expect(controller.pending.value?.tone).toBe('danger')
    controller.answer(false)
    await expect(asked).resolves.toBe(false)
  })
})

describe('ConfirmDialog', () => {
  it('renders an accessible modal with title, message, details and code preview', async () => {
    const { controller, wrapper } = mountDialog()
    void controller.request({
      code: '^https://example\\.com/$',
      confirmLabel: 'Create',
      details: ['Action: Direct'],
      message: 'Create a temporary override?',
      title: 'Once',
    })
    await nextTick()

    const dialog = wrapper.get('dialog')
    expect(dialog.attributes('open')).toBeDefined()
    expect(dialog.attributes('aria-modal')).toBe('true')
    const title = wrapper.get(`#${dialog.attributes('aria-labelledby')}`)
    expect(title.text()).toBe('Once')
    const description = wrapper.get(`#${dialog.attributes('aria-describedby')}`)
    expect(description.text()).toContain('Create a temporary override?')
    expect(wrapper.get('code').text()).toBe('^https://example\\.com/$')
    expect(wrapper.text()).toContain('Action: Direct')
  })

  it('focuses cancel for destructive requests and confirm otherwise', async () => {
    const { controller, wrapper } = mountDialog()
    void controller.request({ confirmLabel: 'Delete', message: 'm', title: 'T', tone: 'danger' })
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('[data-confirm-cancel]').element)

    controller.answer(false)
    await nextTick()
    void controller.request({ confirmLabel: 'Create', message: 'm', title: 'T' })
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('[data-confirm-accept]').element)
  })

  it('resolves from buttons and Escape and returns focus to the opener', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { controller, wrapper } = mountDialog()

    const accepted = controller.request({ confirmLabel: 'Go', message: 'm', title: 'T' })
    await nextTick()
    await wrapper.get('[data-confirm-accept]').trigger('click')
    await expect(accepted).resolves.toBe(true)
    await nextTick()
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(document.activeElement).toBe(opener)

    const escaped = controller.request({ confirmLabel: 'Go', message: 'm', title: 'T' })
    await nextTick()
    await wrapper.get('dialog').trigger('keydown', { key: 'Escape' })
    await expect(escaped).resolves.toBe(false)
  })
})
