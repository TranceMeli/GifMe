import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

const Stub = { template: '<div />' }

/** A router with the same route names as the app, but empty pages. */
export function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'items', component: Stub },
      { path: '/add', name: 'add', component: Stub },
      { path: '/items/:id(\\d+)', name: 'item', component: Stub, props: true },
      { path: '/items/:id(\\d+)/edit', name: 'edit', component: Stub, props: true },
    ],
  })
}

/** An item as the API returns it. */
export function makeItem(overrides = {}) {
  return {
    id: 1,
    type: 'gif',
    title: '',
    tags: [],
    is_favorite: false,
    source_url: '',
    width: 480,
    height: 270,
    size_bytes: 1258291,
    sha256: 'a'.repeat(64),
    created_at: new Date(2026, 10, 7, 12).toISOString(),
    file_url: '/media/items/aa/1.gif',
    thumbnail_url: '/media/thumbs/1.jpg',
    ...overrides,
  }
}

export function page(results, extra = {}) {
  return { count: results.length, next: null, previous: null, results, ...extra }
}

/** Mount a view with a fresh Pinia store and router, positioned on `route`. */
export async function mountView(component, { route = '/', props = {}, attachTo } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = makeRouter()
  await router.push(route)
  await router.isReady()
  const wrapper = mount(component, { props, attachTo, global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, pinia }
}

/** A promise that can be settled from the outside, for ordering tests. */
export function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
