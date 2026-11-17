<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as api from '@/api/items'
import AppIcon from '@/components/AppIcon.vue'
import PageCrumbs from '@/components/PageCrumbs.vue'
import StatusMessage from '@/components/StatusMessage.vue'
import { useItemsStore } from '@/stores/items'
import { formatDimensions, formatSize } from '@/utils/format'

const props = defineProps({ id: { type: String, required: true } })

const router = useRouter()
const store = useItemsStore()

const item = computed(() => store.current)
const info = ref(null)
const loadError = ref('')
const previewUrl = ref('')
const previewMeta = ref(null) // { size, width, height } of the rendered preview
const previewing = ref(false)
const saving = ref(false)
const cropActive = ref(false)
const message = ref({ text: '', kind: 'ok' })
const confirmDialog = ref(null)

const SPEEDS = [0.5, 1, 1.5, 2, 3]
const SCALES = [100, 75, 50, 25]

const edit = reactive({
  start: 0,
  end: 0,
  reverse: false,
  speed: 1,
  crop: { left: 0, right: 0, top: 0, bottom: 0 },
  rotate: 0,
  scale: 100,
})

const crumbs = computed(() => [
  { label: 'Collection', to: { name: 'items' } },
  ...(item.value
    ? [
        { label: item.value.title || 'Untitled', to: { name: 'item', params: { id: props.id } } },
        { label: 'Edit' },
      ]
    : [{ label: 'Edit' }]),
])

const animated = computed(() => (info.value?.frame_count ?? 1) > 1)
const lastFrame = computed(() => (info.value ? info.value.frame_count - 1 : 0))
const changed = computed(
  () =>
    edit.start > 0 ||
    (animated.value && edit.end < lastFrame.value) ||
    edit.reverse ||
    edit.speed !== 1 ||
    Object.values(edit.crop).some(Boolean) ||
    edit.rotate !== 0 ||
    edit.scale !== 100,
)

// While a crop slider has focus the original is shown with a frame around what stays.
const shownSrc = computed(() => (cropActive.value ? item.value.file_url : previewUrl.value || item.value.file_url))
const showsPreview = computed(() => !cropActive.value && Boolean(previewUrl.value))
const cropStyle = computed(() => {
  const c = edit.crop
  return { inset: `${c.top}% ${c.right}% ${c.bottom}% ${c.left}%` }
})

/** The request body; frame and tempo options only apply to animated files. */
function payload() {
  const body = { crop: { ...edit.crop }, rotate: edit.rotate, scale: edit.scale }
  if (animated.value) {
    Object.assign(body, { start: edit.start, end: edit.end, reverse: edit.reverse, speed: edit.speed })
  }
  return body
}

function say(text, kind = 'ok') {
  message.value = { text, kind }
}

// Load the item and its frame info, then reset the controls.
watch(
  () => props.id,
  async (id) => {
    loadError.value = ''
    const loaded = await store.get(id)
    if (!loaded) return
    try {
      info.value = await api.getEditInfo(id)
    } catch (err) {
      loadError.value = err.message
      return
    }
    edit.start = 0
    edit.end = Math.max(0, info.value.frame_count - 1)
  },
  { immediate: true },
)

// Debounced server-side preview; stale responses are dropped.
let timer = null
let previewRun = 0
function clearPreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  previewMeta.value = null
}

watch(
  edit,
  () => {
    clearTimeout(timer)
    if (!info.value) return
    if (!changed.value) {
      previewRun += 1
      clearPreview()
      previewing.value = false
      return
    }
    previewing.value = true
    timer = setTimeout(async () => {
      const run = ++previewRun
      try {
        const blob = await api.previewEdit(props.id, payload())
        if (run !== previewRun) return
        clearPreview()
        previewUrl.value = URL.createObjectURL(blob)
        previewMeta.value = { size: blob.size, width: 0, height: 0 }
        say('')
      } catch (err) {
        if (run === previewRun) say(err.message, 'error')
      } finally {
        if (run === previewRun) previewing.value = false
      }
    }, 600)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  clearTimeout(timer)
  clearPreview()
})

