import { message, runtimeState } from './support'

import { mount } from '@vue/test-utils'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'

import Disclosure from '../../../src/ui/components/Disclosure.vue'
import Tabs from '../../../src/ui/components/Tabs.vue'
import ProfilesSection from '../../../src/ui/options/ProfilesSection.vue'
import RulesSection from '../../../src/ui/options/RulesSection.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

const mountTabs = () =>
  mount(Tabs, {
    attachTo: document.body,
    props: {
      label: 'Editor',
      tabs: [
        { id: 'main', label: 'Main' },
        { id: 'more', label: 'More' },
        { id: 'notes', label: 'Notes' },
      ],
    },
    slots: {
      main: () => h('input', { 'aria-label': 'Name' }),
      more: () => h('input', { 'aria-label': 'Required', required: true }),
      notes: () => h('p', 'notes'),
    },
  })

describe('Tabs', () => {
  it('exposes a labelled tablist with linked panels and only the active panel visible', () => {
    const wrapper = mountTabs()
    expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe('Editor')
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map((tab) => tab.attributes('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(tabs.map((tab) => tab.attributes('tabindex'))).toEqual(['0', '-1', '-1'])
    const panels = wrapper.findAll('[role="tabpanel"]')
    expect(panels[0]!.attributes('aria-labelledby')).toBe(tabs[0]!.attributes('id'))
    expect(tabs[0]!.attributes('aria-controls')).toBe(panels[0]!.attributes('id'))
    expect(panels.map((panel) => panel.isVisible())).toEqual([true, false, false])
  })

  it('moves with arrow keys, Home and End and wraps around', async () => {
    const wrapper = mountTabs()
    const list = wrapper.get('[role="tablist"]')
    const tabs = () => wrapper.findAll('[role="tab"]')
    await list.trigger('keydown', { key: 'ArrowRight' })
    expect(tabs()[1]!.attributes('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs()[1]!.element)
    await list.trigger('keydown', { key: 'End' })
    expect(tabs()[2]!.attributes('aria-selected')).toBe('true')
    await list.trigger('keydown', { key: 'ArrowRight' })
    expect(tabs()[0]!.attributes('aria-selected')).toBe('true')
    await list.trigger('keydown', { key: 'ArrowLeft' })
    expect(tabs()[2]!.attributes('aria-selected')).toBe('true')
    await list.trigger('keydown', { key: 'Home' })
    expect(tabs()[0]!.attributes('aria-selected')).toBe('true')
  })

  it('reveals the tab that holds an invalid field so the form error is visible', async () => {
    const wrapper = mountTabs()
    const required = wrapper.get('input[aria-label="Required"]')
    required.element.dispatchEvent(new Event('invalid', { cancelable: true }))
    await nextTick()
    expect(wrapper.findAll('[role="tab"]')[1]!.attributes('aria-selected')).toBe('true')
  })
})

describe('Disclosure', () => {
  it('toggles a labelled region with aria-expanded', async () => {
    const wrapper = mount(Disclosure, {
      props: { title: 'Supported formats' },
      slots: { default: () => h('p', 'body') },
    })
    const toggle = wrapper.get('button')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[role="region"]').exists()).toBe(false)
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    const region = wrapper.get('[role="region"]')
    expect(toggle.attributes('aria-controls')).toBe(region.attributes('id'))
    expect(region.text()).toBe('body')
  })
})

describe('editors use tabs instead of details', () => {
  const sources = (directory: string): string[] =>
    readdirSync(directory).flatMap((name) => {
      const path = join(directory, name)
      return statSync(path).isDirectory() ? sources(path) : path.endsWith('.vue') ? [path] : []
    })

  it('has no <details> in extension UI', () => {
    expect(
      [...sources('src/ui'), ...sources('entrypoints')].filter((path) =>
        readFileSync(path, 'utf8').includes('<details'),
      ),
    ).toEqual([])
  })

  it('splits the rule and profile editors into tabs', async () => {
    const rules = mount(RulesSection, {
      attachTo: document.body,
      props: { busy: false, state: runtimeState() },
    })
    await rules
      .findAll('button')
      .find((button) => button.text() === message('addRule'))!
      .trigger('click')
    await nextTick()
    expect(rules.findAll('dialog [role="tab"]').map((tab) => tab.text())).toEqual([
      message('tabRule'),
      message('tabTest'),
      message('tabNotes'),
    ])

    const profiles = mount(ProfilesSection, {
      attachTo: document.body,
      props: { busy: false, state: runtimeState() },
    })
    await profiles
      .findAll('button')
      .find((button) => button.text() === message('addProfile'))!
      .trigger('click')
    await nextTick()
    expect(profiles.findAll('dialog [role="tab"]').map((tab) => tab.text())).toEqual([
      message('tabConnection'),
      message('editorAdvanced'),
    ])
  })
})
