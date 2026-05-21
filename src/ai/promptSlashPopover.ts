import type { PromptManager, PromptEntry } from "./promptManager";

export interface PromptSlashCandidate {
  name: string;
  label: string;
}

const MAX_CANDIDATES = 100;
const SLASH_WORD = /^[\w-]+$/;
const LEADING_SLASH_CHAIN = /^(?:\/[\w-]+\s+)*$/;

/**
 * If the caret is inside an active `/slash` command at a valid leading position
 * (start of text, or immediately after a chain of completed `/name ` prefixes),
 * return the replace range and the partial query.
 */
export function getActivePromptSlashRange(
  text: string,
  caret: number,
): { start: number; end: number; query: string } | null {
  const before = text.slice(0, caret);
  const lastSlash = before.lastIndexOf("/");
  if (lastSlash < 0) return null;
  const afterSlash = before.slice(lastSlash + 1);
  if (afterSlash.length > 0 && !SLASH_WORD.test(afterSlash)) return null;
  const priorPart = before.slice(0, lastSlash);
  if (!LEADING_SLASH_CHAIN.test(priorPart)) return null;
  return { start: lastSlash, end: caret, query: afterSlash };
}

export function getPromptSlashCandidates(
  manager: PromptManager,
  query: string,
): PromptSlashCandidate[] {
  const q = query.trim().toLowerCase();
  const entries: PromptEntry[] = manager.listSync();
  const out: PromptSlashCandidate[] = [];
  for (const e of entries) {
    if (q) {
      const matches =
        e.name.toLowerCase().includes(q) ||
        e.triggers.some((t) => t.toLowerCase().includes(q));
      if (!matches) continue;
    }
    out.push({ name: e.name, label: e.label });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out.slice(0, MAX_CANDIDATES);
}

export function insertPromptSlash(
  text: string,
  range: { start: number; end: number },
  caret: number,
  promptName: string,
): { value: string; caret: number } {
  const before = text.slice(0, range.start);
  const after = text.slice(caret);
  const needsSpace = !after.startsWith(" ") && !after.startsWith("\n");
  const insertion = `/${promptName}${needsSpace ? " " : ""}`;
  const value = before + insertion + after;
  const newCaret = before.length + insertion.length;
  return { value, caret: newCaret };
}
