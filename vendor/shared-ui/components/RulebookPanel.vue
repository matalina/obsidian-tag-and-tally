<script setup lang="ts">
import { computed, inject, ref, watch, nextTick } from 'vue'
import { createRulebookRenderer, type RulebookPage, type TocNavNode } from '../rulebook/rulebook-markdown'
import { useRulebookSearch, type RulebookSearchHit } from '../composables/useRulebookSearch'
import type { SearchEntry } from '../logic/search'

const props = withDefaults(
  defineProps<{
    nav: TocNavNode[]
    pages: RulebookPage[]
    currentPath?: string
    currentAnchor?: string
  }>(),
  { currentPath: '', currentAnchor: '' }
)

const emit = defineEmits<{
  navigate: [path: string, hash?: string]
}>()

const searchIndex = inject<SearchEntry[]>('rulebookSearchIndex', [])
const { query: searchQuery, results: searchResults, clear: clearSearch } = useRulebookSearch(searchIndex)
const searchEnabled = computed(() => searchIndex.length > 0)

const contentRef = ref<HTMLElement | null>(null)
const menuOpen = ref(false)

const effectivePath = computed(() => {
  if (props.currentPath) return props.currentPath
  const first = props.pages[0]
  return first?.path ?? ''
})

const currentPage = computed(() => {
  const path = effectivePath.value
  if (!path) return props.pages[0] ?? null
  return props.pages.find((p) => p.path === path) ?? null
})

/** Flatten TOC nav into groups for sidebar: direct links + subgroup (title + links). */
interface NavGroup {
  title: string
  direct: { path: string; title: string }[]
  subgroups?: { title: string; children: { path: string; title: string }[] }[]
}
function isLink(node: TocNavNode): node is TocNavNode & { type: 'link'; path: string; url: string } {
  return (node as { type?: string }).type === 'link' || ('path' in node && 'url' in node)
}
function isHeader(node: TocNavNode): node is TocNavNode & { title: string; children: TocNavNode[] } {
  return !isLink(node)
}

const tree = computed((): NavGroup[] => {
  const out: NavGroup[] = []
  for (const node of props.nav) {
    if (isLink(node)) {
      if (out.length === 0) out.push({ title: '', direct: [], subgroups: [] })
      out[out.length - 1].direct.push({ path: node.path, title: node.title })
      continue
    }
    if (!isHeader(node)) continue
    const direct: { path: string; title: string }[] = []
    const subgroups: { title: string; children: { path: string; title: string }[] }[] = []
    for (const child of node.children ?? []) {
      if (isLink(child)) {
        direct.push({ path: child.path, title: child.title })
      } else if (isHeader(child)) {
        const subChildren = (child.children ?? [])
          .filter((c): c is TocNavNode & { type: 'link'; path: string } => isLink(c))
          .map((c) => ({ path: c.path, title: c.title }))
        subgroups.push({ title: child.title, children: subChildren })
      }
    }
    out.push({ title: node.title, direct, subgroups: subgroups.length ? subgroups : undefined })
  }
  return out.filter((g) => g.title || g.direct.length || (g.subgroups?.length ?? 0) > 0)
})

const renderMarkdown = computed(() => createRulebookRenderer(props.pages))

const renderedContent = computed(() => {
  const page = currentPage.value
  if (!page?.content) return ''
  return renderMarkdown.value(page.content)
})

function emitNavigate(path: string, hash = '') {
  emit('navigate', path, hash)
  menuOpen.value = false
}

function onResultClick(hit: RulebookSearchHit) {
  clearSearch()
  emitNavigate(hit.path, hit.hash)
}

function onContentClick(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest('a.wikilink')
  if (!target) return
  const href = (target as HTMLAnchorElement).getAttribute('href') ?? ''
  if (href === '#' || !href.startsWith('/rulebook/')) return
  e.preventDefault()
  const path = href.replace(/^\/rulebook\/?/, '').replace(/\/$/, '')
  if (path) {
    menuOpen.value = false
    emit('navigate', path)
  }
}

function scrollToTop() {
  const el = contentRef.value
  if (!el) return
  el.scrollIntoView({ behavior: 'instant', block: 'start' })
  const main = el.closest('.rulebook-panel__main')
  if (main instanceof HTMLElement) main.scrollTo(0, 0)
}

function scrollToAnchor() {
  const anchor = props.currentAnchor
  if (!anchor) {
    scrollToTop()
    return
  }
  const id = anchor.startsWith('#') ? anchor.slice(1) : anchor
  const target = contentRef.value?.querySelector(`#${CSS.escape(id)}`)
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ behavior: 'instant', block: 'start' })
  } else {
    scrollToTop()
  }
}

