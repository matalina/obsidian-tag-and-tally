import { Notice, normalizePath, TFile } from "obsidian";
import type TextMapperPlugin from "../main";
import { streamChatCompletion, type ChatMessage } from "./lmClient";

const CHARACTER_SUMMARY_PROMPT =
  `You will receive the contents of one or more character files from a tabletop RPG vault. ` +
  `Summarize this character's information concisely but completely. ` +
  `Include personality, key abilities and traits, important relationships, backstory highlights, ` +
  `and any other details relevant to roleplay. ` +
  `Format as clear prose or a short bulleted list. Do not invent details that are not in the files.`;

function folderBasename(folderPath: string): string {
  const slash = folderPath.lastIndexOf("/");
  return slash >= 0 ? folderPath.slice(slash + 1) : folderPath;
}

async function ensureFolder(plugin: TextMapperPlugin, folderPath: string): Promise<void> {
  const parts = folderPath.split("/").filter(Boolean);
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    if (!plugin.app.vault.getAbstractFileByPath(acc)) {
      await plugin.app.vault.createFolder(acc);
    }
  }
}

async function summarizeCharacterFiles(
  plugin: TextMapperPlugin,
  mdFiles: TFile[],
  signal: AbortSignal,
): Promise<string> {
  const sections: string[] = [];
  for (const f of mdFiles) {
    const content = await plugin.app.vault.read(f);
    sections.push(`## ${f.basename}\n\n${content}`);
  }
  const rawContent = sections.join("\n\n---\n\n");

  const settings = plugin.aiSettings;
  const messages: ChatMessage[] = [
    { role: "system", content: CHARACTER_SUMMARY_PROMPT },
    { role: "user", content: rawContent },
  ];

  new Notice("Tag and Tally AI: summarizing character…", 4000);
  const result = await streamChatCompletion({
    baseUrl: settings.lmStudioBaseUrl,
    apiKey: settings.apiKey,
    model: settings.model.trim(),
    messages,
    tools: [],
    signal,
  });

  return (result.message.content ?? "").trim();
}

export async function getCharacterContextMessage(
  plugin: TextMapperPlugin,
  file: TFile,
  signal: AbortSignal,
): Promise<string | null> {
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
  const rawCharacter = fm?.character;
  if (!rawCharacter || typeof rawCharacter !== "string") return null;
  const characterFolder = normalizePath(rawCharacter.trim());
  if (!characterFolder) return null;

  const conversationFolder = (plugin.aiSettings.conversationFolder || "_chat").trim();
  const summaryPath = normalizePath(`${conversationFolder}/${folderBasename(characterFolder)}.md`);

  if (!plugin.refreshedCharacters.has(characterFolder)) {
    // Mark before first await to prevent concurrent double-rebuild
    plugin.refreshedCharacters.add(characterFolder);

    const mdFiles = plugin.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path === characterFolder || f.path.startsWith(characterFolder + "/"));

    if (mdFiles.length === 0) return null;

    const summary = await summarizeCharacterFiles(plugin, mdFiles, signal);
    if (!summary) return null;

    await ensureFolder(plugin, conversationFolder);
    const existing = plugin.app.vault.getAbstractFileByPath(summaryPath);
    if (existing instanceof TFile) {
      await plugin.app.vault.modify(existing, summary);
    } else {
      await plugin.app.vault.create(summaryPath, summary);
    }
  }

  const summaryFile = plugin.app.vault.getAbstractFileByPath(summaryPath);
  if (!(summaryFile instanceof TFile)) return null;
  return plugin.app.vault.read(summaryFile);
}
