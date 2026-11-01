import { message } from './support'

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import HelpTip from '../../../src/ui/components/HelpTip.vue'
import { HELP_ARTICLES } from '../../../src/ui/help/articles'
import HelpSection from '../../../src/ui/options/HelpSection.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('help articles', () => {
  it('have a localized title and at least one localized paragraph each', () => {
    expect(HELP_ARTICLES.length).toBeGreaterThanOrEqual(8)
    for (const article of HELP_ARTICLES) {
      expect(message(article.title), article.id).not.toBe('')
      expect(article.body.length, article.id).toBeGreaterThan(0)
      for (const key of article.body) expect(message(key), key).not.toBe('')
    }
  })
})

describe('HelpTip', () => {
  const mountTip = () =>
    mount(HelpTip, {
      attachTo: document.body,
      props: { article: 'rules', text: 'Rules are checked from top to bottom.' },
    })

  it('reveals a short explanation from a labelled button and links to the article', async () => {
    const wrapper = mountTip()
    const button = wrapper.get('button.help-tip-trigger')
    expect(button.attributes('aria-label')).toBe(message('helpMoreInfo'))
    expect(button.attributes('aria-expanded')).toBe('false')
    await button.trigger('click')
    await nextTick()
    expect(button.attributes('aria-expanded')).toBe('true')
    const popover = wrapper.get('[role="dialog"]')
    expect(button.attributes('aria-controls')).toBe(popover.attributes('id'))
    expect(popover.text()).toContain('Rules are checked from top to bottom.')
    const link = popover.get('a')
    expect(link.text()).toBe(message('helpLearnMore'))
    expect(link.attributes('href')).toBe('options.html#help/rules')
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const wrapper = mountTip()
    const button = wrapper.get('button.help-tip-trigger')
    await button.trigger('click')
    await nextTick()
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(button.element)
  })
})

describe('Help section', () => {
  it('lists every article and opens the requested one', () => {
    const wrapper = mount(HelpSection, { props: { article: 'once' } })
    const items = wrapper.findAll('[data-article]')
    expect(items).toHaveLength(HELP_ARTICLES.length)
    const open = wrapper.get('[data-article="once"]')
    expect(open.attributes('aria-expanded') ?? open.get('button').attributes('aria-expanded')).toBe(
      'true',
    )
    expect(open.text()).toContain(message('helpOnceBody1'))
  })

  it('filters articles by a search over titles and text', async () => {
    const wrapper = mount(HelpSection, { props: { article: null } })
    await wrapper.get('input[type="search"]').setValue('regular expression')
    const visible = wrapper.findAll('[data-article]').map((item) => item.attributes('data-article'))
    expect(visible).toContain('rules')
    expect(visible).not.toContain('appearance')
    await wrapper.get('input[type="search"]').setValue('zzzz-no-match')
    expect(wrapper.text()).toContain(message('helpNoResults'))
  })
})
