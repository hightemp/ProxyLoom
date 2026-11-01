<script setup lang="ts">
import { shallowRef, useId, watch } from 'vue'

import { t } from '../../i18n/messages'
import { confirmController, type ConfirmController } from '../confirm/confirm-controller'

const props = withDefaults(defineProps<{ controller?: ConfirmController }>(), {
  controller: () => confirmController,
})

const dialog = shallowRef<HTMLDialogElement | null>(null)
const accept = shallowRef<HTMLButtonElement | null>(null)
const cancel = shallowRef<HTMLButtonElement | null>(null)
const titleId = useId()
const descriptionId = useId()
let opener: HTMLElement | null = null

watch(
  () => props.controller.pending.value,
  (current, previous) => {
    if (current !== null && previous === null) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    const element = dialog.value
    if (current === null) {
      const target = opener
      opener = null
      if (target?.isConnected === true) target.focus()
      return
    }
    if (element !== null && !element.open) {
      if (typeof element.showModal === 'function') element.showModal()
      else element.setAttribute('open', '')
    }
    ;(current.tone === 'danger' ? cancel.value : accept.value)?.focus()
  },
  { flush: 'post' },
)

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    event.preventDefault()
    props.controller.answer(false)
  }
}
</script>

<template>
  <dialog
    v-if="controller.pending.value"
    ref="dialog"
    class="confirm-dialog"
    aria-modal="true"
    :aria-labelledby="titleId"
    :aria-describedby="descriptionId"
    @cancel.prevent="controller.answer(false)"
    @keydown="onKeydown"
  >
    <h2 :id="titleId">
      {{ controller.pending.value.title }}
    </h2>
    <div :id="descriptionId" class="confirm-body">
      <p>{{ controller.pending.value.message }}</p>
      <pre
        v-if="controller.pending.value.code"
      ><code>{{ controller.pending.value.code }}</code></pre>
      <ul v-if="controller.pending.value.details?.length">
        <li v-for="detail in controller.pending.value.details" :key="detail">
          {{ detail }}
        </li>
      </ul>
    </div>
    <div class="button-row confirm-actions">
      <button ref="cancel" type="button" data-confirm-cancel @click="controller.answer(false)">
        {{ t('cancel') }}
      </button>
      <button
        ref="accept"
        type="button"
        data-confirm-accept
        :class="controller.pending.value.tone === 'danger' ? 'danger' : 'primary'"
        @click="controller.answer(true)"
      >
        {{ controller.pending.value.confirmLabel }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.confirm-dialog {
  width: min(460px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: 0 18px 48px rgb(0 0 0 / 28%);
  overflow: auto;
}

.confirm-dialog::backdrop {
  background: rgb(10 14 26 / 55%);
}

h2 {
  margin: 0 0 8px;
  font-size: 18px;
}

.confirm-body {
  display: grid;
  gap: 10px;
  color: var(--color-muted);
}

.confirm-body p,
.confirm-body ul {
  margin: 0;
}

.confirm-body ul {
  padding-left: 18px;
}

pre {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--color-text);
  background: var(--color-bg);
  white-space: pre-wrap;
  word-break: break-all;
}

.confirm-actions {
  justify-content: flex-end;
  margin-top: 18px;
}
</style>
