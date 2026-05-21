import { TFile } from "obsidian";
import { VaultScope } from "../vaultScope";
import type { ToolModule } from "./types";

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n\n… [truncated, ${s.length - max} chars omitted]`;
}

export const readFileTool: ToolModule = {
  schema: {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read the full text of a note or file in the vault by vault-relative path. Use when you need exact file contents.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative path, e.g. folder/note.md",
          },
        },
        required: ["path"],
      },
    },
  },
  async handler(args, ctx) {
    const path = typeof args.path === "string" ? args.path : "";
    const n = VaultScope.normalizePathOrNull(path);
    if (n == null) return "Error: invalid path.";
    if (!ctx.scope.isPathAllowed(n))
      return "Error: path not allowed by plugin access settings.";
    const f = ctx.app.vault.getAbstractFileByPath(n);
    if (!f || !(f instanceof TFile)) return `Error: file not found: ${n}`;
    const text = await ctx.app.vault.read(f);
    return clip(text, ctx.settings.maxToolOutputChars);
  },
};
