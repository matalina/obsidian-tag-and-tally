import { normalizePath } from "obsidian";
import type { AiPluginSettings } from "./settings";

function safeNormalize(p: string): string | null {
  const t = p.trim();
  if (!t || t.includes("..")) return null;
  return normalizePath(t);
}

/**
 * Enforces vault-relative path access. Conversation folder is always allowed
 * for read/write/search (persistence and user-requested retrieval).
 */
export class VaultScope {
  constructor(private settings: AiPluginSettings) {}

  get conversationFolderNormalized(): string {
    const n = safeNormalize(this.settings.conversationFolder);
    return n ?? "_chat";
  }

  isUnderConversationFolder(vaultRelativePath: string): boolean {
    const path = safeNormalize(vaultRelativePath);
    if (path == null) return false;
    const conv = this.conversationFolderNormalized;
    return path === conv || path.startsWith(conv + "/");
  }

  isPathAllowed(vaultRelativePath: string): boolean {
    const path = safeNormalize(vaultRelativePath);
    if (path == null) return false;
    if (this.isUnderConversationFolder(path)) return true;

    switch (this.settings.accessMode) {
      case "whole_vault":
        return true;
      case "folders": {
        for (const raw of this.settings.allowedFolders) {
          const folder = safeNormalize(raw);
          if (folder == null) continue;
          if (path === folder || path.startsWith(folder + "/")) return true;
        }
        return false;
      }
      case "files": {
        for (const raw of this.settings.allowedFiles) {
          const file = safeNormalize(raw);
          if (file != null && path === file) return true;
        }
        return false;
      }
      default:
        return false;
    }
  }

  /** Normalize a user-supplied path for lookups; returns null if invalid. */
  static normalizePathOrNull(p: string): string | null {
    return safeNormalize(p);
  }
}
