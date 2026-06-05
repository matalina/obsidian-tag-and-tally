import MarkdownIt, { type Token } from 'markdown-it'
// @ts-expect-error no types published
import markdownItObsidianCallouts from 'markdown-it-obsidian-callouts'
import markdownItAnchor from 'markdown-it-anchor'
import { slugifyHeading } from '../logic/search'

export interface RulebookPageForLookup {
  path: string
  title: string
}

export interface RulebookPage extends RulebookPageForLookup {
  content: string
}

/** TOC-only nav tree: headers (no url) and links (path + url). */
export type TocNavNode =
  | { type: 'header'; title: string; children: TocNavNode[] }
  | { type: 'link'; title: string; path: string; url: string }

export interface RulebookPayload {
  nav: TocNavNode[]
  pages: RulebookPage[]
}

function isHeaderNode(node: TocNavNode): node is TocNavNode & { type: 'header'; children: TocNavNode[] } {
  return (node as { type?: string }).type === 'header' || ('children' in node && Array.isArray((node as { children?: unknown }).children) && !('path' in node))
}

function isLinkNode(node: TocNavNode): node is TocNavNode & { type: 'link'; path: string; url: string; title: string } {
  return (node as { type?: string }).type === 'link' || ('path' in node && 'url' in node)
}

/** Section order and path prefixes matching data/docs/toc.md (so flat nav can be regrouped). */
const SECTION_PREFIXES: { title: string; match: (path: string) => boolean }[] = [
  { title: 'Core', match: (p) => p === 'index' || p === 'guides/play' || p === 'guides/character' || p.startsWith('mechanics/core/') || p === 'tables/resolution-cheat-sheet' },
  { title: 'Foundational Modules', match: (p) => p.startsWith('mechanics/foundational/') },
  { title: 'Optional Modules', match: (p) => p.startsWith('mechanics/optional/') },
  { title: 'Guides', match: (p) => p.startsWith('guides/') && p !== 'guides/play' && p !== 'guides/character' },
  { title: 'Appendix', match: (p) => p === 'glossary' || p === 'legal' || (p.startsWith('tables/') && p !== 'tables/resolution-cheat-sheet') }
]

/** Convert a flat list of links into the 5-section tree (Core, Foundational, Optional, Guides, Appendix). */
function flatLinksToTree(links: TocNavNode[]): TocNavNode[] {
  const result: TocNavNode[] = []
  for (const { title, match } of SECTION_PREFIXES) {
    const children = links.filter((n): n is TocNavNode & { path: string; url: string } => isLinkNode(n) && match(n.path))
    if (children.length) result.push({ type: 'header', title, children })
  }
  return result
}

/** Normalize nav: promote nested headers to top-level, or if nav is a flat list of links rebuild the section tree. */
export function normalizeRulebookNav(nav: TocNavNode[]): TocNavNode[] {
  if (nav.length === 0) return nav
  const allLinks = nav.every(isLinkNode)
  if (allLinks) return flatLinksToTree(nav)
  if (nav.length !== 1) return nav
  const single = nav[0]
  if (!isHeaderNode(single) || !single.children?.length) return nav
  const linkChildren: TocNavNode[] = []
  const headerChildren: TocNavNode[] = []
  for (const c of single.children) {
    if (isHeaderNode(c)) headerChildren.push(c)
    else linkChildren.push(c)
  }
  if (headerChildren.length === 0) return nav
  const first: TocNavNode = { type: 'header', title: single.title, children: linkChildren }
  return [first, ...headerChildren]
}

const UNRESOLVED_SENTINEL = '__unresolved__'

/**
 * Build a lookup map for wikilink resolution (mirrors docs: fileSlug, path segment, title).
 * Keys are normalized (lowercase, spaces to hyphens); values are full paths like "mechanics/core/dice".
 * Also index by full /rulebook/path so [[/rulebook/mechanics/core/dice|Label]] resolves.
 */