watch(
  () => [effectivePath.value, props.currentAnchor],
  () => {
    nextTick(() => scrollToAnchor())
    setTimeout(scrollToAnchor, 0)
  },
  { immediate: true },
)

</script>

<template>
  <div class="rulebook-panel" :class="{ 'rulebook-panel--menu-open': menuOpen }">
    <header class="rulebook-panel__header">
      <button
        v-if="!menuOpen"
        type="button"
        class="rulebook-panel__menu-btn"
        aria-label="Open menu"
        :aria-expanded="menuOpen"
        @click.stop="menuOpen = true"
      >
        <span aria-hidden="true">&#9776;</span>
      </button>
      <button
        v-else
        type="button"
        class="rulebook-panel__menu-btn"
        aria-label="Close menu"
        @click.stop="menuOpen = false"
      >
        <span aria-hidden="true">&#215;</span>
      </button>
      <div v-if="searchEnabled" class="rulebook-panel__search">
        <input
          v-model="searchQuery"
          type="search"
          class="rulebook-panel__search-input"
          placeholder="Search rules…"
          aria-label="Search rules"
        />
        <ul v-if="searchResults.length" class="rulebook-panel__search-results">
          <li v-for="hit in searchResults" :key="hit.entry.url" class="rulebook-panel__search-result">
            <a
              href="#"
              class="rulebook-panel__search-link"
              @click.prevent="onResultClick(hit)"
            >
              <span class="rulebook-panel__search-breadcrumb">{{ hit.entry.breadcrumb }}</span>
            </a>
          </li>
        </ul>
      </div>
    </header>
    <div
      v-show="menuOpen"
      class="rulebook-panel__backdrop"
      aria-hidden="true"
      @click.stop="menuOpen = false"
    />
    <aside v-if="menuOpen" class="rulebook-panel__sidebar">
      <div class="rulebook-panel__sidebar-header">
        <h2 class="rulebook-panel__sidebar-title">Rulebook</h2>
      </div>
      <nav v-if="nav.length" class="rulebook-panel__nav">
        <div v-for="group in tree" :key="group?.title || 'group'" class="rulebook-panel__nav-group">
          <h3 v-if="group?.title" class="rulebook-panel__nav-group-title">{{ group.title }}</h3>
          <ul class="rulebook-panel__nav-list">
            <li v-for="item in group?.direct ?? []" :key="item.path" class="rulebook-panel__nav-item">
              <a
                href="#"
                class="rulebook-panel__nav-link"
                :class="{ 'rulebook-panel__nav-link--active': effectivePath === item.path }"
                @click.prevent="emitNavigate(item.path)"
              >
                {{ item.title }}
              </a>
            </li>
          </ul>
          <template v-for="(sub, sIdx) in group?.subgroups ?? []" :key="sIdx">
            <h4 class="rulebook-panel__nav-subgroup-title">{{ sub.title }}</h4>
            <ul class="rulebook-panel__nav-list">
              <li v-for="item in sub.children" :key="item.path" class="rulebook-panel__nav-item">
                <a
                  href="#"
                  class="rulebook-panel__nav-link"
                  :class="{ 'rulebook-panel__nav-link--active': effectivePath === item.path }"
                  @click.prevent="emitNavigate(item.path)"
                >
                  {{ item.title }}
                </a>
              </li>
            </ul>
          </template>
        </div>
      </nav>
    </aside>
    <div class="rulebook-panel__main">
      <article ref="contentRef" class="rulebook-panel__content">
        <template v-if="currentPage">
          <h1 class="rulebook-panel__content-title">{{ currentPage.title }}</h1>
          <div
            class="rulebook-panel__body markdown"
            v-html="renderedContent"
            @click="onContentClick"
          />
        </template>
        <template v-else>
          <p class="rulebook-panel__empty">Select a page from the sidebar.</p>
        </template>
      </article>
    </div>
  </div>
</template>