// The preview's pixel size is only known once the browser has decoded it.
function onImageLoad(event) {
  if (previewMeta.value && previewUrl.value && event.target.currentSrc === previewUrl.value) {
    previewMeta.value = {
      ...previewMeta.value,
      width: event.target.naturalWidth,
      height: event.target.naturalHeight,
    }
  }
}

function onCropFocusOut(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) cropActive.value = false
}

function reset() {
  Object.assign(edit, { start: 0, end: lastFrame.value, reverse: false, speed: 1, rotate: 0, scale: 100 })
  Object.assign(edit.crop, { left: 0, right: 0, top: 0, bottom: 0 })
  say('')
}

function keepStartBeforeEnd(changedKey) {
  if (edit.start > edit.end) {
    if (changedKey === 'start') edit.end = edit.start
    else edit.start = edit.end
  }
}

const NOTHING_CHANGED = 'Nothing changed yet. Move a slider, then the result can be saved.'

// The buttons stay clickable; with no change there is nothing to save and we say so.
function ask(mode) {
  if (!changed.value) {
    say(NOTHING_CHANGED, 'info')
    return
  }
  if (mode === 'replace') confirmDialog.value.showModal()
  else save('copy')
}

async function save(mode) {
  saving.value = true
  say('')
  try {
    const result = await api.saveEdit(props.id, payload(), mode)
    router.push({ name: 'item', params: { id: result.id } })
  } catch (err) {
    say(
      err.code === 'duplicate'
        ? 'The result is identical to an item already in your collection.'
        : err.message,
      'error',
    )
  } finally {
    saving.value = false
    confirmDialog.value?.close()
  }
}

const cropFields = [
  { key: 'left', label: 'Crop left' },
  { key: 'right', label: 'Crop right' },
  { key: 'top', label: 'Crop top' },
  { key: 'bottom', label: 'Crop bottom' },
]
</script>

