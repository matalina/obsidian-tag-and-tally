import { TFile, type Vault } from "obsidian";
import { VaultScope } from "../vaultScope";
import type { ToolModule } from "./types";

async function ensureFolderExists(
  vault: Vault,
  folderPath: string,
): Promise<void> {
  const parts = folderPath.split("/").filter(Boolean);
  let acc = "";
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    if (!vault.getAbstractFileByPath(acc)) {
      await vault.createFolder(acc);
    }
  }
}

export const writeFileTool: ToolModule = {
  schema: {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Create or overwrite a file in the vault. Only use paths the user is allowed to access.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Vault-relative path" },
          content: { type: "string", description: "Full file contents" },
          mode: {
            type: "string",
            enum: ["create", "overwrite"],
            description:
              "create fails if file exists; overwrite replaces existing",
          },
        },
        required: ["path", "content", "mode"],
      },
    },
  },
  async handler(args, ctx) {
    const path = typeof args.path === "string" ? args.path : "";
    const content = typeof args.content === "string" ? args.content : "";
    const mode =
      args.mode === "create" || args.mode === "overwrite"
        ? args.mode
        : "overwrite";
    const n = VaultScope.normalizePathOrNull(path);
    if (n == null) return "Error: invalid path.";
    if (!ctx.scope.isPathAllowed(n))
      return "Error: path not allowed by plugin access settings.";

    const existing = ctx.app.vault.getAbstractFileByPath(n);
    if (existing && mode === "create")
      return "Error: file already exists (mode create).";

    if (existing instanceof TFile) {
      await ctx.app.vault.modify(existing, content);
      return `OK: overwrote ${n}`;
    }

    const parent = n.includes("/") ? n.slice(0, n.lastIndexOf("/")) : "";
    if (parent) await ensureFolderExists(ctx.app.vault, parent);
    await ctx.app.vault.create(n, content);
    return `OK: created ${n}`;
  },
};
