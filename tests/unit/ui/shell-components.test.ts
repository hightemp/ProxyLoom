import { message } from './support'

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'

import OverflowMenu from '../../../src/ui/components/OverflowMenu.vue'
import ProfileChip from '../../../src/ui/components/ProfileChip.vue'
import ToastHost from '../../../src/ui/components/ToastHost.vue'
import { applyStateLabel } from '../../../src/ui/labels'
import { createToastController } from '../../../src/ui/toast/toast-controller'
import { profile } from '../domain/fixtures'

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('toasts', () => {
  it('dismisses success after a delay and keeps errors until closed', async () => {
    vi.useFakeTimers()
    const controller = createToastController()
    const wrapper = mount(ToastHost, { props: { controller } })

    controller.show('Saved.')
    await nextTick()
    expect(wrapper.get('[role="status"]').text()).toContain('Saved.')
    vi.advanceTimersByTime(6_000)
    await nextTick()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)

    controller.show('Failed.', true)
    await nextTick()
    vi.advanceTimersByTime(60_000)
    await nextTick()
    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toContain('Failed.')
    await alert.get('button').trigger('click')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('replaces the previous toast instead of stacking duplicates', async () => {
    const controller = createToastController()
    const wrapper = mount(ToastHost, { props: { controller } })
    controller.show('First.')
    controller.show('Second.')
    await nextTick()
    expect(wrapper.findAll('[role="status"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('Second.')
  })
})

describe('apply state label', () => {
  it('describes whether the configuration is applied, applying or failed', () => {
    expect(applyStateLabel(false, null)).toBe(message('applyStateApplied'))
    expect(applyStateLabel(true, null)).toBe(message('applying'))
    expect(applyStateLabel(false, 'API_ERROR: x')).toBe(message('applyStateFailed'))
  })
})

describe('ProfileChip', () => {
  it('shows the color, short name and name so color is never the only signal', () => {
    const wrapper = mount(ProfileChip, {
      props: { profile: profile('p', { color: '#C93448', name: 'Office', shortName: 'OF' }) },
    })
    expect(wrapper.text()).toContain('OF')
    expect(wrapper.text()).toContain('Office')
    expect(wrapper.get('.chip-dot').attributes('style')).toContain('rgb(201, 52, 72)')
  })

  it('renders Direct and a missing profile explicitly', () => {
    expect(mount(ProfileChip, { props: { profile: null } }).text()).toBe(message('decisionDirect'))
    expect(mount(ProfileChip, { props: { missing: true, profile: null } }).text()).toBe(
      message('missingProfile'),
    )
  })
})

describe('OverflowMenu placement', () => {
  const prototype = HTMLElement.prototype as { getBoundingClientRect: unknown }
  const originalRect = prototype.getBoundingClientRect
  afterEach(() => {
    prototype.getBoundingClientRect = originalRect
  })

  const rect = (top: number, bottom: number, right: number) =>
    ({
      bottom,
      height: bottom - top,
      left: right - 36,
      right,
      top,
      width: 36,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect

  const openAt = async (triggerRect: DOMRect) => {
    const wrapper = mount(OverflowMenu, {
      attachTo: document.body,
      props: { label: 'More' },
      slots: { default: () => [h('button', { role: 'menuitem', type: 'button' }, 'Edit')] },
    })
    const trigger = wrapper.get('button[aria-haspopup="menu"]')
    trigger.element.getBoundingClientRect = () => triggerRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      return this.getAttribute('role') === 'menu' ? rect(0, 200, 240) : triggerRect
    }
    await trigger.trigger('click')
    await nextTick()
    return wrapper.get('[role="menu"]').element as HTMLElement
  }

  it('is fixed to the viewport so scrolling containers cannot clip it', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    const menu = await openAt(rect(100, 136, 1000))
    expect(menu.style.position).toBe('fixed')
    expect(menu.style.top).toBe('140px')
    expect(menu.style.right).toBe('200px')
  })

  it('opens upwards when there is no room below the trigger', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    const menu = await openAt(rect(700, 736, 1000))
    expect(menu.style.top).toBe('496px')
  })
})

describe('OverflowMenu', () => {
  const mountMenu = () =>
    mount(OverflowMenu, {
      attachTo: document.body,
      props: { label: 'More actions for Office' },
      slots: {
        default: () => [
          h('button', { role: 'menuitem', type: 'button' }, 'Edit'),
          h('button', { role: 'menuitem', type: 'button' }, 'Delete'),
        ],
      },
    })

  it('opens with the keyboard, moves with arrows and closes on Escape back to the trigger', async () => {
    const wrapper = mountMenu()
    const trigger = wrapper.get('button[aria-haspopup="menu"]')
    expect(trigger.attributes('aria-label')).toBe('More actions for Office')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    await trigger.trigger('click')
    await nextTick()
    expect(trigger.attributes('aria-expanded')).toBe('true')
    const items = wrapper.findAll('[role="menuitem"]')
    expect(document.activeElement).toBe(items[0]!.element)
    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1]!.element)
    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
  })

  it('closes after an item is chosen', async () => {
    const wrapper = mountMenu()
    await wrapper.get('button[aria-haspopup="menu"]').trigger('click')
    await wrapper.findAll('[role="menuitem"]')[0]!.trigger('click')
    await nextTick()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })
})
