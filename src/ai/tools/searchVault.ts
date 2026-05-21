import { VaultScope } from "../vaultScope";
import type { ToolModule } from "./types";

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  return name.replace(/\.md$/i, "");
}

function underFolder(path: string, folder: string): boolean {
  if (!folder) return true;
  return path === folder || path.startsWith(folder + "/");
}

export const searchVaultTool: ToolModule = {
  schema: {
    type: "function",
    function: {
      name: "search_vault",
      description:
        "Search markdown files in the allowed scope. Matches file path and filename AND file content by default, so a query like 'mimic' hits both files named 'mimic.md' and files whose text mentions 'mimic'. Pass 'folder' to restrict the search to a specific folder and its subfolders — use this when the user names a folder, e.g. folder='secrets' for 'the secrets file for this case', folder='field notes' for 'the field notes about the mimic'. Results are grouped: name/path matches first, then content matches. Skips the conversation folder by default — chat transcripts are not canon.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text to search for" },
          folder: {
            type: "string",
            description:
              "Optional folder path to restrict the search to (vault-relative, e.g. 'secrets' or 'field notes'). Matches files at or under that folder.",
          },
          matchMode: {
            type: "string",
            enum: ["both", "name", "content"],
            description:
              "What to match against. 'both' (default) checks file path/name AND contents. 'name' checks only path/filename. 'content' checks only file text.",
          },
          glob: {
            type: "string",
            description: "Optional file suffix filter, e.g. .md (optional)",
          },
          includeChatHistory: {
            type: "boolean",
            description:
              "When false (the default), files under the conversation folder are skipped so prior chats do not leak into search results. Set true only when the user explicitly asks to look into past conversations.",
          },
        },
        required: ["query"],
      },
    },
  },
  async handler(args, ctx) {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const glob =
      typeof args.glob === "string" ? args.glob.trim().toLowerCase() : "";
    const includeChat = args.includeChatHistory === true;
    const matchMode =
      args.matchMode === "name" || args.matchMode === "content"
        ? args.matchMode
        : "both";
    const folderRaw =
      typeof args.folder === "string" ? args.folder.trim() : "";
    const folder = folderRaw
      ? (VaultScope.normalizePathOrNull(folderRaw) ?? "")
      : "";
    if (folderRaw && !folder) return `Error: invalid folder: ${folderRaw}`;
    if (!query) return "Error: empty query.";

    const qLower = query.toLowerCase();
    const max = Math.max(1, Math.min(500, ctx.settings.maxSearchMatches));
    const files = ctx.app.vault.getMarkdownFiles();

    const nameHits: { path: string }[] = [];
    const contentHits: { path: string; snippet: string }[] = [];

    for (const f of files) {
      if (nameHits.length + contentHits.length >= max) break;
      if (!ctx.scope.isPathAllowed(f.path)) continue;
      if (!includeChat && ctx.scope.isUnderConversationFolder(f.path)) continue;
      if (!underFolder(f.path, folder)) continue;
      if (glob && !f.path.toLowerCase().endsWith(glob)) continue;

      const pathLower = f.path.toLowerCase();
      const baseLower = basename(f.path).toLowerCase();
      const nameMatch =
        matchMode !== "content" &&
        (baseLower.includes(qLower) || pathLower.includes(qLower));

      if (nameMatch) {
        nameHits.push({ path: f.path });
        continue;
      }

      if (matchMode === "name") continue;

      let text: string;
      try {
        text = await ctx.app.vault.cachedRead(f);
      } catch {
        continue;
      }
      const lower = text.toLowerCase();
      const idx = lower.indexOf(qLower);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 80);
      const end = Math.min(text.length, idx + query.length + 120);
      const snippet = text.slice(start, end).replace(/\n/g, " ");
      contentHits.push({ path: f.path, snippet });
    }

    if (nameHits.length === 0 && contentHits.length === 0) {
      const scopeBits: string[] = [];
      if (folder) scopeBits.push(`folder="${folder}"`);
      scopeBits.push(`matchMode=${matchMode}`);
      const suffix = scopeBits.length ? ` (${scopeBits.join(", ")})` : "";
      return includeChat
        ? `No matches in allowed scope${suffix}.`
        : `No matches in allowed scope${suffix}. (Conversation folder excluded — set includeChatHistory=true to search prior chats.)`;
    }

    const lines: string[] = [];
    if (nameHits.length > 0) {
      lines.push(`Name/path matches (${nameHits.length}):`);
      for (const h of nameHits) lines.push(`- ${h.path}`);
    }
    if (contentHits.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push(`Content matches (${contentHits.length}):`);
      for (const h of contentHits) lines.push(`- ${h.path}: …${h.snippet}…`);
    }
    return lines.join("\n");
  },
};
