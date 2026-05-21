<script setup lang="ts">
import { ref, computed, watch, onMounted, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RulebookPanel from './RulebookPanel.vue'
import type { RulebookPayload } from '../rulebook/rulebook-markdown'
import { normalizeRulebookNav } from '../rulebook/rulebook-markdown'

const route = useRoute()
const router = useRouter()

const injectedPayload = inject<RulebookPayload | undefined>('rulebookInitialPayload', undefined)
const rawPayload = injectedPayload ?? { nav: [], pages: [] }
const payload = ref<RulebookPayload>({
  nav: normalizeRulebookNav(rawPayload.nav),
  pages: rawPayload.pages
})
const loading = ref(injectedPayload === undefined)
const loadError = ref<string | null>(null)

const currentPath = computed(() => {
  const m = route.params.pathMatch
  return typeof m === 'string' ? m : Array.isArray(m) ? m.join('/') : ''
})

function onNavigate(path: string, hash = '') {
  const isAppRulebook = typeof route.path === 'string' && route.path.startsWith('/rulebook')
  const prefix = isAppRulebook ? '/rulebook' : ''
  const target = path ? `${prefix}/${path}` : prefix || '/'
  router.push(hash ? `${target}${hash}` : target)
}

const currentAnchor = computed(() => route.hash || '')

async function loadRulebook(): Promise<void> {
  if (injectedPayload !== undefined) return
  const base = typeof window !== 'undefined' ? window.location.origin + ((import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/') : ''
  const url = `${base.replace(/\/$/, '')}/rulebook.json`
  const maxAttempts = 3
  const delayMs = 500
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(res.statusText)
      const data: RulebookPayload = await res.json()
      payload.value = {
        nav: normalizeRulebookNav(data.nav ?? []),
        pages: data.pages ?? []
      }
      if (!currentPath.value && payload.value.pages.length) {
        const first = payload.value.pages[0]
        if (first) onNavigate(first.path)
      }
      return
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  loadError.value = lastError instanceof Error ? lastError.message : String(lastError)
}

onMounted(async () => {
  await loadRulebook()
  loading.value = false
})

watch(
  () => route.name,
  () => {
    if (route.path === '/rulebook' || route.path === '/') {
      if (payload.value.pages.length && !currentPath.value) {
        const first = payload.value.pages[0]
        if (first) onNavigate(first.path)
      }
    }
  }
)
</script>

<template>
  <div class="rulebook-view testing">
    <p v-if="loading" class="rulebook-view__loading">Loading…</p>
    <p v-else-if="loadError" class="rulebook-view__error">{{ loadError }}</p>
    <RulebookPanel
      v-else-if="payload.nav.length && payload.pages.length"
      :nav="payload.nav"
      :pages="payload.pages"
      :current-path="currentPath"
      :current-anchor="currentAnchor"
      @navigate="onNavigate"
    />
    <p v-else class="rulebook-view__empty">
      {{ injectedPayload !== undefined ? 'Rulebook data not found. Run npm run generate:rulebook and rebuild the plugin to include rulebook.json.' : 'No rulebook pages loaded.' }}
    </p>
  </div>
</template>

<style scoped lang="css">
.rulebook-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100vh;
}
.rulebook-view__loading,
.rulebook-view__error,
.rulebook-view__empty {
  padding: 1.5rem;
  margin: 0;
}
.rulebook-view__error {
  color: #c00;
}
</style>
