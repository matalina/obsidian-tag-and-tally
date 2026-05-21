import { computed, ref, watch, type Ref } from 'vue'
import { createDocsFuse, type SearchEntry } from '../logic/search'

export interface RulebookSearchHit {
  entry: SearchEntry
  /** Page path matching `RulebookPage.path` (no leading/trailing slash). */
  path: string
  /** Heading anchor including the leading '#', or '' for page-root hits. */
  hash: string
}

function entryToRoute(entry: SearchEntry): { path: string; hash: string } {
  const [rawPath, anchor = ''] = entry.url.split('#')
  const path = rawPath.replace(/^\/+|\/+$/g, '')
  return { path, hash: anchor ? `#${anchor}` : '' }
}

/**
 * Reactive Fuse-backed search over the docs index. Returns top 10 results,
 * debounced 200ms after typing stops. Empty/short queries return an empty list.
 */
export function useRulebookSearch(entries: SearchEntry[] | Ref<SearchEntry[]>) {
  const query = ref('')
  const debouncedQuery = ref('')

  const sourceEntries = computed(() =>
    Array.isArray(entries) ? entries : entries.value,
  )
  const fuse = computed(() => createDocsFuse(sourceEntries.value))

  let timer: ReturnType<typeof setTimeout> | null = null
  watch(query, (q) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      debouncedQuery.value = q
    }, 200)
  })

  const results = computed<RulebookSearchHit[]>(() => {
    const q = debouncedQuery.value.trim()
    if (q.length < 2) return []
    return fuse.value.search(q).slice(0, 10).map(({ item }) => ({
      entry: item,
      ...entryToRoute(item),
    }))
  })

  function clear() {
    query.value = ''
    debouncedQuery.value = ''
  }

  return { query, results, clear }
}
