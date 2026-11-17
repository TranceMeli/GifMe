<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import PageCrumbs from '@/components/PageCrumbs.vue'
import StatusMessage from '@/components/StatusMessage.vue'
import { useFilterStore } from '@/stores/filter'
import { useItemsStore } from '@/stores/items'
import { copyItem, copyLink } from '@/utils/clipboard'
import { formatDate, formatDimensions, formatSize, TYPE_LABELS } from '@/utils/format'

const props = defineProps({ id: { type: String, required: true } })

const router = useRouter()
const filter = useFilterStore()
const store = useItemsStore()

const item = computed(() => store.current)
const PLURAL = { gif: 'GIFs', meme: 'Memes', video: 'Videos' }
const crumbs = computed(() => {
  const home = { label: 'Collection', to: { name: 'items', query: filter.urlQuery } }
  if (!item.value) return [home]
  return [
    home,
    { label: PLURAL[item.value.type], to: { name: 'items', query: { type: item.value.type } } },
    { label: item.value.title || 'Untitled' },
  ]
})
const title = ref('')
const source = ref('')
const newTag = ref('')
const message = ref({ text: '', error: false })
const confirmDialog = ref(null)
const deleting = ref(false)

function say(text, error = false) {
  message.value = { text, error }
}

watch(
  () => props.id,
  async (id) => {
    say('')
    const loaded = await store.get(id)
    if (loaded) {
      title.value = loaded.title
      source.value = loaded.source_url
    }
  },
  { immediate: true },
)

async function save(patch, okText = 'Saved.') {
  try {
    await store.update(item.value.id, patch)
    title.value = item.value.title
    source.value = item.value.source_url
    say(okText)
    return true
  } catch (err) {
    say(err.message, true)
    // Restore the fields from the last saved state.
    title.value = item.value.title
    source.value = item.value.source_url
    return false
  }
}

function saveTitle() {
  const value = title.value.trim()
  if (value !== item.value.title) save({ title: value })
}

function saveSource() {
  const value = source.value.trim()
  if (value !== item.value.source_url) save({ source_url: value })
}

function setType(type) {
  if (type !== item.value.type) save({ type })
}

// Videos stay videos and images stay images; only gif and meme can be swapped.
function typeDisabled(type) {
  return (type === 'video') !== (item.value.type === 'video')
}

async function addTag() {
  const names = newTag.value.split(',').map((t) => t.trim()).filter(Boolean)
  newTag.value = ''
  if (!names.length) return
  await save({ tags: [...item.value.tags, ...names] }, 'Tag added.')
}

function removeTag(name) {
  save({ tags: item.value.tags.filter((t) => t !== name) }, `Tag #${name} removed.`)
}

async function toggleFavorite() {
  try {
    await store.toggleFavorite(item.value.id)
    say(item.value.is_favorite ? 'Added to favorites.' : 'Removed from favorites.')
  } catch (err) {
    say(err.message, true)
  }
}

async function runCopy(action) {
  try {
    say(await action(item.value))
  } catch {
    say('Copying was blocked by the browser. Please check the clipboard permission.', true)
  }
}

function onTagKey(event) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    addTag()
  }
}

function askDelete() {
  confirmDialog.value?.showModal()
}