<template>
  <header class="head">
    <PageCrumbs :items="crumbs" />
    <h1 class="page-title">Edit</h1>
  </header>

  <p v-if="store.error || loadError" class="notice notice--error" role="alert">
    <AppIcon name="warn" :size="20" /> Error: {{ store.error || loadError }}
  </p>
  <p v-else-if="!item || !info" class="status" role="status">Loading …</p>

  <div v-else class="wrap">
    <div class="edit">
      <section class="edit__media" aria-label="Preview">
        <div class="preview" :aria-busy="previewing">
          <div class="preview__stage">
            <img :src="shownSrc" :alt="item.title || 'Preview of the edit'" @load="onImageLoad" />
            <div v-if="cropActive" class="crop" :style="cropStyle" aria-hidden="true"></div>
          </div>
          <span class="preview__badge">{{ showsPreview ? 'PREVIEW' : 'ORIGINAL' }}</span>
        </div>

        <p class="phase" role="status">
          <template v-if="previewing"><span class="spinner" aria-hidden="true"></span> Updating preview …</template>
          <template v-else-if="cropActive">The frame shows what remains of the original.</template>
          <template v-else-if="previewUrl">Preview with your changes. Nothing is saved until you use the buttons below.</template>
          <template v-else>Original view. Change something and the preview appears here.</template>
        </p>

        <dl v-if="previewMeta && previewMeta.width" class="result" aria-label="Result compared with the original">
          <div><dt>New dimensions</dt><dd>{{ previewMeta.width }} × {{ previewMeta.height }} px</dd></div>
          <div><dt>New size</dt><dd>{{ formatSize(previewMeta.size) }}</dd></div>
          <div><dt>Before</dt><dd>{{ formatDimensions(item) }}, {{ formatSize(item.size_bytes) }}</dd></div>
        </dl>
      </section>

      <section class="edit__form" aria-label="Tools">
        <details v-if="animated" class="card" open>
          <summary>
            Time range and speed
            <AppIcon name="chevron" :size="20" />
          </summary>
          <div class="card__body">
            <p class="hint">{{ info.frame_count }} frames, {{ (info.duration_ms / 1000).toLocaleString('en-GB') }} s duration</p>
            <div class="slider">
              <div class="slider__row">
                <label for="start">Start</label>
                <output for="start">Frame {{ edit.start + 1 }} of {{ info.frame_count }}</output>
              </div>
              <input id="start" v-model.number="edit.start" type="range" min="0" :max="lastFrame" @input="keepStartBeforeEnd('start')" />
            </div>
            <div class="slider">
              <div class="slider__row">
                <label for="end">End</label>
                <output for="end">Frame {{ edit.end + 1 }} of {{ info.frame_count }}</output>
              </div>
              <input id="end" v-model.number="edit.end" type="range" min="0" :max="lastFrame" @input="keepStartBeforeEnd('end')" />
            </div>
            <div class="field">
              <label for="speed">Speed</label>
              <select id="speed" v-model.number="edit.speed" class="input">
                <option v-for="s in SPEEDS" :key="s" :value="s">{{ s === 1 ? '1× (Original)' : `${s}×` }}</option>
              </select>
            </div>
            <label class="check"><input v-model="edit.reverse" type="checkbox" /> Play in reverse</label>
          </div>
        </details>

        <details class="card" open>
          <summary>
            Crop
            <AppIcon name="chevron" :size="20" />
          </summary>
          <div class="card__body" @focusin="cropActive = true" @focusout="onCropFocusOut">
            <p class="hint">While you move a slider, a frame on the original shows what remains.</p>
            <div v-for="f in cropFields" :key="f.key" class="slider">
              <div class="slider__row">
                <label :for="`crop-${f.key}`">{{ f.label }}</label>
                <output :for="`crop-${f.key}`">{{ edit.crop[f.key] }} %</output>
              </div>
              <input :id="`crop-${f.key}`" v-model.number="edit.crop[f.key]" type="range" min="0" max="45" step="1" />
            </div>
          </div>
        </details>

        <details class="card">
          <summary>
            Rotation and size
            <AppIcon name="chevron" :size="20" />
          </summary>
          <div class="card__body">
            <div class="field">
              <label for="rotate">Rotate</label>
              <select id="rotate" v-model.number="edit.rotate" class="input">
                <option :value="0">Do not rotate</option>
                <option :value="90">90° right</option>
                <option :value="180">180°</option>
                <option :value="270">90° left</option>
              </select>
            </div>
            <div class="field">
              <label for="scale">Size</label>
              <select id="scale" v-model.number="edit.scale" class="input">
                <option v-for="s in SCALES" :key="s" :value="s">{{ s === 100 ? 'Original' : `${s} %` }}</option>
              </select>
            </div>
          </div>
        </details>
      </section>
    </div>

    <div class="actionbar">
      <StatusMessage
        class="actionbar__status"
        :text="message.text"
        :error="message.kind === 'error'"
        :info="message.kind === 'info'"
      />
      <div class="actionbar__row">
        <button type="button" class="btn btn--ghost" :disabled="saving" @click="reset">
          <AppIcon name="reset" /> Reset
        </button>
        <div class="actionbar__save">
          <div class="replace">
            <button type="button" class="btn btn--danger" :disabled="saving" @click="ask('replace')">Replace original</button>
            <span class="replace__warn">Overwrites the file permanently</span>
          </div>
          <button type="button" class="btn btn--primary" :disabled="saving" @click="ask('copy')">
            <AppIcon v-if="!saving" name="check" />
            <span v-else class="spinner" aria-hidden="true"></span>
            {{ saving ? 'Saving …' : 'Save as copy' }}
          </button>
        </div>
      </div>
    </div>

    <dialog ref="confirmDialog" class="dialog" aria-labelledby="replace-title">
      <h2 id="replace-title">Replace the original?</h2>
      <p>The edited version permanently overwrites the original. Tip: “Save as copy” keeps both.</p>
      <div class="dialog__actions">
        <button type="button" class="btn" @click="confirmDialog.close()">Cancel</button>
        <button type="button" class="btn btn--danger" :disabled="saving" @click="save('replace')">Replace</button>
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
  margin-bottom: 24px;
}

