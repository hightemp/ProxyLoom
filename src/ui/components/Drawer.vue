<script setup lang="ts">
import { onMounted, shallowRef, useId, watch } from 'vue'

import { t } from '../../i18n/messages'

/** Decorative glyph; the button is named by aria-label. */
const CLOSE_GLYPH = '×'

const props = defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()

const dialog = shallowRef<HTMLDialogElement | null>(null)
const titleId = useId()

// Open right after the DOM patch so a later nextTick focus by the parent (e.g. the first field)
// is not overridden by the dialog's own initial focus.
const openDialog = (): void => {
  const element = dialog.value
  if (!props.open || element === null || element.open) return
  if (typeof element.showModal === 'function') element.showModal()
  else element.setAttribute('open', '')
}

onMounted(openDialog)
watch(() => props.open, openDialog, { flush: 'post' })

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}
</script>

<template>
  <dialog
    v-if="open"
    ref="dialog"
    class="drawer"
    aria-modal="true"
    :aria-labelledby="titleId"
    @cancel.prevent="emit('close')"
    @keydown="onKeydown"
  >
    <header class="drawer-header">
      <h3 :id="titleId">
        {{ title }}
      </h3>
      <button type="button" :aria-label="t('close')" @click="emit('close')">
        <span aria-hidden="true">{{ CLOSE_GLYPH }}</span>
      </button>
    </header>
    <div class="drawer-body">
      <slot />
    </div>
  </dialog>
</template>

<style scoped>
.drawer {
  width: min(560px, 100vw);
  max-width: 100vw;
  height: 100vh;
  max-height: 100vh;
  margin: 0 0 0 auto;
  padding: 0;
  border: 0;
  border-left: 1px solid var(--color-border);
  color: var(--color-text);
  background: var(--color-bg);
  box-shadow: -18px 0 48px rgb(0 0 0 / 28%);
}

.drawer::backdrop {
  background: rgb(10 14 26 / 45%);
}

.drawer-header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);
}

.drawer-header h3 {
  margin: 0;
}

.drawer-header button {
  min-width: 36px;
  font-size: 18px;
}

.drawer-body {
  padding: 16px 20px 24px;
}
</style>
