<script setup lang="ts">
import type { ProxyProfile } from '../../domain/types/entities'
import { t } from '../../i18n/messages'

defineProps<{
  profile: ProxyProfile | null
  /** A proxy route whose profile no longer exists; never shown as Direct. */
  missing?: boolean
}>()
</script>

<template>
  <span v-if="profile" class="profile-chip">
    <span class="chip-dot" :style="{ backgroundColor: profile.color }" aria-hidden="true" />
    <span class="chip-short">{{ profile.shortName ?? profile.generatedShortName }}</span>
    <span class="chip-name">{{ profile.name }}</span>
  </span>
  <span v-else-if="missing" class="profile-chip danger">{{ t('missingProfile') }}</span>
  <span v-else class="profile-chip direct">{{ t('decisionDirect') }}</span>
</template>

<style scoped>
.profile-chip {
  display: inline-flex;
  max-width: 100%;
  gap: 6px;
  align-items: center;
  padding: 2px 8px 2px 6px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text);
  font-size: 12px;
  line-height: 18px;
  vertical-align: middle;
}

.profile-chip.direct {
  padding-left: 8px;
  color: var(--color-muted);
}

.profile-chip.danger {
  padding-left: 8px;
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.chip-dot {
  width: 9px;
  height: 9px;
  flex: none;
  border-radius: 50%;
}

.chip-short {
  font-weight: 700;
  letter-spacing: 0.02em;
}

.chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
