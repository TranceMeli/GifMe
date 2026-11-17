<script setup>
import { RouterLink } from 'vue-router'
import AppIcon from './AppIcon.vue'

// Path back through the app. The last entry is the current page and has no `to`.
defineProps({ items: { type: Array, required: true } })
</script>

<template>
  <nav class="crumbs" aria-label="Breadcrumb">
    <ol>
      <li v-for="(crumb, index) in items" :key="index">
        <RouterLink v-if="crumb.to" :to="crumb.to">
          <AppIcon v-if="index === 0" name="back" :size="18" />
          {{ crumb.label }}
        </RouterLink>
        <span v-else class="crumbs__current" aria-current="page">{{ crumb.label }}</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.crumbs ol {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-weight: 800;
}

.crumbs li + li::before {
  content: '/';
  margin-right: 8px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.crumbs a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  text-underline-offset: 3px;
}

.crumbs__current {
  max-width: 28ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 560px) {
  .crumbs__current {
    max-width: 16ch;
  }
}
</style>
