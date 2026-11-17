<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import PageCrumbs from '@/components/PageCrumbs.vue'
import { useFilterStore } from '@/stores/filter'
import { useItemsStore } from '@/stores/items'

const ACCEPT = 'image/gif,image/png,image/jpeg,image/webp,video/mp4,video/webm'
const ALLOWED_MIME = ACCEPT.split(',')

const router = useRouter()
const filter = useFilterStore()
const store = useItemsStore()

const pending = ref([])
const dragging = ref(false)
const linkInput = ref('')
const linkError = ref('')
const saving = ref(false)
const fileInput = ref(null)
const notice = ref('')
let counter = 0

// Mirrors the server rules for a first suggestion; the server stays the authority.
function guessType(mime) {
  if (mime === 'image/gif') return 'gif'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'image/webp') return '' // static or animated: let the server decide
  return 'meme'
}

function addFiles(files) {
  notice.value = ''
  const rejected = []
  for (const file of files) {
    if (!ALLOWED_MIME.includes(file.type)) {
      rejected.push(file.name)
      continue
    }
    pending.value.push({
      id: ++counter,
      kind: 'file',
      file,
      name: file.name,
      type: guessType(file.type),
      tags: '',
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      isVideo: file.type.startsWith('video/'),
      status: 'ready',
      error: '',
      existingId: null,
    })
  }
  if (rejected.length) {
    notice.value = `Unsupported and skipped: ${rejected.join(', ')}. Allowed are GIF, PNG, JPG, WebP, MP4 and WebM.`
  }
}

function addLink() {
  linkError.value = ''
  const value = linkInput.value.trim()
  let url
  try {
    url = new URL(value)
  } catch {
    linkError.value = 'Please enter a valid link.'
    return
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    linkError.value = 'Only http and https links are allowed.'
    return
  }
  const ext = url.pathname.split('.').pop().toLowerCase()
  const known = { gif: 'gif', png: 'meme', jpg: 'meme', jpeg: 'meme', mp4: 'video', webm: 'video' }
  pending.value.push({
    id: ++counter,
    kind: 'url',
    url: value,
    name: decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || url.hostname),
    type: known[ext] || '',
    tags: '',
    preview: '',
    isVideo: known[ext] === 'video',
    status: 'ready',
    error: '',
    existingId: null,
  })
  linkInput.value = ''
}

function remove(entry) {
  if (entry.preview) URL.revokeObjectURL(entry.preview)
  pending.value = pending.value.filter((e) => e.id !== entry.id)
}

function onDrop(event) {
  dragging.value = false
  addFiles([...event.dataTransfer.files])
}

function onPick(event) {
  addFiles([...event.target.files])
  event.target.value = ''
}

// Ctrl+V anywhere on the page, except while typing into a text field.
let pasteCount = 0
function onPaste(event) {
  const files = [...(event.clipboardData?.files || [])]
  if (!files.length) return
  event.preventDefault()
  addFiles(
    files.map((f) => {
      const ext = f.type.split('/')[1] || 'png'
      return new File([f], `pasted-${++pasteCount}.${ext}`, { type: f.type })
    }),
  )
}

onMounted(() => window.addEventListener('paste', onPaste))
onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste)
  pending.value.forEach((e) => e.preview && URL.revokeObjectURL(e.preview))
})

const crumbs = computed(() => [
  { label: 'Collection', to: { name: 'items', query: filter.urlQuery } },
  { label: 'Add' },
])

// Files the server already rejected as duplicates are skipped instead of blocking the button.
const isDuplicate = (entry) => entry.status === 'error' && Boolean(entry.existingId)
const savable = computed(() => pending.value.filter((e) => !isDuplicate(e)))
const duplicateCount = computed(() => pending.value.length - savable.value.length)
const saveLabel = computed(() => {
  if (saving.value) return 'Saving …'
  const n = savable.value.length
  return n ? `Save ${n} ${n === 1 ? 'item' : 'items'}` : 'Save'
})

async function saveAll() {
  if (!savable.value.length) {
    notice.value = 'Everything in the list is already in your collection. Remove the entries or add something new.'
    return
  }
  saving.value = true
  notice.value = ''
  for (const entry of [...savable.value]) {
    entry.status = 'saving'
    entry.error = ''
    entry.existingId = null
    try {
      await store.create({
        file: entry.file,
        url: entry.url,
        type: entry.type,
        tags: entry.tags,
      })
      remove(entry)
    } catch (err) {
      entry.status = 'error'
      if (err.code === 'duplicate') {
        entry.error = 'This file is already in your collection.'
        entry.existingId = err.data?.existing_id
      } else {
        entry.error = err.message
      }
    }
  }
  saving.value = false
  if (!pending.value.length) goBack()
  else notice.value = 'Some files could not be saved. Please check the notes in the list.'
}

function goBack() {
  router.push({ name: 'items', query: filter.urlQuery })
}

function cancel() {
  pending.value.forEach((e) => e.preview && URL.revokeObjectURL(e.preview))
  pending.value = []
  goBack()
}
</script>

