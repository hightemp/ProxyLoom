<script setup lang="ts">
import { useFlagSrc } from '../flags/country'

const props = defineProps<{ code: string }>()
const src = useFlagSrc(() => props.code)
</script>

<template>
  <img v-if="src" class="flag" :src="src" alt="" />
  <span v-else class="flag flag-placeholder" aria-hidden="true" />
</template>

<style scoped>
.flag {
  display: inline-block;
  flex: none;
  width: 21px;
  height: 14px;
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 12%);
}

.flag-placeholder {
  background: var(--color-surface-2);
}
</style>
