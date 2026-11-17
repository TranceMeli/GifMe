import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { useFilterStore } from '@/stores/filter'
import { makeRouter } from '@/test/helpers'
import { useFilterUrlSync } from './useFilterUrlSync'

async function setup(initialRoute = '/') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = makeRouter()
  await router.push(initialRoute)
  await router.isReady()
  const onChange = vi.fn()
  const Probe = defineComponent({
    setup() {
      useFilterUrlSync(onChange)
      return () => null
    },
  })
  mount(Probe, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { router, filter: useFilterStore(), onChange }
}

describe('useFilterUrlSync', () => {
  it('reads the filter state from the URL on load', async () => {
    const { filter } = await setup('/?type=meme&q=cat&tag=a&tag=b&sort=largest')
    expect(filter.type).toBe('meme')
    expect(filter.query).toBe('cat')
    expect(filter.search).toBe('cat')
    expect(filter.tags).toEqual(['a', 'b'])
    expect(filter.sort).toBe('largest')
  })

  it('writes store changes to the URL', async () => {
    const { router, filter } = await setup('/')
    filter.toggleType('gif')
    filter.toggleTag('Owl')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ type: 'gif', tag: ['owl'] })
  })

  it('does not put the default sort in the URL', async () => {
    const { router, filter } = await setup('/')
    filter.setSort('oldest')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ sort: 'oldest' })
    filter.setSort('newest')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('applies a URL change such as the back button to the store', async () => {
    const { router, filter } = await setup('/?type=gif')
    await router.push('/?type=video&tag=x')
    await flushPromises()
    expect(filter.type).toBe('video')
    expect(filter.tags).toEqual(['x'])
  })

  it('tells the caller to reload whenever the filter changes', async () => {
    const { filter, onChange } = await setup('/')
    onChange.mockClear()
    filter.toggleType('gif')
    await flushPromises()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reset clears the URL query but keeps the sort', async () => {
    const { router, filter } = await setup('/?type=gif&q=x&sort=oldest')
    filter.reset()
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ sort: 'oldest' })
  })
})
