import { TFile, type App } from "obsidian";
import type { AiPluginSettings } from "./settings";
import { VaultScope } from "./vaultScope";

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n\n… [truncated, ${s.length - max} chars omitted]`;
}

/**
 * Collect vault-relative paths from @tokens in the composer (e.g. @folder/note.md).
 */
export function parseAtPaths(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /@([^\s@]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    let p = m[1].trim();
    p = p.replace(/[),.;:]+$/u, "");
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/**
 * Prepend file contents for each @path in the message. Throws on invalid / disallowed / missing paths.
 */
export async function buildAugmentedUserText(
  app: App,
  settings: AiPluginSettings,
  rawUserText: string,
): Promise<string> {
  const paths = parseAtPaths(rawUserText);
  if (paths.length === 0) return rawUserText;

  const scope = new VaultScope(settings);
  const blocks: string[] = [];

  for (const rawPath of paths) {
    const n = VaultScope.normalizePathOrNull(rawPath);
    if (n == null) {
      throw new Error(`Tag and Tally AI: invalid path after @: ${rawPath}`);
    }
    if (!scope.isPathAllowed(n)) {
      throw new Error(`Tag and Tally AI: path not allowed: ${n}`);
    }
    const f = app.vault.getAbstractFileByPath(n);
    if (!f || !(f instanceof TFile)) {
      throw new Error(`Tag and Tally AI: file not found: ${n}`);
    }
    const text = clip(await app.vault.read(f), settings.maxToolOutputChars);
    blocks.push(`### ${n}\n\n${text}`);
  }

  return `[Attachments — inserted by Tag and Tally AI]\n\n${blocks.join(
    "\n\n---\n\n",
  )}\n\n---\n\nUser message:\n\n${rawUserText}`;
}
