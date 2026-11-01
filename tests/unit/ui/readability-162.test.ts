import { message, runtimeState } from './support'

import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import HelpTip from '../../../src/ui/components/HelpTip.vue'
import { HELP_ARTICLES } from '../../../src/ui/help/articles'
import ProfilesSection from '../../../src/ui/options/ProfilesSection.vue'
import RegexFlagsField from '../../../src/ui/options/RegexFlagsField.vue'
import RegexTestResults from '../../../src/ui/options/RegexTestResults.vue'
import RulesSection from '../../../src/ui/options/RulesSection.vue'
import { profile, rule } from '../domain/fixtures'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('regex test results', () => {
  const rows = [
    {
      errorCode: null,
      input: 'https://example.com/path?q=1',
      matched: true,
      normalizedTarget: 'https://example.com/',
    },
    {
      errorCode: null,
      input: 'https://other.example/',
      matched: false,
      normalizedTarget: 'https://other.example/',
    },
    { errorCode: 'INVALID_URL', input: 'not a url', matched: null, normalizedTarget: null },
  ]

  it('summarizes counts and keeps each verdict next to its URL', () => {
    const wrapper = mount(RegexTestResults, { props: { elapsedMs: 16.54, rows } })
    expect(wrapper.get('.test-summary').text()).toContain(message('testSummary', ['3', '1', '1']))
    expect(wrapper.get('.test-summary').text()).toContain('16.5')
    const items = wrapper.findAll('li.test-row')
    expect(items).toHaveLength(3)
    expect(items[0]!.get('.badge').text()).toBe(message('match'))
    expect(items[0]!.get('.badge').classes()).toContain('success')
    expect(items[0]!.get('code').text()).toBe('https://example.com/path?q=1')
    expect(items[0]!.get('.tested-as').text()).toContain('https://example.com/')
    expect(items[1]!.get('.badge').text()).toBe(message('noMatch'))
    expect(items[1]!.find('.tested-as').exists()).toBe(false)
    expect(items[2]!.get('.badge').classes()).toContain('danger')
  })
})

describe('regex flags field', () => {
  it('edits the flag string through labelled switches', async () => {
    const wrapper = mount(RegexFlagsField, { props: { modelValue: 'i' } })
    const boxes = wrapper.findAll('input[type="checkbox"]')
    expect(boxes.map((box) => (box.element as HTMLInputElement).checked)).toEqual([true, false])
    expect(wrapper.text()).toContain(message('flagIgnoreCase'))
    expect(wrapper.text()).toContain(message('flagMultiline'))
    await boxes[1]!.setValue(true)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['im'])
    await wrapper.setProps({ modelValue: 'im' })
    await boxes[0]!.setValue(false)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['m'])
  })
})

describe('regex help', () => {
  it('has a basics article with a token cheat sheet', () => {
    const basics = HELP_ARTICLES.find((article) => article.id === 'regex')
    expect(basics).toBeDefined()
    expect(basics!.cheatSheet?.length).toBeGreaterThanOrEqual(8)
    for (const entry of basics!.cheatSheet ?? []) expect(message(entry.meaning)).not.toBe('')
  })

  it('renders rich tip content from a slot', async () => {
    const wrapper = mount(HelpTip, {
      attachTo: document.body,
      props: { article: 'regex' },
      slots: { default: '<table class="cheat"><tr><td>^</td></tr></table>' },
    })
    await wrapper.get('button.help-tip-trigger').trigger('click')
    await nextTick()
    expect(wrapper.find('[role="dialog"] table.cheat').exists()).toBe(true)
  })
})

describe('list toolbars', () => {
  const office = profile('office', { name: 'Office', useSameProxy: true })
  const state = runtimeState({
    profiles: [office],
    rules: [rule('a', 0, { name: 'A' }), rule('b', 1, { name: 'B' })],
  })

  const structure = (wrapper: VueWrapper) => ({
    count: wrapper.find('.list-toolbar .toolbar-count').exists(),
    search: wrapper.find('.list-toolbar .search-field').exists(),
    selection: wrapper.find('.selection-bar').exists(),
    selectAll: wrapper.get('.selection-bar button').classes(),
  })

  it('share one toolbar and selection bar layout in Proxies and Rules', async () => {
    const rules = mount(RulesSection, { attachTo: document.body, props: { busy: false, state } })
    const profiles = mount(ProfilesSection, { props: { busy: false, state } })
    expect(structure(rules)).toEqual(structure(profiles))
    expect(structure(rules)).toMatchObject({ count: true, search: true, selection: true })

    expect(rules.get('.selection-bar').classes()).not.toContain('active')
    await rules.get('.selection-bar button').trigger('click')
    const bar = rules.get('.selection-bar')
    expect(bar.classes()).toContain('active')
    expect(bar.findAll('.selection-actions button')).toHaveLength(3)
  })
})

describe('floating placement', () => {
  it('keeps a tall box inside the viewport when neither side has room', async () => {
    const { placeFloating } = await import('../../../src/ui/components/floating')
    window.innerHeight = 600
    window.innerWidth = 1000
    const anchor = new DOMRect(100, 300, 24, 24)
    const placement = placeFloating(anchor, new DOMRect(0, 0, 360, 500), 'start')
    const top = Number.parseFloat(placement.top ?? '')
    expect(top).toBeGreaterThanOrEqual(8)
    expect(top + 500).toBeLessThanOrEqual(600 - 8)
  })

  it('stays open while its own content scrolls', async () => {
    const wrapper = mount(HelpTip, {
      attachTo: document.body,
      props: { article: 'regex', text: 'Tall' },
    })
    await wrapper.get('button.help-tip-trigger').trigger('click')
    await nextTick()
    wrapper.get('[role="dialog"]').element.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })
})
