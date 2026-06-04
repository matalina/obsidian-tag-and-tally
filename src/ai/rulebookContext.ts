import { createDocsFuse } from "@tag-and-tally/shared-ui/logic";
import type TextMapperPlugin from "../main";
import { rulebookPayload } from "../docs/rulebook";
import { searchIndex } from "../docs/search-index";
import { streamChatCompletion, type ChatMessage } from "./lmClient";

/** Char budget for the retrieved rulebook excerpts sent as context to the answer call. */
export const RULE_CONTEXT_MAX_CHARS = 40_000;

const KEYWORD_EXTRACTION_PROMPT = `You will receive a single question about the Tag & Tally tabletop RPG rules.

Output ONLY a JSON array of 1 to 8 short search terms (1 to 3 words each) that would best find the relevant rules in a fuzzy search index. Focus on rule-specific concepts (e.g. "resolution", "wounds", "tags", "DC", "cheat sheet"). Skip common filler words.

Output the JSON array and nothing else — no preamble, no explanation, no code fences.`;

type DocsFuse = ReturnType<typeof createDocsFuse>;

let cachedFuse: DocsFuse | null = null;

function getFuse(): DocsFuse {
  if (!cachedFuse) cachedFuse = createDocsFuse(searchIndex);
  return cachedFuse;
}

/** Map a search-index URL (e.g. "/mechanics/core/game-sentences/#section") to a rulebook page path. */
function urlToPagePath(url: string): string {
  return url.replace(/#.*$/, "").replace(/^\/+|\/+$/g, "");
}

let pageByPath: Map<string, (typeof rulebookPayload.pages)[number]> | null = null;

function getPage(path: string) {
  if (!pageByPath) {
    pageByPath = new Map();
    for (const page of rulebookPayload.pages) pageByPath.set(page.path, page);
  }
  return pageByPath.get(path);
}

/** Naive fallback when the model's keyword response can't be parsed. Splits on non-word chars, drops short/common words. */
function fallbackKeywords(question: string): string[] {
  const stop = new Set([
    "the","a","an","and","or","but","is","are","was","were","be","been","being",
    "of","in","on","at","to","for","with","from","by","as","that","this","these",
    "those","it","its","do","does","did","how","what","why","when","where","which",
    "who","whom","can","could","should","would","may","might","will","shall","my",
    "your","i","you","we","they","them","us","our","their","if","not","no","yes",
  ]);
  const tokens = question
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 3 && !stop.has(t));
  return Array.from(new Set(tokens)).slice(0, 8);
}

function parseKeywordResponse(raw: string): string[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Tolerate code fences / surrounding prose by extracting the first [...] block.
  const match = trimmed.match(/\[[\s\S]*?\]/);
  const jsonText = match ? match[0] : trimmed;
  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return null;
    const keywords = parsed
      .map((k) => (typeof k === "string" ? k.trim() : ""))
      .filter(Boolean);
    return keywords.length > 0 ? keywords : null;
  } catch {
    return null;
  }
}

/**
 * Ask the LM to convert the user's question into a small set of fuse-search keywords.
 * Falls back to a regex tokenizer if the call fails or the response can't be parsed.
 */
export async function extractRuleKeywords(params: {
  plugin: TextMapperPlugin;
  question: string;
  signal: AbortSignal;
}): Promise<string[]> {
  const { plugin, question, signal } = params;
  const settings = plugin.aiSettings;
  if (!settings.model.trim()) return fallbackKeywords(question);

  const messages: ChatMessage[] = [
    { role: "system", content: KEYWORD_EXTRACTION_PROMPT },
    { role: "user", content: question },
  ];

  try {
    const result = await streamChatCompletion({
      baseUrl: settings.lmStudioBaseUrl,
      apiKey: settings.apiKey,
      model: settings.model.trim(),
      messages,
      tools: [],
      signal,
    });
    const parsed = parseKeywordResponse(result.message.content ?? "");
    if (parsed && parsed.length > 0) return parsed;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    console.warn("Tag and Tally AI: keyword extraction failed, falling back.", err);
  }
  return fallbackKeywords(question);
}

/**
 * Run fuse.js over the heading-level docs search index with the given keywords, dedupe
 * the hits by page, then return the FULL page content (from rulebookPayload) for each
 * matched page packed up to `maxChars`.
 *
 * Full-page retrieval is required because the search-index entries truncate content at
 * ~1000 chars per heading, and game-sentence templates (the canonical core of the
 * system) can be cut mid-template by that truncation. The downstream prompt asks the
 * model to reproduce those templates verbatim, so the full page must be available.
 */
export function searchRulebook(
  keywords: string[],
  maxChars: number = RULE_CONTEXT_MAX_CHARS,
): { context: string; hits: number; pages: string[] } {
  if (keywords.length === 0) return { context: "", hits: 0, pages: [] };

  const fuse = getFuse();
  // useExtendedSearch is enabled in DOCS_FUSE_OPTIONS; "a | b" ORs terms.
  const query = keywords.map((k) => k.trim()).filter(Boolean).join(" | ");
  if (!query) return { context: "", hits: 0, pages: [] };

  const results = fuse.search(query, { limit: 60 });

  // Dedupe by page path; keep first occurrence (best score, since fuse returns sorted).
  const orderedPaths: string[] = [];
  const seenPaths = new Set<string>();
  for (const r of results) {
    const path = urlToPagePath(r.item.url);
    if (!path || seenPaths.has(path)) continue;
    seenPaths.add(path);
    orderedPaths.push(path);
  }

  const blocks: string[] = [];
  const includedPaths: string[] = [];
  let used = 0;
  for (const path of orderedPaths) {
    const page = getPage(path);
    if (!page) continue;
    const block = `## ${page.title}\n/${path}/\n\n${page.content.trim()}`;
    if (used > 0 && used + block.length > maxChars) break;
    blocks.push(block);
    includedPaths.push(path);
    used += block.length;
    if (used >= maxChars) break;
  }

  return {
    context: blocks.join("\n\n---\n\n"),
    hits: blocks.length,
    pages: includedPaths,
  };
}
