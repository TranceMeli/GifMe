import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFilterStore } from '@/stores/filter'

const serialize = (query) => JSON.stringify(Object.entries(query).sort())

/**
 * Keeps the filter store and the URL query in sync in both directions. The route
 * wins on load and on back/forward; store changes replace the current history entry.
 */
export function useFilterUrlSync(onChange) {
  const route = useRoute()
  const router = useRouter()
  const filter = useFilterStore()

  const normalized = (query) => {
    const probe = { ...query }
    if (probe.tag !== undefined) probe.tag = [].concat(probe.tag)
    return probe
  }

  // Route -> store
  watch(
    () => route.query,
    (query) => {
      if (serialize(normalized(query)) === serialize(normalized(filter.urlQuery))) return
      filter.hydrate(query)
    },
    { immediate: true },
  )

  // Store -> route, then notify the caller to reload.
  watch(
    () => filter.urlQuery,
    (query) => {
      if (serialize(normalized(query)) !== serialize(normalized(route.query))) {
        router.replace({ query })
      }
      onChange?.()
    },
    { deep: true },
  )
}