function buildWikilinkLookup(pages: RulebookPageForLookup[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const p of pages) {
    const fullPath = `/rulebook/${p.path}`
    // full path as key (for content that already has /rulebook/...)
    const fullKey = fullPath.toLowerCase()
    if (!map.has(fullKey)) map.set(fullKey, fullPath)
    // by path (normalized: lowercase, slashes to hyphens)
    const pathKey = p.path.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-')
    if (!map.has(pathKey)) map.set(pathKey, fullPath)
    // by file slug (last segment)
    const segments = p.path.split('/')
    const slug = segments[segments.length - 1]?.toLowerCase() ?? ''
    if (slug && !map.has(slug)) map.set(slug, fullPath)
    // by title (lowercase, spaces to hyphens)
    const titleKey = p.title.toLowerCase().replace(/\s+/g, '-')
    if (!map.has(titleKey)) map.set(titleKey, fullPath)
    // by title with spaces
    const titleKeyAlt = p.title.toLowerCase().replace(/\s+/g, ' ')
    if (!map.has(titleKeyAlt)) map.set(titleKeyAlt, fullPath)
  }
  return map
}

function normalizeLabel(label: string): string {
  return label.toLowerCase().trim().replace(/\s+/g, '-')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}


function resolveHrefRulebook(pathPart: string, lookup: Map<string, string>): string {
  const trimmed = pathPart.trim()
  if (trimmed.startsWith('/rulebook/') && !trimmed.includes(UNRESOLVED_SENTINEL)) {
    return trimmed
  }
  const key = normalizeLabel(trimmed)
  return lookup.get(key) ?? lookup.get(trimmed.toLowerCase()) ?? '#'
}

function resolveHrefDefault(pathPart: string, lookup: Map<string, string>): string {
  const trimmed = pathPart.trim()
  const key = normalizeLabel(trimmed)
  return lookup.get(key) ?? lookup.get(trimmed.toLowerCase()) ?? '#'
}

type ResolveHref = (pathPart: string, lookup: Map<string, string>) => string

/**
 * Custom wikilink inline rule: runs before 'link' so [[...]] is consumed before standard [text](url).
 * Matches [[path]] and [[path|display]].
 */
function createWikilinkRule(
  getLookup: () => Map<string, string>,
  resolveHref: ResolveHref
) {
  return function wikilinkRule(state: any, silent: boolean): boolean {
    const max = state.posMax
    const start = state.pos
    if (state.src.charCodeAt(start) !== 0x5b || state.src.charCodeAt(start + 1) !== 0x5b) {
      return false
    }
    let pos = start + 2
    let pathPart = ''
    let display = ''
    let hasPipe = false
    while (pos < max) {
      const ch = state.src.charCodeAt(pos)
      if (ch === 0x5d && state.src.charCodeAt(pos + 1) === 0x5d) {
        if (!silent) {
          const lookup = getLookup()
          const href = resolveHref(pathPart, lookup)
          const text = hasPipe && display ? display.trim() : pathPart.trim()
          const token = state.push('wikilink', 'a', 0)
          token.attrs = [
            ['href', href],
            ['class', href === '#' ? 'wikilink wikilink-unresolved' : 'wikilink']
          ]
          token.content = text
        }
        state.pos = pos + 2
        return true
      }
      if (ch === 0x7c && !hasPipe) {
        hasPipe = true
        display = ''
        pos++
      } else if (ch === 0x0a) {
        return false
      } else {
        if (hasPipe) display += state.src[pos]
        else pathPart += state.src[pos]
        pos++
      }
    }
    return false
  }
}

let cachedLookup: Map<string, string> | null = null
let cachedPages: RulebookPageForLookup[] | null = null

function getLookup(pages: RulebookPageForLookup[]): Map<string, string> {
  if (cachedPages === pages && cachedLookup) return cachedLookup
  cachedPages = pages
  cachedLookup = buildWikilinkLookup(pages)
  return cachedLookup
}

/**
 * Internal: create a markdown renderer with callouts and wikilinks using a custom lookup and optional resolve.
 */
