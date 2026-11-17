<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import ItemTile from '@/components/ItemTile.vue'
import { useFilterUrlSync } from '@/composables/useFilterUrlSync'
import { SORTS, useFilterStore } from '@/stores/filter'
import { useItemsStore } from '@/stores/items'
import { usePrefsStore } from '@/stores/prefs'

const prefs = usePrefsStore()
const filter = useFilterStore()
const items = useItemsStore()

const tabs = [
  { type: 'gif', label: 'GIFs' },
  { type: 'meme', label: 'Memes' },
  { type: 'video', label: 'Videos' },
]

const searchInput = ref(null)

// Tags and the search text are removable chips; the type is already visible as a pressed tab.
const activeFilters = computed(() => [
  ...(filter.query
    ? [{ key: 'q', label: `Search: “${filter.query}”`, remove: () => filter.clearSearch() }]
    : []),
  ...filter.tags.map((tag) => ({ key: `tag-${tag}`, label: `#${tag}`, remove: () => filter.removeTag(tag) })),
])

const resultText = computed(() => {
  const n = items.count
  const text = `${n.toLocaleString('en-GB')} ${n === 1 ? 'item' : 'items'}`
  return filter.type ? `${text} (${tabs.find((t) => t.type === filter.type).label})` : text
})

// "/" jumps to the search field unless the user is already typing somewhere.
function onKeydown(event) {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
  const el = event.target
  if (el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
  event.preventDefault()
  searchInput.value?.focus()
}

useFilterUrlSync(() => items.fetch())
onMounted(() => {
  items.fetch()
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <header class="head">
    <h1 class="page-title">GifMeCollector</h1>
  </header>

  <div class="toolbar">
    <div class="tabs" role="group" aria-label="Filter by type">
      <button
        v-for="tab in tabs"
        :key="tab.type"
        type="button"
        class="btn btn--tab"
        :aria-pressed="filter.type === tab.type"
        @click="filter.toggleType(tab.type)"
      >
        {{ tab.label }} <span class="count">{{ items.counts[tab.type] }}</span>
      </button>
    </div>

    <div class="toolbar__right">
      <form class="search" role="search" @submit.prevent>
        <label for="search" class="sr-only">Search by text or tag (press slash)</label>
        <AppIcon name="search" class="search__icon" />
        <input
          id="search"
          ref="searchInput"
          class="input search__input"
          type="search"
          placeholder="Search text or tag"
          autocomplete="off"
          :value="filter.search"
          @input="filter.setSearch($event.target.value)"
        />
        <kbd class="search__key" aria-hidden="true">/</kbd>
      </form>

      <div class="sort">
        <label for="sort" class="sr-only">Sort order</label>
        <AppIcon name="sort" class="sort__icon" />
        <select id="sort" class="input sort__select" :value="filter.sort" @change="filter.setSort($event.target.value)">
          <option v-for="(label, key) in SORTS" :key="key" :value="key">{{ label }}</option>
        </select>
      </div>

      <button
        type="button"
        class="btn btn--yellow"
        :aria-pressed="prefs.autoplay"
        aria-describedby="autoplay-hint"
        @click="prefs.toggleAutoplay()"
      >
        <span class="switch" aria-hidden="true"></span>
        <span>Autoplay<span aria-hidden="true">: {{ prefs.autoplay ? 'On' : 'Off' }}</span></span>
      </button>
      <RouterLink class="btn btn--primary" :to="{ name: 'add' }">
        <AppIcon name="plus" /> Add
      </RouterLink>
    </div>
  </div>
  <p id="autoplay-hint" class="sr-only">Plays all previews automatically.</p>
  <p v-if="prefs.reducedMotion" class="hint motion-hint">
    Your system asks for reduced motion, so autoplay always starts off.
  </p>

  <div class="results">
    <p class="results__text" role="status">
      <template v-if="items.loading && !items.items.length">Loading collection …</template>
      <template v-else-if="!items.error">{{ resultText }}</template>
    </p>
    <template v-if="activeFilters.length">
      <ul class="results__chips" aria-label="Active filters">
        <li v-for="f in activeFilters" :key="f.key">
          <button type="button" class="chip chip--blue chip--filter" :aria-label="`Remove filter ${f.label}`" @click="f.remove()">
            {{ f.label }} <AppIcon name="close" :size="14" />
          </button>
        </li>
      </ul>
    </template>
    <button v-if="filter.isFiltered" type="button" class="linkbtn" @click="filter.reset()">
      Reset all filters
    </button>
  </div>

  <p v-if="items.error" class="notice notice--error" role="alert">
    <span><AppIcon name="warn" :size="20" /> Error: {{ items.error }}</span>
    <button type="button" class="btn" @click="items.fetch()">Try again</button>
  </p>

  <ul v-else-if="items.loading && !items.items.length" class="grid" aria-hidden="true">
    <li v-for="n in 10" :key="n"><div class="skeleton"></div></li>
  </ul>

  <div v-else-if="!items.items.length" class="empty" role="status">
    <template v-if="filter.isFiltered">
      <p>No matches for this selection.</p>
      <button type="button" class="btn" @click="filter.reset()">Reset filters</button>
    </template>
    <template v-else>
      <p>Your collection is still empty.</p>
      <RouterLink class="btn btn--primary" :to="{ name: 'add' }">Add your first item</RouterLink>
    </template>
  </div>

  <template v-else>
    <ul class="grid" aria-label="Collection">
      <li v-for="item in items.items" :key="item.id">
        <ItemTile :item="item" :autoplay="prefs.autoplay" @tag="filter.toggleTag" />
      </li>
    </ul>
    <div v-if="items.hasMore" class="more">
      <button type="button" class="btn" :disabled="items.loadingMore" @click="items.fetchMore()">
        {{ items.loadingMore ? 'Loading …' : 'Load more' }}
      </button>
      <p class="hint" role="status">{{ items.items.length }} of {{ items.count }} shown</p>
    </div>
    <p v-else class="hint more" role="status">All {{ items.count }} items shown</p>
  </template>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}

/* The bar stays in view while the grid scrolls underneath. */
.toolbar {
  position: sticky;
  top: 8px;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  margin-bottom: 16px;
  padding: 10px 14px;
  background: var(--color-cream);
  border: var(--border-container);
  border-radius: 32px;
  box-shadow: 0 6px 14px -10px rgb(46 36 24 / 55%);
}

.tabs,
.toolbar__right {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.toolbar__right {
  flex: 1 1 320px;
  justify-content: flex-end;
}

.count {
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  height: 22px;
  padding: 0 7px;
  font-size: 0.8125rem;
  font-weight: 800;
  color: var(--color-on-dark);
  background: var(--color-text);
  border-radius: var(--radius-pill);
}

.search,
.sort {
  position: relative;
}

.search {
  flex: 1 1 220px;
  max-width: 320px;
}

.sort {
  flex: 0 1 200px;
}

.search__icon,
.sort__icon {
  position: absolute;
  top: 50%;
  left: 16px;
  transform: translateY(-50%);
  pointer-events: none;
}

.search__input {
  padding-left: 44px;
  padding-right: 46px;
}

.sort__select {
  padding-left: 44px;
  cursor: pointer;
}

.search__key {
  position: absolute;
  top: 50%;
  right: 14px;
  padding: 0 8px;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 800;
  background: var(--color-cream);
  border: 1.5px solid var(--color-text);
  border-radius: 8px;
  transform: translateY(-50%);
  pointer-events: none;
}

.search__input:focus ~ .search__key,
.search__input:not(:placeholder-shown) ~ .search__key {
  display: none;
}

.switch {
  position: relative;
  width: 44px;
  height: 26px;
  background: var(--color-container);
  border: var(--border-ink);
  border-radius: var(--radius-pill);
}

.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: var(--color-text);
  border-radius: 50%;
}

.btn[aria-pressed='true'] .switch {
  background: var(--color-text);
}

.btn[aria-pressed='true'] .switch::after {
  left: 20px;
  background: var(--color-orange);
}

.motion-hint {
  margin: -4px 0 12px;
}

.results {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 18px;
}

.results__text {
  min-height: 1.5em;
  font-weight: 800;
}

.results__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.chip--filter {
  min-height: 36px;
  padding: 0 12px 0 14px;
  cursor: pointer;
}

.linkbtn {
  padding: 8px 4px;
  font: inherit;
  font-weight: 800;
  color: var(--color-text);
  text-decoration: underline;
  text-underline-offset: 3px;
  background: none;
  border: 0;
  cursor: pointer;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 20px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.skeleton {
  aspect-ratio: 1;
  background: var(--color-cream);
  border: 2px dashed var(--color-orange);
  border-radius: var(--radius-tile);
}

.more,
.empty,
.status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 0 8px;
  color: var(--color-text-muted);
  font-weight: 700;
}

.empty {
  gap: 14px;
}

.notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

@media (max-width: 420px) {
  .grid {
    gap: 14px 12px;
  }
}

@media (max-width: 560px) {
  .toolbar {
    padding: 10px;
    border-radius: 28px;
  }

  .tabs {
    flex-wrap: nowrap;
    width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .toolbar__right {
    justify-content: stretch;
  }

  .search {
    flex-basis: 100%;
    max-width: none;
  }

  .sort {
    flex: 1 1 160px;
  }

  .search__key {
    display: none;
  }
}
</style>
