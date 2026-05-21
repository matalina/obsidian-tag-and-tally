import { TAbstractFile, TFile, type App } from "obsidian";
import type TextMapperPlugin from "../main";

export interface PromptEntry {
  name: string;
  label: string;
  triggers: string[];
  filePath: string;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

function normalizeFolder(raw: string): string {
  return (raw ?? "").trim().replace(/^\/+|\/+$/g, "");
}

function isInFolder(filePath: string, folder: string): boolean {
  if (!folder) return false;
  const prefix = folder.endsWith("/") ? folder : folder + "/";
  return filePath === folder || filePath.startsWith(prefix);
}

function stripFrontmatter(text: string): string {
  return text.replace(FRONTMATTER_RE, "").trimStart();
}

function coerceTriggers(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((s) => s.length > 0);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

export class PromptManager {
  private readonly app: App;
  private readonly plugin: TextMapperPlugin;
  private readonly getFolder: () => string;
  private readonly cache = new Map<string, PromptEntry>();
  private readonly changeListeners = new Set<() => void>();
  private initialized = false;

  constructor(
    plugin: TextMapperPlugin,
    getFolder: () => string,
  ) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.getFolder = getFolder;
    this.registerListeners();
  }

  onChange(fn: () => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  private emitChange(): void {
    for (const fn of this.changeListeners) {
      try {
        fn();
      } catch (e) {
        console.error("PromptManager: change listener threw", e);
      }
    }
  }

  private registerListeners(): void {
    const { plugin, app } = this;

    plugin.registerEvent(
      app.metadataCache.on("changed", (file) => {
        if (!this.isRelevant(file)) return;
        void this.upsertFromFile(file);
      }),
    );

    plugin.registerEvent(
      app.vault.on("create", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (!this.isRelevant(file)) return;
        void this.upsertFromFile(file);
      }),
    );

    plugin.registerEvent(
      app.vault.on("modify", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (!this.isRelevant(file)) return;
        void this.upsertFromFile(file);
      }),
    );

    plugin.registerEvent(
      app.vault.on("delete", (file) => {
        if (!(file instanceof TFile)) return;
        this.removeByPath(file.path);
      }),
    );

    plugin.registerEvent(
      app.vault.on("rename", (file, oldPath) => {
        this.removeByPath(oldPath);
        if (file instanceof TFile && file.extension === "md" && this.isRelevant(file)) {
          void this.upsertFromFile(file);
        }
      }),
    );
  }

  private isRelevant(file: TAbstractFile): boolean {
    const folder = normalizeFolder(this.getFolder());
    if (!folder) return false;
    if (!(file instanceof TFile)) return false;
    if (file.extension !== "md") return false;
    return isInFolder(file.path, folder);
  }

  private removeByPath(path: string): void {
    let removed = false;
    for (const [name, entry] of this.cache) {
      if (entry.filePath === path) {
        this.cache.delete(name);
        removed = true;
      }
    }
    if (removed) this.emitChange();
  }

  private async upsertFromFile(file: TFile): Promise<void> {
    try {
      const name = file.basename;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
      const label =
        typeof fm.name === "string" ? fm.name.trim() : "";
      const triggers = coerceTriggers(
        (fm as Record<string, unknown>).triggers ??
          (fm as Record<string, unknown>).trigger,
      );
      const raw = await this.app.vault.cachedRead(file);
      const body = stripFrontmatter(raw).trim();
      this.cache.set(name, {
        name,
        label,
        triggers,
        filePath: file.path,
        body,
      });
      this.emitChange();
    } catch (e) {
      console.error("PromptManager: failed to load", file.path, e);
    }
  }

  async refresh(): Promise<void> {
    this.cache.clear();
    const folder = normalizeFolder(this.getFolder());
    if (!folder) {
      this.initialized = true;
      this.emitChange();
      return;
    }
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => isInFolder(f.path, folder));
    for (const f of files) {
      await this.upsertFromFile(f);
    }
    this.initialized = true;
    this.emitChange();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) await this.refresh();
  }

  async list(): Promise<PromptEntry[]> {
    await this.ensureInitialized();
    return [...this.cache.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  listSync(): PromptEntry[] {
    return [...this.cache.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(nameOrTrigger: string): Promise<PromptEntry | null> {
    await this.ensureInitialized();
    const needle = nameOrTrigger.trim().toLowerCase();
    if (!needle) return null;
    const direct = this.cache.get(nameOrTrigger) ?? this.cache.get(needle);
    if (direct) return direct;
    for (const entry of this.cache.values()) {
      if (entry.name.toLowerCase() === needle) return entry;
      if (entry.triggers.some((t) => t.toLowerCase() === needle)) return entry;
    }
    return null;
  }

  async getSystemPrompt(nameOrTrigger: string | null | undefined): Promise<string> {
    if (!nameOrTrigger) return "";
    const entry = await this.get(nameOrTrigger);
    return entry?.body ?? "";
  }
}
