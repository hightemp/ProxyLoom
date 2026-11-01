<script setup lang="ts">
import { t } from '../../i18n/messages'
import { REGEX_CHEAT_SHEET } from './articles'
</script>

<template>
  <table class="cheat-sheet">
    <thead>
      <tr>
        <th scope="col">
          {{ t('regexToken') }}
        </th>
        <th scope="col">
          {{ t('regexMeaning') }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="entry in REGEX_CHEAT_SHEET" :key="entry.token">
        <td>
          <code>{{ entry.token }}</code>
        </td>
        <td>{{ t(entry.meaning) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.cheat-sheet {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.cheat-sheet th,
.cheat-sheet td {
  padding: 4px 8px 4px 0;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  vertical-align: top;
}

.cheat-sheet th {
  color: var(--color-muted);
  font-size: 11.5px;
  font-weight: 600;
}

.cheat-sheet tbody tr:last-child td {
  border-bottom: 0;
}

.cheat-sheet tbody tr:hover {
  background: none;
}

.cheat-sheet code {
  white-space: nowrap;
  color: var(--color-primary);
  font-weight: 600;
}
</style>
