import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePrefsStore } from './prefs'

function mockReducedMotion(matches) {
  vi.stubGlobal('matchMedia', () => ({ matches }))
}

describe('usePrefsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts with autoplay off and remembers the toggle', () => {
    mockReducedMotion(false)
    const prefs = usePrefsStore()
    expect(prefs.autoplay).toBe(false)
    prefs.toggleAutoplay()
    expect(prefs.autoplay).toBe(true)

    setActivePinia(createPinia())
    expect(usePrefsStore().autoplay).toBe(true)
  })

  it('starts with autoplay off when the system asks for reduced motion', () => {
    localStorage.setItem('gifme.autoplay', '1')
    mockReducedMotion(true)
    const prefs = usePrefsStore()
    expect(prefs.reducedMotion).toBe(true)
    expect(prefs.autoplay).toBe(false)
  })
})
