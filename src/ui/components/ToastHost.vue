<script setup lang="ts">
import { X } from '@lucide/vue'
import { t } from '../../i18n/messages'
import { toastController, type ToastController } from '../toast/toast-controller'

withDefaults(defineProps<{ controller?: ToastController }>(), {
  controller: () => toastController,
})
</script>

<template>
  <div class="toast-host">
    <div
      v-if="controller.current.value"
      :key="controller.current.value.id"
      class="toast"
      :class="{ danger: controller.current.value.error }"
      :role="controller.current.value.error ? 'alert' : 'status'"
    >
      <span>{{ controller.current.value.message }}</span>
      <button
        class="toast-close"
        type="button"
        :aria-label="t('dismissMessage')"
        @click="controller.dismiss()"
      >
        <X :size="14" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 20;
  max-width: min(440px, calc(100vw - 40px));
}

.toast {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin: 0;
  padding: 11px 14px;
  border: 1px solid var(--color-success);
  border-radius: 10px;
  color: var(--color-success-strong);
  background: var(--color-success-soft);
  box-shadow: 0 12px 32px rgb(0 0 0 / 24%);
}

.toast.danger {
  border-color: var(--color-danger);
  color: var(--color-danger);
  background: var(--color-danger-soft);
}

.toast span {
  flex: 1;
}

.toast-close {
  min-height: 0;
  padding: 0 6px;
  border: 0;
  color: inherit;
  background: transparent;
  font-size: 18px;
  line-height: 1;
}
</style>
