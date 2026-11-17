import { defineStore } from 'pinia'

const KEY = 'gifme.autoplay'

/** True when the system asks for less motion; autoplay then starts off. */
export function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function load() {
  if (prefersReducedMotion()) return false
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Per-browser preferences that are not part of the URL. */
export const usePrefsStore = defineStore('prefs', {
  state: () => ({ autoplay: load(), reducedMotion: prefersReducedMotion() }),
  actions: {
    toggleAutoplay() {
      this.autoplay = !this.autoplay
      try {
        localStorage.setItem(KEY, this.autoplay ? '1' : '0')
      } catch {
        // Storage can be blocked; the toggle still works for this session.
      }
    },
  },
})
