import { message, runtimeState } from './support'

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AppearanceSection from '../../../src/ui/options/AppearanceSection.vue'

const mountSection = () =>
  mount(AppearanceSection, {
    props: {
      busy: false,
      state: runtimeState({ appearance: { accent: 'TEAL', theme: 'DARK' } }),
    },
  })

describe('appearance section', () => {
  it('shows theme previews as pressed toggle buttons', async () => {
    const wrapper = mountSection()
    const themes = wrapper.findAll('.theme-option')
    expect(themes.map((button) => button.text())).toEqual([
      message('themeSystem'),
      message('themeLight'),
      message('themeDark'),
    ])
    expect(themes.map((button) => button.attributes('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
    ])
    expect(themes[0]!.find('.theme-preview .preview-window').exists()).toBe(true)
    await themes[1]!.trigger('click')
    expect(wrapper.emitted('command')?.[0]?.[0]).toEqual({
      appearance: { accent: 'TEAL', theme: 'LIGHT' },
      type: 'UPDATE_APPEARANCE',
    })
  })

  it('offers named accent swatches and keeps the theme when the accent changes', async () => {
    const wrapper = mountSection()
    const accents = wrapper.findAll('.accent-option')
    expect(accents.map((button) => button.attributes('aria-label'))).toEqual([
      message('accentIndigo'),
      message('accentTeal'),
      message('accentViolet'),
      message('accentRose'),
      message('accentAmber'),
      message('accentSlate'),
    ])
    expect(accents[1]!.attributes('aria-pressed')).toBe('true')
    await accents[2]!.trigger('click')
    expect(wrapper.emitted('command')?.[0]?.[0]).toEqual({
      appearance: { accent: 'VIOLET', theme: 'DARK' },
      type: 'UPDATE_APPEARANCE',
    })
  })
})