<style>
/* Unscoped so the same styles apply in both app and plugin; class names are unique (rulebook-panel__*) */
.rulebook-panel {
  display: flex;
  flex-direction: column;
  position: relative;
  flex: 1;
  min-height: 0;
  height: 100%;
  isolation: isolate;
}
.rulebook-panel__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  min-height: 3.5rem;
  flex-shrink: 0;
  border-bottom: 1px solid var(--rulebook-border, #ddd);
  background-color: #fff;
  background-color: var(--background-primary, #fff);
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  z-index: 102;
  isolation: isolate;
}
.rulebook-panel__menu-btn {
  display: flex;
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  border: 1px solid var(--rulebook-border, #ddd);
  border-radius: 4px;
  background: var(--callout-bg, #f8f9fa);
  color: inherit;
  cursor: pointer;
  font-size: 1.25rem;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.rulebook-panel__menu-btn:hover {
  background: var(--background-modifier-hover, rgba(0, 0, 0, 0.05));
}
.rulebook-panel__backdrop {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.35);
  z-index: 100;
  pointer-events: auto;
}
.rulebook-panel__sidebar {
  position: absolute;
  left: 0;
  top: 3.5rem;
  height: calc(100% - 3.5rem);
  width: 16rem;
  max-width: 85vw;
  min-width: 16rem;
  z-index: 101;
  isolation: isolate;
  background-color: #fff !important;
  border-right: 1px solid var(--rulebook-border, #ddd);
  padding: 1rem;
  overflow-y: auto;
  overflow-x: hidden;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
  box-sizing: border-box;
}
.rulebook-panel__sidebar-header {
  display: flex;
  align-items: center;
  margin-bottom: 0.75rem;
}
.rulebook-panel__sidebar-title {
  font-size: 1rem;
  margin: 0;
}
.rulebook-panel__search {
  position: relative;
  flex: 1;
  min-width: 0;
  max-width: 24rem;
}
.rulebook-panel__search-input {
  width: 100%;
  padding: 0.4rem 0.6rem;
  font-size: 0.9rem;
  border: 1px solid var(--rulebook-border, #ddd);
  border-radius: 4px;
  background: var(--background-primary, #fff);
  color: inherit;
  box-sizing: border-box;
}
.rulebook-panel__search-results {
  list-style: none;
  margin: 0;
  padding: 0;
  position: absolute;
  top: calc(100% + 0.25rem);
  left: 0;
  right: 0;
  max-height: 60vh;
  overflow-y: auto;
  border: 1px solid var(--rulebook-border, #ddd);
  border-radius: 4px;
  background: var(--background-primary, #fff);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 103;
}
.rulebook-panel__search-result {
  border-bottom: 1px solid var(--rulebook-border, #eee);
}
.rulebook-panel__search-result:last-child {
  border-bottom: none;
}
.rulebook-panel__search-link {
  display: block;
  padding: 0.4rem 0.6rem;
  font-size: 0.85rem;
  color: var(--link-color, #396cd8);
  text-decoration: none;
}
.rulebook-panel__search-link:hover {
  background: var(--background-modifier-hover, rgba(0, 0, 0, 0.05));
}
.rulebook-panel__search-breadcrumb {
  display: block;
  line-height: 1.3;
}
.rulebook-panel__nav-group {
  margin-bottom: 1rem;
}
.rulebook-panel__nav-group-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted, #666);
  margin: 0 0 0.35rem 0;
}
.rulebook-panel__nav-subgroup-title {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted, #666);
  margin: 0.6rem 0 0.35rem 0;
  padding-left: 0.5rem;
}
.rulebook-panel__nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.rulebook-panel__nav-item {
  margin: 0;
}
.rulebook-panel__nav-link {
  display: block;
  padding: 0.25rem 0;
  font-size: 0.9rem;
  color: var(--link-color, #396cd8);
  text-decoration: none;
}
.rulebook-panel__nav-link:hover {
  text-decoration: underline;
}
.rulebook-panel__nav-link--active {
  font-weight: 600;
}
.rulebook-panel__main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  z-index: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}
.rulebook-panel__content {
  padding: 1.5rem 2rem;
  padding-top: 3.5rem;
  max-width: 50rem;
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}
.rulebook-panel__content-title {
  font-size: 1.5rem;
  margin: 0 0 1rem 0;
}
.rulebook-panel__body {
  font-size: 0.95rem;
  line-height: 1.6;
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}
.rulebook-panel__empty {
  color: var(--text-muted, #666);
}
</style>

<style lang="css">
.rulebook-panel .markdown h2 {
  font-size: 1.15rem;
  margin: 1.25rem 0 0.5rem 0;
}
.rulebook-panel .markdown h3 {
  font-size: 1.05rem;
  margin: 1rem 0 0.35rem 0;
}
.rulebook-panel .markdown p {
  margin: 0 0 0.75rem 0;
}
.rulebook-panel .markdown ul,
.rulebook-panel .markdown ol {
  margin: 0 0 0.75rem 0;
  padding-left: 1.5rem;
}
.rulebook-panel .markdown pre {
  background: var(--code-bg, #f5f5f5);
  padding: 0.75rem;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.85rem;
}
.rulebook-panel .markdown code {
  font-family: ui-monospace, monospace;
  font-size: 0.9em;
}
.rulebook-panel .markdown blockquote {
  border-left: 4px solid var(--rulebook-border, #ddd);
  margin: 0.75rem 0;
  padding-left: 1rem;
  color: var(--text-muted, #555);
}
.rulebook-panel .markdown .callout {
  margin: 1rem 0;
  padding: 0;
  border-radius: 6px;
  border: 1px solid var(--callout-border, #ddd);
  border-left-width: 4px;
  background: var(--callout-bg, #f8f9fa);
}
.rulebook-panel .markdown .callout .callout-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-weight: 600;
  background: var(--callout-title-bg, rgba(0, 0, 0, 0.04));
}
.rulebook-panel .markdown .callout .callout-title-icon {
  display: flex;
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  color: var(--callout-accent);
}
.rulebook-panel .markdown .callout .callout-title-icon svg {
  width: 100%;
  height: 100%;
}
.rulebook-panel .markdown .callout .callout-title-inner {
  flex: 1;
}
.rulebook-panel .markdown .callout .callout-content {
  padding: 0.75rem 1rem;
}
.rulebook-panel .markdown .callout[data-callout="note"] {
  --callout-accent: #0969da;
  --callout-border: #54aeff66;
  --callout-bg: #ddf4ff;
  --callout-title-bg: #b6e3ff80;
}
.rulebook-panel .markdown .callout[data-callout="tip"],
.rulebook-panel .markdown .callout[data-callout="hint"],
.rulebook-panel .markdown .callout[data-callout="important"] {
  --callout-accent: #1a7f37;
  --callout-border: #4ade8066;
  --callout-bg: #dafbe1;
  --callout-title-bg: #9ee6a680;
}
.rulebook-panel .markdown .callout[data-callout="warning"],
.rulebook-panel .markdown .callout[data-callout="caution"],
.rulebook-panel .markdown .callout[data-callout="attention"] {
  --callout-accent: #9a6700;
  --callout-border: #e0b35466;
  --callout-bg: #fff8c5;
  --callout-title-bg: #f7e69e80;
}
.rulebook-panel .markdown .callout[data-callout="danger"],
.rulebook-panel .markdown .callout[data-callout="error"] {
  --callout-accent: #cf222e;
  --callout-border: #ff7b7266;
  --callout-bg: #ffebe9;
  --callout-title-bg: #ffcecb80;
}
.rulebook-panel .markdown .callout[data-callout="info"] {
  --callout-accent: #0550ae;
  --callout-border: #54aeff66;
  --callout-bg: #ddf4ff;
  --callout-title-bg: #b6e3ff80;
}
.rulebook-panel .markdown .callout[data-callout="abstract"],
.rulebook-panel .markdown .callout[data-callout="summary"],
.rulebook-panel .markdown .callout[data-callout="tldr"] {
  --callout-accent: #8250df;
  --callout-border: #c297ff66;
  --callout-bg: #fbefff;
  --callout-title-bg: #e2d5ff80;
}
.rulebook-panel .markdown .callout[data-callout="success"],
.rulebook-panel .markdown .callout[data-callout="check"],
.rulebook-panel .markdown .callout[data-callout="done"] {
  --callout-accent: #1a7f37;
  --callout-border: #4ade8066;
  --callout-bg: #dafbe1;
  --callout-title-bg: #9ee6a680;
}
.rulebook-panel .markdown .callout[data-callout="question"],
.rulebook-panel .markdown .callout[data-callout="faq"],
.rulebook-panel .markdown .callout[data-callout="help"] {
  --callout-accent: #a43fb1;
  --callout-border: #e879f966;
  --callout-bg: #fdf4ff;
  --callout-title-bg: #f5d0fe80;
}
.rulebook-panel .markdown .callout[data-callout="quote"],
.rulebook-panel .markdown .callout[data-callout="cite"] {
  --callout-accent: #6e7781;
  --callout-border: #afb8c166;
  --callout-bg: #f6f8fa;
  --callout-title-bg: rgba(0, 0, 0, 0.04);
}
.rulebook-panel .markdown a.wikilink {
  color: var(--link-color, #0969da);
  text-decoration: none;
}
.rulebook-panel .markdown a.wikilink:hover {
  text-decoration: underline;
}
.rulebook-panel .markdown a.wikilink-unresolved {
  color: #cf222e;
  cursor: help;
}
.rulebook-panel .markdown .rulebook-table-wrapper {
  overflow-x: auto;
  max-width: 100%;
}
.rulebook-panel .markdown table {
  border-collapse: collapse;
  font-size: 0.9rem;
}
.rulebook-panel .markdown th,
.rulebook-panel .markdown td {
  border: 1px solid var(--rulebook-border, #ddd);
  padding: 0.35rem 0.5rem;
  text-align: left;
}
.rulebook-panel .markdown th {
  background: var(--code-bg, #f5f5f5);
}
</style>