async function confirmDelete() {
  deleting.value = true
  try {
    await store.remove(item.value.id)
    confirmDialog.value?.close()
    router.push({ name: 'items', query: filter.urlQuery })
  } catch (err) {
    confirmDialog.value?.close()
    say(err.message, true)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <header class="head">
    <PageCrumbs :items="crumbs" />
    <p class="page-title" aria-hidden="true">GifMeCollector</p>
  </header>

  <p v-if="store.error" class="notice notice--error" role="alert">
    <AppIcon name="warn" :size="20" /> Error: {{ store.error }}
  </p>
  <p v-else-if="!item" class="status" role="status">Loading …</p>

  <div v-else class="detail">
    <section class="detail__media" aria-label="Preview">
      <div class="preview">
        <video v-if="item.type === 'video'" :src="item.file_url" :poster="item.thumbnail_url || undefined" controls loop playsinline />
        <img v-else :src="item.file_url" :alt="item.title || `Untitled ${TYPE_LABELS[item.type]}`" />
        <span class="preview__badge">{{ TYPE_LABELS[item.type].toUpperCase() }}</span>
      </div>

      <div class="actions">
        <button type="button" class="btn btn--primary" @click="runCopy(copyItem)">
          <AppIcon name="copy" /> Copy to clipboard
        </button>
        <button type="button" class="btn" @click="runCopy(copyLink)">
          <AppIcon name="link" /> Copy link
        </button>
        <a class="btn" :href="item.file_url" download>
          <AppIcon name="download" /> Download
        </a>
        <button type="button" class="btn btn--yellow" :aria-pressed="item.is_favorite" @click="toggleFavorite">
          <AppIcon name="star" /> Favorite
        </button>
      </div>
      <StatusMessage class="feedback" :text="message.text" :error="message.error" />
    </section>

    <section class="detail__form" aria-label="Properties">
      <div class="field">
        <label for="title">Title <span class="optional">(optional)</span></label>
        <input
          id="title"
          v-model="title"
          class="input"
          type="text"
          maxlength="200"
          placeholder="Title (optional)"
          @blur="saveTitle"
          @keydown.enter.prevent="$event.target.blur()"
        />
      </div>

      <div class="field">
        <span id="type-label" class="field-label">Type</span>
        <div class="pills" role="group" aria-labelledby="type-label">
          <button
            v-for="(label, type) in TYPE_LABELS"
            :key="type"
            type="button"
            class="btn pill"
            :aria-pressed="item.type === type"
            :disabled="typeDisabled(type)"
            :title="typeDisabled(type) ? 'Does not match the file content' : undefined"
            @click="setType(type)"
          >
            {{ label }}
          </button>
        </div>
        <span class="hint">GIF and meme can be swapped, videos stay videos.</span>
      </div>

      <div class="field">
        <label for="new-tag">Tags <span class="optional">(optional)</span></label>
        <ul v-if="item.tags.length" class="tags" aria-label="Assigned tags">
          <li v-for="tag in item.tags" :key="tag" class="chip chip--blue tag">
            #{{ tag }}
            <button type="button" class="tag__remove" :aria-label="`Remove tag #${tag}`" @click="removeTag(tag)">
              <AppIcon name="close" :size="14" />
            </button>
          </li>
        </ul>
        <input
          id="new-tag"
          v-model="newTag"
          class="input"
          type="text"
          maxlength="100"
          placeholder="Add a tag and press Enter"
          @keydown="onTagKey"
        />
      </div>

      <div class="field">
        <label for="source">Source <span class="optional">(optional)</span></label>
        <input
          id="source"
          v-model="source"
          class="input"
          type="url"
          placeholder="https:// (optional)"
          @blur="saveSource"
          @keydown.enter.prevent="$event.target.blur()"
        />
      </div>

      <p class="hint">Changes are saved when you leave a field.</p>

      <dl class="meta">
        <div><dt>Dimensions</dt><dd>{{ formatDimensions(item) }}</dd></div>
        <div><dt>Size</dt><dd>{{ formatSize(item.size_bytes) }}</dd></div>
        <div><dt>Added</dt><dd>{{ formatDate(item.created_at) }}</dd></div>
      </dl>

      <!-- Editing and deleting sit apart so a stray click does not destroy anything. -->
      <div class="danger-row">
        <RouterLink
          v-if="item.type !== 'video'"
          class="btn btn--blue"
          :to="{ name: 'edit', params: { id: item.id } }"
        >
          <AppIcon name="edit" /> Edit
        </RouterLink>
        <button type="button" class="btn btn--danger" @click="askDelete">
          <AppIcon name="trash" /> Delete
        </button>
      </div>
    </section>

    <dialog ref="confirmDialog" class="dialog" aria-labelledby="delete-title">
      <h2 id="delete-title">Delete “{{ item.title || 'Untitled' }}”?</h2>
      <p>
        This permanently removes the item and its files from this computer. This cannot be
        undone.
        <template v-if="item.type !== 'video'">Only want it to look different? Editing is the better choice.</template>
      </p>
      <div class="dialog__actions">
        <button type="button" class="btn" @click="confirmDialog.close()">Cancel</button>
        <RouterLink v-if="item.type !== 'video'" class="btn btn--blue" :to="{ name: 'edit', params: { id: item.id } }">
          <AppIcon name="edit" /> Edit
        </RouterLink>
        <button type="button" class="btn btn--danger" :disabled="deleting" @click="confirmDelete">
          Delete permanently
        </button>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 28px;
}

.detail {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 32px;
  align-items: start;
}

.preview {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 220px;
  overflow: hidden;
  background: var(--color-blue);
  border: var(--border-ink);
  border-radius: 32px;
}

.preview img,
.preview video {
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
}

.preview__badge {
  position: absolute;
  top: 14px;
  left: 14px;
  padding: 2px 12px;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--color-on-dark);
  background: var(--color-text);
  border-radius: var(--radius-pill);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
}

.danger-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  padding-top: 18px;
  border-top: 2px dashed var(--color-orange);
}

.feedback {
  margin-top: 14px;
}

.detail__form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.pill {
  min-width: 72px;
  padding: 0 18px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 4px;
  padding: 0;
  list-style: none;
}

.tag {
  min-height: 36px;
  padding-right: 4px;
}

.tag__remove {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

.tag__remove:hover {
  background: rgb(46 36 24 / 15%);
}

.meta {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 16px 20px;
  background: var(--color-cream);
  border-radius: 24px;
}

.meta div {
  display: grid;
  grid-template-columns: 110px 1fr;
}

.meta dt {
  font-weight: 800;
}

.meta dd {
  margin: 0;
}

.status {
  padding: 28px 0;
  font-weight: 700;
  text-align: center;
  color: var(--color-text-muted);
}

@media (max-width: 800px) {
  .detail {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