<template>
  <header class="head">
    <PageCrumbs :items="crumbs" />
    <h1 class="page-title">Add</h1>
  </header>

  <div
    class="drop"
    :class="{ 'drop--active': dragging }"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <AppIcon name="upload" :size="40" />
    <h2>Drag files here</h2>
    <p class="muted">GIFs, images and videos (MP4, WebM)</p>
    <button type="button" class="btn btn--primary" @click="fileInput.click()">Choose files</button>
    <input
      ref="fileInput"
      class="sr-only"
      type="file"
      multiple
      :accept="ACCEPT"
      tabindex="-1"
      aria-label="Choose files"
      @change="onPick"
    />
    <p class="muted small">Or paste a copied image with Ctrl+V</p>
  </div>

  <form class="link" @submit.prevent="addLink">
    <div class="field link__field">
      <label for="link">Load from link <span class="optional">(optional)</span></label>
      <input
        id="link"
        v-model="linkInput"
        class="input"
        type="url"
        placeholder="Paste a link to a GIF, image or video"
        :aria-invalid="Boolean(linkError)"
        aria-describedby="link-error"
      />
    </div>
    <button type="submit" class="btn btn--blue">Load</button>
  </form>
  <p id="link-error" class="error" role="alert">
    <template v-if="linkError"><AppIcon name="warn" :size="18" /> Error: {{ linkError }}</template>
  </p>

  <p v-if="notice" class="notice" role="status"><AppIcon name="info" :size="20" /> {{ notice }}</p>

  <section v-if="pending.length" class="queue" aria-labelledby="queue-title">
    <h2 id="queue-title">Ready to save</h2>
    <p class="muted small">The type is detected automatically and can be changed.</p>

    <ul class="rows">
      <li v-for="entry in pending" :key="entry.id" class="row" :class="{ 'row--error': entry.status === 'error' }">
        <div class="row__main">
          <div class="thumb" :class="{ 'thumb--image': entry.preview }" aria-hidden="true">
            <img v-if="entry.preview" :src="entry.preview" alt="" />
            <AppIcon v-else :name="entry.isVideo ? 'play' : 'image'" :size="26" />
          </div>
          <span class="row__name" :title="entry.name">{{ entry.name }}</span>

          <div class="row__controls">
            <label :for="`type-${entry.id}`" class="sr-only">Type for {{ entry.name }}</label>
            <select :id="`type-${entry.id}`" v-model="entry.type" class="input select" :disabled="saving">
              <option value="">Automatic</option>
              <option value="gif">Gif</option>
              <option value="meme">Meme</option>
              <option value="video">Video</option>
            </select>
            <label :for="`tags-${entry.id}`" class="sr-only">Tags for {{ entry.name }}</label>
            <input
              :id="`tags-${entry.id}`"
              v-model="entry.tags"
              class="input tags"
              type="text"
              placeholder="Tags (optional)"
              title="Separate multiple tags with commas"
              :disabled="saving"
            />
          </div>

          <button
            type="button"
            class="btn btn--icon"
            :aria-label="`Remove ${entry.name} from the list`"
            :disabled="saving"
            @click="remove(entry)"
          >
            <AppIcon name="close" />
          </button>
        </div>
        <p v-if="entry.status === 'saving'" class="row__note" role="status">
          <span class="spinner" aria-hidden="true"></span> Saving …
        </p>
        <p v-if="entry.error" class="row__note row__note--error" role="alert">
          <AppIcon name="warn" :size="20" />
          <span>{{ entry.error }}</span>
          <RouterLink v-if="entry.existingId" :to="{ name: 'item', params: { id: entry.existingId } }">
            Go to the existing item
          </RouterLink>
        </p>
      </li>
    </ul>

    <div class="footer">
      <p v-if="duplicateCount" class="hint footer__hint">
        {{ duplicateCount === 1 ? 'One file is already in your collection and will be skipped.' : `${duplicateCount} files are already in your collection and will be skipped.` }}
      </p>
      <button type="button" class="btn" :disabled="saving" @click="cancel">Cancel</button>
      <!-- Stays clickable while files are waiting; only a running save blocks a second click. -->
      <button type="button" class="btn btn--primary" :disabled="saving" @click="saveAll">
        <AppIcon v-if="!saving" name="check" />
        <span v-else class="spinner" aria-hidden="true"></span>
        {{ saveLabel }}
      </button>
    </div>
  </section>
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

.drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px 20px;
  text-align: center;
  background: var(--color-cream);
  border: 2px dashed var(--color-orange);
  border-radius: 32px;
}

.drop--active {
  background: var(--color-yellow);
  border-style: solid;
}

.muted {
  color: var(--color-text-muted);
}

.small {
  font-size: 0.85rem;
}

.link {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.link__field {
  flex: 1;
}

.error {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 1.4em;
  margin-top: 6px;
  font-weight: 700;
  color: var(--color-danger);
}

.notice {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.queue {
  margin-top: 24px;
}

.queue h2 {
  font-size: 1.15rem;
}

.rows {
  display: grid;
  gap: 12px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}

.row {
  padding: 12px 16px;
  background: #fffdf6;
  border: var(--border-ink);
  border-radius: 28px;
}

.row--error {
  border-color: var(--color-danger);
}

.row__main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.thumb {
  display: grid;
  flex: none;
  place-items: center;
  width: 52px;
  height: 52px;
  overflow: hidden;
  background: var(--color-blue);
  border: var(--border-ink);
  border-radius: 16px;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.row__name {
  flex: 1 1 140px;
  min-width: 0;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__controls {
  display: flex;
  flex: 2 1 320px;
  flex-wrap: wrap;
  gap: 10px;
}

.select {
  flex: 0 0 150px;
  width: 150px;
  min-height: 44px;
  padding: 0 14px;
}

.tags {
  flex: 1 1 180px;
  min-height: 44px;
}

.row__note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin-top: 10px;
  font-weight: 700;
  color: var(--color-text-muted);
}

.row__note a {
  font-weight: 800;
  color: inherit;
  text-underline-offset: 3px;
}

.row__note--error {
  color: var(--color-danger);
}

.footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.footer__hint {
  flex: 1 1 240px;
}

@media (max-width: 560px) {
  .link {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