.edit {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 28px;
  align-items: start;
}

.edit__media {
  position: sticky;
  top: 16px;
}

.preview {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 220px;
  padding: 16px;
  overflow: hidden;
  background: var(--color-blue);
  border: var(--border-ink);
  border-radius: 32px;
}

/* The stage hugs the image, so the crop frame lines up with the picture's edges. */
.preview__stage {
  position: relative;
  line-height: 0;
}

.preview__stage img {
  width: auto;
  height: auto;
  min-width: 200px;
  max-width: 100%;
  max-height: 60vh;
}

.crop {
  position: absolute;
  border: 2px dashed var(--color-text);
  box-shadow: 0 0 0 9999px rgb(255 246 223 / 62%);
  pointer-events: none;
}

.preview__badge {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 1px 10px;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--color-on-dark);
  background: var(--color-text);
  border-radius: var(--radius-pill);
}

.phase {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 1.5em;
  margin-top: 12px;
  font-weight: 700;
}

.result {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px 16px;
  margin: 12px 0 0;
  padding: 12px 16px;
  background: var(--color-container);
  border: var(--border-container);
  border-radius: 20px;
}

.result dt {
  font-size: 0.8125rem;
  font-weight: 800;
  color: var(--color-text-muted);
}

.result dd {
  margin: 0;
  font-weight: 800;
}

.edit__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card {
  background: var(--color-container);
  border: var(--border-container);
  border-radius: 28px;
}

.card summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 56px;
  padding: 0 22px;
  font-size: 1.0625rem;
  font-weight: 800;
  cursor: pointer;
  list-style: none;
}

.card summary::-webkit-details-marker {
  display: none;
}

.card summary svg {
  transition: transform 0.15s;
}

.card[open] summary svg {
  transform: rotate(180deg);
}

.card__body {
  display: grid;
  gap: 16px;
  padding: 4px 22px 22px;
}

.slider {
  display: grid;
  gap: 6px;
}

.slider__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.9375rem;
  font-weight: 800;
}

.slider output {
  padding: 0 10px;
  background: var(--color-cream);
  border: 1.5px solid var(--color-text);
  border-radius: var(--radius-pill);
}

.slider input {
  width: 100%;
  min-height: 32px;
  accent-color: var(--color-text);
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: var(--control-height);
  font-weight: 700;
}

.check input {
  width: 24px;
  height: 24px;
  accent-color: var(--color-text);
}

/* Floats at the bottom of the viewport so the save buttons are always in reach. */
.actionbar {
  position: sticky;
  bottom: 12px;
  z-index: 10;
  display: grid;
  gap: 8px;
  margin-top: 24px;
  padding: 12px 18px;
  background: var(--color-container);
  border: var(--border-container);
  border-radius: 28px;
  box-shadow: 0 -6px 14px -10px rgb(46 36 24 / 55%);
}

.actionbar__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.actionbar__save {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px;
}

.replace {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.replace__warn {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-danger);
}

.btn--ghost {
  background: transparent;
}

.status {
  padding: 28px 0;
  font-weight: 700;
  text-align: center;
  color: var(--color-text-muted);
}

.notice {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 800px) {
  .edit {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }

  /* On a phone the preview stays small so the controls remain reachable. */
  .edit__media {
    position: static;
  }

  /* Main action on its own row, the two side actions share the row below. */
  .actionbar {
    grid-template-columns: 1fr 1fr;
    padding: 10px 12px;
  }

  .actionbar__status {
    grid-column: 1 / -1;
  }

  .actionbar__row,
  .actionbar__save {
    display: contents;
  }

  .actionbar__save > .btn--primary {
    grid-column: 1 / -1;
    order: -1;
  }

  .actionbar .btn {
    width: 100%;
    padding: 0 12px;
  }

  .replace {
    align-items: stretch;
  }

  /* Still read out by screen readers; the dialog repeats the warning visually. */
  .replace__warn {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
}
</style>
