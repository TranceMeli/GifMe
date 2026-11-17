import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const backend = process.env.GIFME_BACKEND || 'http://127.0.0.1:8190'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5190,
    strictPort: true,
    // Same-origin access to the Django API and uploaded media, so no CORS is needed.
    proxy: {
      '/api': backend,
      '/media': backend,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
})