function createMarkdownRendererWithLookup(
  getLookup: () => Map<string, string>,
  resolveHref: ResolveHref = resolveHrefDefault
): (content: string) => string {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    /** Convert every newline in paragraphs to <br> (strict line adherence). */
    breaks: true,
  })

  md.inline.ruler.before('link', 'wikilink', createWikilinkRule(getLookup, resolveHref))
  md.renderer.rules.wikilink = (tokens: Token[], idx: number) => {
    const token = tokens[idx]
    if (!token) return ''
    const href = token.attrs?.find((a: [string, string]) => a[0] === 'href')?.[1] ?? '#'
    const cls = token.attrs?.find((a: [string, string]) => a[0] === 'class')?.[1] ?? 'wikilink'
    const text = token.content ?? ''
    return `<a href="${escapeHtml(href)}" class="${cls}">${escapeHtml(text)}</a>`
  }

  md.use(markdownItObsidianCallouts)
  // markdown-it-anchor's plugin signature uses (md, opts) but markdown-it@14 lacks
  // typings for the options overload, so cast to satisfy TS.
  ;(md.use as any)(markdownItAnchor, { slugify: slugifyHeading, level: [2, 3] })

  const defaultTableOpen = md.renderer.rules.table_open
  const defaultTableClose = md.renderer.rules.table_close
  type RenderRuleFn = (tokens: Token[], idx: number, options: unknown, env: import('markdown-it').RendererEnv, self: unknown) => string
  md.renderer.rules.table_open = ((tokens: Token[], idx: number, options: unknown, env: import('markdown-it').RendererEnv, self: unknown) => {
    const out = defaultTableOpen
      ? (defaultTableOpen as RenderRuleFn)(tokens, idx, options, env, self)
      : (self as { renderToken: (t: Token[], i: number, o: unknown) => string }).renderToken(tokens, idx, options)
    return '<div class="rulebook-table-wrapper">' + out
  }) as typeof defaultTableOpen
  md.renderer.rules.table_close = ((tokens: Token[], idx: number, options: unknown, env: import('markdown-it').RendererEnv, self: unknown) => {
    const out = defaultTableClose
      ? ((defaultTableClose as RenderRuleFn)(tokens, idx, options, env, self) as string)
      : (self as { renderToken: (t: Token[], i: number, o: unknown) => string }).renderToken(tokens, idx, options)
    return out + '</div>'
  }) as typeof defaultTableClose

  return (content: string): string => md.render(content)
}

export interface CrossLinkSources {
  journal?: string[]
  lore?: string[]
  character?: string[]
  map?: string[]
}

/**
 * Build a lookup map for cross-section wikilink resolution.
 * Keys are normalized note/file names; values are protocol hrefs (e.g. journal://file.md).
 */
export function buildCrossLinkLookup(sources: CrossLinkSources): Map<string, string> {
  const map = new Map<string, string>()

  function addEntries(paths: string[], protocol: string) {
    for (const p of paths) {
      const href = `${protocol}://${p}`
      const withoutExt = p.replace(/\.md$/i, '').trim()
      const pathKey = p.toLowerCase().trim()
      const slugKey = withoutExt.toLowerCase().replace(/\s+/g, '-')
      const titleKey = withoutExt.toLowerCase().replace(/\s+/g, ' ')
      if (!map.has(pathKey)) map.set(pathKey, href)
      if (slugKey && !map.has(slugKey)) map.set(slugKey, href)
      if (!map.has(titleKey)) map.set(titleKey, href)
    }
  }

  if (sources.journal) addEntries(sources.journal, 'journal')
  if (sources.lore) addEntries(sources.lore, 'lore')
  if (sources.character) addEntries(sources.character, 'character')
  if (sources.map) addEntries(sources.map, 'map')

  return map
}

/**
 * Build a lookup map for journal wikilink resolution (legacy wrapper).
 */
export function buildJournalLookup(notePaths: string[]): Map<string, string> {
  return buildCrossLinkLookup({ journal: notePaths })
}

/**
 * Create a render function for journal/lore markdown (callouts + wikilinks).
 * Supports cross-section linking when sources are provided.
 */
export function createJournalRenderer(
  notePaths: string[],
  crossLinkSources?: CrossLinkSources,
): (content: string) => string {
  const getLookup = () =>
    crossLinkSources
      ? buildCrossLinkLookup(crossLinkSources)
      : buildCrossLinkLookup({ journal: notePaths })
  return createMarkdownRendererWithLookup(getLookup)
}

/**
 * Create a render function that converts rulebook markdown to HTML with callouts and wikilinks.
 * Uses a custom inline rule registered before 'link' so [[...]] is matched (markdown-it-wikilinks
 * used ruler.push so the link rule consumed "[" first and wikilinks never matched).
 */
export function createRulebookRenderer(pages: RulebookPageForLookup[]) {
  const getLookupRef = () => getLookup(pages)
  return createMarkdownRendererWithLookup(getLookupRef, resolveHrefRulebook)
}
