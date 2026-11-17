<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { TYPE_LABELS } from '@/utils/format'

const props = defineProps({
  item: { type: Object, required: true },
  autoplay: { type: Boolean, default: false },
})
const emit = defineEmits(['tag'])

// Hover or keyboard focus on the tile starts the animation, or the autoplay toggle does.
const hover = ref(false)
const active = computed(() => hover.value || props.autoplay)

const label = computed(
  () => `${TYPE_LABELS[props.item.type]}: ${props.item.title || props.item.tags[0] || 'Untitled'}`,
)
const shade = computed(() => `tile--shade-${props.item.id % 4}`)
const imageSrc = computed(() => {
  if (props.item.type === 'gif' && active.value) return props.item.file_url
  return props.item.thumbnail_url
})
const showVideo = computed(() => props.item.type === 'video' && active.value)
</script>

<template>
  <div class="entry">
    <article
      class="tile"
      :class="shade"
      @mouseenter="hover = true"
      @mouseleave="hover = false"
      @focusin="hover = true"
      @focusout="hover = false"
    >
      <div class="tile__media" aria-hidden="true">
        <img v-if="imageSrc" :src="imageSrc" alt="" loading="lazy" />
        <AppIcon v-else :name="item.type === 'meme' ? 'image' : 'play'" :size="44" class="tile__placeholder" />
        <video
          v-if="showVideo"
          :src="item.file_url"
          :poster="item.thumbnail_url || undefined"
          muted
          loop
          playsinline
          autoplay
        />
      </div>

      <RouterLink class="tile__link" :to="{ name: 'item', params: { id: item.id } }">
        <span class="sr-only">{{ label }}</span>
      </RouterLink>

      <span class="tile__badge">{{ TYPE_LABELS[item.type].toUpperCase() }}</span>
      <span v-if="item.is_favorite" class="tile__star" role="img" aria-label="Favorite">
        <AppIcon name="star" :size="20" />
      </span>
      <button
        v-if="item.tags.length"
        type="button"
        class="chip tile__tag"
        :title="`Filter by #${item.tags[0]}`"
        @click="emit('tag', item.tags[0])"
      >
        #{{ item.tags[0] }}
      </button>
    </article>
    <p class="caption" :class="{ 'caption--empty': !item.title }" :title="item.title || undefined">
      {{ item.title || 'Untitled' }}
    </p>
  </div>
</template>

<style scoped>
/* The title sits under the tile on the panel color (7.9:1 for the muted variant). */
.caption {
  margin-top: 8px;
  padding: 0 6px;
  overflow: hidden;
  font-size: 0.9375rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.caption--empty {
  font-weight: 600;
  color: var(--color-text-muted);
}

.tile {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--color-yellow);
  border: var(--border-ink);
  border-radius: var(--radius-tile);
}

.tile--shade-1 {
  background: var(--color-blue);
}
.tile--shade-2 {
  background: var(--color-orange);
}
.tile--shade-3 {
  background: var(--color-cream);
}

.tile:focus-within {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.tile__media {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}

.tile__media img,
.tile__media video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tile__placeholder {
  color: var(--color-text);
}

/* The link covers the tile; badge, star and chip sit above it. */
.tile__link {
  position: absolute;
  inset: 0;
  border-radius: inherit;
}

.tile__link:focus-visible {
  outline-offset: -6px;
}

.tile__badge,
.tile__star,
.tile__tag {
  position: absolute;
  z-index: 1;
}

.tile__badge {
  top: 10px;
  left: 10px;
  padding: 1px 10px;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--color-on-dark);
  background: var(--color-text);
  border-radius: var(--radius-pill);
  pointer-events: none;
}

.tile__star {
  top: 8px;
  right: 10px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  color: var(--color-text);
  background: var(--color-yellow);
  border: var(--border-ink);
  border-radius: 50%;
  pointer-events: none;
}

.tile__tag {
  left: 10px;
  bottom: 10px;
  max-width: calc(100% - 20px);
  cursor: pointer;
}
</style>
