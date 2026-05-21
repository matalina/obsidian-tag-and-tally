import { VaultScope } from "../vaultScope";
import type { ToolModule } from "./types";

const MAX_FILES = 500;

function underFolder(path: string, folder: string): boolean {
  if (!folder) return true;
  return path === folder || path.startsWith(folder + "/");
}

export const listFilesTool: ToolModule = {
  schema: {
    type: "function",
    function: {
      name: "list_files",
      description:
        "List markdown files under a vault folder so you can see what's available before reading any specific one. Use this when the user refers to a folder by name (e.g. 'look in the secrets folder', 'check my field notes') and you need to discover candidates. Returns vault-relative paths. Follow up with read_file to open one. Skips the conversation folder by default.",
      parameters: {
        type: "object",
        properties: {
          folder: {
            type: "string",
            description:
              "Folder path to list (vault-relative, e.g. 'secrets' or 'field notes'). Use '' or '/' for the vault root.",
          },
          recursive: {
            type: "boolean",
            description:
              "Include markdown files in subfolders. Defaults to true.",
          },
          query: {
            type: "string",
            description:
              "Optional case-insensitive substring filter on filename/path (e.g. 'mimic').",
          },
          includeChatHistory: {
            type: "boolean",
            description:
              "When false (the default), files under the conversation folder are skipped.",
          },
        },
        required: ["folder"],
      },
    },
  },
  async handler(args, ctx) {
    const folderRaw =
      typeof args.folder === "string" ? args.folder.trim() : "";
    const folder =
      folderRaw === "" || folderRaw === "/"
        ? ""
        : (VaultScope.normalizePathOrNull(folderRaw) ?? null);
    if (folder === null) return `Error: invalid folder: ${folderRaw}`;

    const recursive = args.recursive !== false;
    const query =
      typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
    const includeChat = args.includeChatHistory === true;

    const files = ctx.app.vault.getMarkdownFiles();
    const hits: string[] = [];

    for (const f of files) {
      if (!ctx.scope.isPathAllowed(f.path)) continue;
      if (!includeChat && ctx.scope.isUnderConversationFolder(f.path)) continue;
      if (!underFolder(f.path, folder)) continue;

      if (!recursive && folder !== "") {
        const rest = f.path.slice(folder.length + 1);
        if (rest.includes("/")) continue;
      } else if (!recursive && folder === "") {
        if (f.path.includes("/")) continue;
      }

      if (query) {
        const lower = f.path.toLowerCase();
        if (!lower.includes(query)) continue;
      }

      hits.push(f.path);
      if (hits.length >= MAX_FILES) break;
    }

    if (hits.length === 0) {
      const label = folder ? `folder "${folder}"` : "vault root";
      return query
        ? `No markdown files in ${label} matching "${query}".`
        : `No markdown files found in ${label}.`;
    }

    hits.sort();
    const header = folder
      ? `Files in "${folder}" (${hits.length}${recursive ? ", recursive" : ", top-level"}):`
      : `Files in vault (${hits.length}${recursive ? ", recursive" : ", top-level"}):`;
    const lines = [header, ...hits.map((p) => `- ${p}`)];
    if (hits.length >= MAX_FILES) {
      lines.push(`... (capped at ${MAX_FILES}; narrow with 'query' or a deeper folder)`);
    }
    return lines.join("\n");
  },
};
