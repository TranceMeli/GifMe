<script setup>
import AppIcon from './AppIcon.vue'

// Feedback line for the last action. Icon and text carry the meaning, not only the color.
defineProps({
  text: { type: String, default: '' },
  error: { type: Boolean, default: false },
  info: { type: Boolean, default: false },
})
</script>

<template>
  <p class="message" :class="{ 'message--error': error }" :role="error ? 'alert' : 'status'" aria-live="polite">
    <template v-if="text">
      <AppIcon :name="error ? 'warn' : info ? 'info' : 'check'" :size="22" />
      <span><template v-if="error">Error: </template>{{ text }}</span>
    </template>
  </p>
</template>

<style scoped>
.message {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-weight: 800;
}

/* The live region stays in the layout so screen readers pick up later text. */
.message {
  min-height: 1.5em;
}

.message > svg {
  flex: none;
}

.message--error {
  padding: 10px 16px;
  color: var(--color-danger);
  background: var(--color-container);
  border: 2px solid var(--color-danger);
  border-radius: 20px;
}
</style>
