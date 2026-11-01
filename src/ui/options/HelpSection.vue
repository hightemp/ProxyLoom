<script setup lang="ts">
import { ChevronRight, Search } from '@lucide/vue'
import { computed, onMounted, shallowRef, watch } from 'vue'

import { t } from '../../i18n/messages'
import { HELP_ARTICLES, type HelpArticleId } from '../help/articles'

const props = defineProps<{ article: HelpArticleId | null }>()

const query = shallowRef('')
const expanded = shallowRef<ReadonlySet<HelpArticleId>>(
  new Set(props.article === null ? [] : [props.article]),
)

const articleText = (article: (typeof HELP_ARTICLES)[number]): string =>
  [article.title, ...article.body]
    .map((key) => t(key))
    .join(' ')
    .toLocaleLowerCase()

const shown = computed(() => {
  const terms = query.value.trim().toLocaleLowerCase()
  return terms === ''
    ? HELP_ARTICLES
    : HELP_ARTICLES.filter((article) => articleText(article).includes(terms))
})

const toggle = (id: HelpArticleId): void => {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

const reveal = (id: HelpArticleId | null): void => {
  if (id === null) return
  expanded.value = new Set([...expanded.value, id])
  document.getElementById(`help-${id}`)?.scrollIntoView({ block: 'nearest' })
}

watch(() => props.article, reveal)
onMounted(() => reveal(props.article))
</script>

<template>
  <div class="stack">
    <div class="section-heading">
      <div>
        <h2>{{ t('sectionHelp') }}</h2>
        <p>{{ t('helpIntro') }}</p>
      </div>
    </div>
    <label class="search-field">
      <span class="sr-only">{{ t('helpSearch') }}</span>
      <Search :size="16" aria-hidden="true" />
      <input
        v-model="query"
        type="search"
        :placeholder="t('helpSearch')"
        :aria-label="t('helpSearch')"
      />
    </label>

    <div v-if="shown.length === 0" class="surface empty-state">
      <p>{{ t('helpNoResults') }}</p>
    </div>
    <ul v-else class="help-list">
      <li
        v-for="entry in shown"
        :id="`help-${entry.id}`"
        :key="entry.id"
        class="surface help-article"
        :data-article="entry.id"
      >
        <h3>
          <button
            type="button"
            class="article-toggle ghost"
            :aria-expanded="expanded.has(entry.id) || query !== '' ? 'true' : 'false'"
            :aria-controls="`help-body-${entry.id}`"
            @click="toggle(entry.id)"
          >
            <component :is="entry.icon" :size="18" aria-hidden="true" class="article-icon" />
            <span>{{ t(entry.title) }}</span>
            <ChevronRight :size="16" aria-hidden="true" class="chevron" />
          </button>
        </h3>
        <div
          v-if="expanded.has(entry.id) || query !== ''"
          :id="`help-body-${entry.id}`"
          class="article-body"
        >
          <p v-for="key in entry.body" :key="key">
            {{ t(key) }}
          </p>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.search-field {
  position: relative;
  display: block;
  color: var(--color-muted);
}

.search-field svg {
  position: absolute;
  top: 50%;
  left: 11px;
  transform: translateY(-50%);
}

.search-field input {
  padding-left: 34px;
}

.help-list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.help-article {
  overflow: hidden;
  scroll-margin-top: var(--space-6);
}

.help-article h3 {
  margin: 0;
}

.article-toggle {
  justify-content: flex-start;
  gap: var(--space-3);
  width: 100%;
  min-height: 52px;
  padding: 0 var(--space-4);
  border-radius: 0;
  font-size: 14.5px;
  font-weight: 600;
  white-space: normal;
  text-align: left;
}

.article-toggle span {
  flex: 1;
}

.article-icon {
  color: var(--color-primary);
}

.chevron {
  color: var(--color-muted);
  transition: transform 0.15s ease;
}

.article-toggle[aria-expanded='true'] .chevron {
  transform: rotate(90deg);
}

.article-body {
  display: grid;
  gap: var(--space-2);
  padding: 0 var(--space-4) var(--space-4) calc(var(--space-4) + 18px + var(--space-3));
  color: var(--color-muted);
  line-height: 1.55;
}
</style>
