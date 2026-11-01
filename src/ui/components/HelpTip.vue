<script setup lang="ts">
import { CircleHelp } from '@lucide/vue'
import { nextTick, onBeforeUnmount, shallowRef, useId } from 'vue'

import { t } from '../../i18n/messages'
import type { HelpArticleId } from '../help/articles'
import { placeFloating } from './floating'

const props = defineProps<{
  /** Short explanation shown in the popover; the default slot can add richer content. */
  text?: string
  /** Help article opened by Learn more. */
  article: HelpArticleId
  /** Open the guide in a new tab, e.g. from the popup. */
  external?: boolean
}>()

const open = shallowRef(false)
const placement = shallowRef<Record<string, string>>({})
const trigger = shallowRef<HTMLButtonElement | null>(null)
const popover = shallowRef<HTMLElement | null>(null)
const popoverId = useId()

const onDocumentPointer = (event: PointerEvent): void => {
  const target = event.target as Node | null
  if (target !== null && !popover.value?.contains(target) && !trigger.value?.contains(target)) {
    close(false)
  }
}
const onViewportChange = (event: Event): void => {
  // Scrolling the tip's own content must not close it.
  const target = event.target
  if (target instanceof Node && popover.value?.contains(target) === true) return
  close(false)
}
// Capture phase so Escape closes only the tip, not an enclosing editor dialog.
const onDocumentKeydown = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  close()
}

const close = (restoreFocus = true): void => {
  if (!open.value) return
  open.value = false
  document.removeEventListener('pointerdown', onDocumentPointer)
  document.removeEventListener('keydown', onDocumentKeydown, true)
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('resize', onViewportChange)
  if (restoreFocus) trigger.value?.focus()
}

const toggle = async (): Promise<void> => {
  if (open.value) {
    close()
    return
  }
  open.value = true
  placement.value = { position: 'fixed', visibility: 'hidden' }
  document.addEventListener('pointerdown', onDocumentPointer)
  document.addEventListener('keydown', onDocumentKeydown, true)
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)
  await nextTick()
  const anchor = trigger.value?.getBoundingClientRect()
  const size = popover.value?.getBoundingClientRect()
  if (anchor !== undefined && size !== undefined) {
    placement.value = placeFloating(anchor, size, 'start')
  }
}

onBeforeUnmount(() => close(false))

const href = `options.html#help/${props.article}`
</script>

<template>
  <span class="help-tip">
    <button
      ref="trigger"
      type="button"
      class="help-tip-trigger ghost icon-button small"
      :aria-label="t('helpMoreInfo')"
      :title="t('helpMoreInfo')"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="popoverId"
      @click.prevent="void toggle()"
    >
      <CircleHelp :size="15" aria-hidden="true" />
    </button>
    <span
      v-if="open"
      :id="popoverId"
      ref="popover"
      class="help-popover"
      role="dialog"
      :aria-label="t('helpMoreInfo')"
      :style="placement"
    >
      <span v-if="text" class="help-text">{{ text }}</span>
      <slot />
      <a :href="href" :target="external ? '_blank' : undefined" @click="close(false)">
        {{ t('helpLearnMore') }}
      </a>
    </span>
  </span>
</template>

<style scoped>
.help-tip {
  display: inline-flex;
  vertical-align: middle;
}

.help-tip-trigger {
  width: 24px;
  min-height: 24px;
  height: 24px;
  color: var(--color-muted);
}

.help-popover {
  z-index: 40;
  display: grid;
  gap: var(--space-2);
  width: min(400px, calc(100vw - 16px));
  max-height: min(70vh, 520px);
  overflow: auto;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.45;
  text-transform: none;
  letter-spacing: normal;
  white-space: normal;
}

.help-popover a {
  justify-self: start;
  font-weight: 550;
}
</style>
