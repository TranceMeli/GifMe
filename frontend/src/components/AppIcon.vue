<script setup>
// Decorative icons; the surrounding button carries the accessible name.
defineProps({ name: { type: String, required: true }, size: { type: Number, default: 20 } })

const paths = {
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  back: 'M19 12H5M11 6l-6 6 6 6',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  close: 'M6 6l12 12M18 6L6 18',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01',
  download: 'M12 4v12M7 11l5 5 5-5M4 16v4h16v-4',
  check: 'M5 13l4 4L19 7',
  warn: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01',
  chevron:'M6 9l6 6 6-6',
  reset: 'M4 12a8 8 0 1 0 3-6.2M4 4v5h5',
  sort: 'M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4',
}
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'star'">
      <path
        fill="currentColor"
        d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"
      />
    </template>
    <template v-else-if="name === 'play'">
      <circle cx="12" cy="12" r="9.5" />
      <path fill="currentColor" d="M10 8.2v7.6l6-3.8z" />
    </template>
    <path v-else :d="paths[name]" />
  </svg>
</template>
