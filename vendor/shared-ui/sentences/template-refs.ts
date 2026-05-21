/**
 * Read-only helper for Random Table tab: extract table refs from sentence templates
 * so the tab can filter "tables used by this sentence type". No generator changes.
 */
import { SENTENCE_TEMPLATES } from "./utils";

const REF_REGEX = /\{([^}]+)\}/g;

const THEME_PREFIXES = ["fantasy", "modern", "monster-hunter"];

/**
 * Extract all {ref} strings from the template for a sentence type.
 */
export function getTableRefsForSentenceType(sentenceType: string): string[] {
  const template = SENTENCE_TEMPLATES[sentenceType];
  if (!template) return [];
  const refs: string[] = [];
  let m: RegExpExecArray | null;
  REF_REGEX.lastIndex = 0;
  while ((m = REF_REGEX.exec(template)) !== null) {
    const ref = m[1].trim();
    if (ref && !refs.includes(ref)) refs.push(ref);
  }
  return refs;
}

/**
 * Given template refs and the list of all table names in the store,
 * return the table names that this sentence type uses (for filtering the Random Table tab).
 * - Exact refs that exist as table names are included.
 * - Refs like "scene-[scene-type]" expand to all table names starting with "scene-".
 * - Refs like "(theme)-descriptor" expand to "fantasy-descriptor", "modern-descriptor", etc. when they exist.
 * - When sentenceType is "NPC/Character", all tables whose name starts with "character-" are included
 *   (template only lists a few refs; generator and NPC appearance use many more character-* tables).
 * - When theme is provided (e.g. "fantasy"), (theme)-refs expand only to that theme's tables; otherwise all themes.
 */
export function resolveTableRefsToNames(
  refs: string[],
  allTableNames: string[],
  sentenceType?: string,
  theme?: string
): string[] {
  const nameSet = new Set<string>();
  const lowerNames = new Set(allTableNames.map((n) => n.toLowerCase()));
  const themesToUse = theme
    ? [theme.toLowerCase()]
    : THEME_PREFIXES;

  if (sentenceType === "NPC/Character") {
    for (const name of allTableNames) {
      if (name.toLowerCase().startsWith("character-")) nameSet.add(name);
    }
  }

  for (const ref of refs) {
    const refLower = ref.toLowerCase();
    // Exact match
    if (lowerNames.has(refLower)) {
      const exact = allTableNames.find((n) => n.toLowerCase() === refLower);
      if (exact) nameSet.add(exact);
      continue;
    }
    // Dynamic: table-[value] -> prefix "table-"
    const dynamicMatch = refLower.match(/^(.+?)-\[.+\]$/);
    if (dynamicMatch) {
      const prefix = dynamicMatch[1] + "-";
      for (const name of allTableNames) {
        if (name.toLowerCase().startsWith(prefix)) nameSet.add(name);
      }
      continue;
    }
    // (theme)-suffix -> fantasy-suffix, modern-suffix, ... (or single theme when theme param set)
    // (theme)-prefix-[dynamic] -> all tables matching theme-prefix-* (e.g. (theme)-type-[option] -> fantasy-type-*, modern-type-*)
    if (refLower.startsWith("(theme)-")) {
      const suffix = refLower.slice("(theme)-".length);
      if (suffix.includes("[")) {
        const prefix = suffix.slice(0, suffix.indexOf("-["));
        for (const t of themesToUse) {
          const tablePrefix = `${t}-${prefix}-`;
          for (const name of allTableNames) {
            if (name.toLowerCase().startsWith(tablePrefix)) nameSet.add(name);
          }
        }
      } else {
        for (const t of themesToUse) {
          const candidate = `${t}-${suffix}`;
          if (lowerNames.has(candidate)) {
            const exact = allTableNames.find((n) => n.toLowerCase() === candidate);
            if (exact) nameSet.add(exact);
          }
        }
      }
      continue;
    }
    // Optional: refs that look like "something-suffix" but aren't in store - skip (no expansion)
  }

  return Array.from(nameSet).sort();
}

export const THEME_PRESET_LABELS: Record<string, string> = {
  fantasy: "Fantasy",
  modern: "Modern",
  "monster-hunter": "Monster Hunter",
};

export function getSentenceTypeKeys(): string[] {
  return Object.keys(SENTENCE_TEMPLATES);
}
