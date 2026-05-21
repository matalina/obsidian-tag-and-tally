import type { App } from "obsidian";
import { normalizePath } from "obsidian";
import { VaultScope } from "./vaultScope";

export interface MentionCandidate {
  path: string;
  label: string;
}

const MAX_CANDIDATES = 100;

/**
 * If the caret is inside an active @mention query (no whitespace after @), return replace range and query.
 */
export function getActiveMentionRange(
  text: string,
  caret: number,
): { start: number; end: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
  const afterAt = text.slice(at + 1, caret);
  if (afterAt.includes("\n")) return null;
  if (/\s/.test(afterAt)) return null;
  return { start: at, end: caret, query: afterAt };
}

/**
 * Markdown files allowed by scope whose path or basename matches the query (case-insensitive).
 */
export function getMentionCandidates(
  app: App,
  scope: VaultScope,
  query: string,
): MentionCandidate[] {
  const q = query.trim().toLowerCase();
  const out: MentionCandidate[] = [];
  for (const f of app.vault.getMarkdownFiles()) {
    const p = f.path;
    if (!scope.isPathAllowed(p)) continue;
    if (q) {
      const pl = p.toLowerCase();
      const nl = f.name.toLowerCase();
      if (!pl.includes(q) && !nl.includes(q)) continue;
    }
    out.push({ path: p, label: f.name });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out.slice(0, MAX_CANDIDATES);
}

export function insertMentionPath(
  text: string,
  range: { start: number; end: number },
  caret: number,
  vaultPath: string,
): { value: string; caret: number } {
  const normalized = normalizePath(vaultPath);
  const before = text.slice(0, range.start);
  const after = text.slice(caret);
  const insertion = `@${normalized}`;
  const value = before + insertion + after;
  const newCaret = before.length + insertion.length;
  return { value, caret: newCaret };
}
