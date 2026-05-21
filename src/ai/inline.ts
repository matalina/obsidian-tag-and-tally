import { Notice, TFile } from "obsidian";
import type TextMapperPlugin from "../main";
import { getCharacterContextMessage } from "./characterContext";
import { streamChatCompletion, type ChatMessage } from "./lmClient";

/** Matches `ai:command` or `ai:command:gm display name` inline backtick code. */
export const AI_REGEX = /`ai\s*:\s*(\w+)(?:\s*:\s*([^`]+?))?\s*`/;
export const AI_REGEX_G = /`ai\s*:\s*(\w+)(?:\s*:\s*([^`]+?))?\s*`/g;

/** In-prompt textual marker that tells the model where the command sits in the document. Never written to the vault. */
export const SUMMARY_MARKER = "<<SUMMARY_HERE>>";
export const EVAL_MARKER = "<<EVAL_HERE>>";

export type AiCommand = "summary" | "eval";

/**
 * Base prompts are always sent — they teach the model how to locate the marker, how to read a
 * resolution block, and how to use the character summary that getCharacterContextMessage attaches
 * as an earlier system message. They are NOT user-overridable.
 */
export const BASE_SUMMARY_PROMPT = `You will receive the full text of a Markdown note as the user message. The user has placed the marker ${SUMMARY_MARKER} at the position they want summarized up to. Summarize the content of the note that appears BEFORE the marker; ignore content after it.

If a "character" key is present in the note's YAML frontmatter, an earlier system message contains a summary of that character (built from the files in that folder). Read it and weight the summary toward what is most relevant to that character's arc, goals, and current situation.

A separate system message supplies the user's stylistic preferences (length, tone, output format). Apply those preferences to shape the output.`;

export const BASE_EVAL_PROMPT = `You will receive the full text of a Markdown note as the user message. The user has placed the marker ${EVAL_MARKER} at the position they want interpreted.

Find the LAST resolution block that appears BEFORE the marker. A resolution block looks like:

**Type**
DC X → Y » Result
[optional third line with flavor or comma-separated keywords]

Interpret only that one block in narrative terms.

If a "character" key is present in the note's YAML frontmatter, an earlier system message contains a summary of that character (built from the files in that folder). Read both the note and the character summary and let the character's traits, abilities, relationships, and current situation inform the interpretation of the result.

A separate system message supplies the user's stylistic preferences (length, tone, output format). Apply those preferences to shape the output.`;

/** Default user-style portion — appended to the base prompt when no override file is present. */
export const DEFAULT_USER_SUMMARY_PROMPT = `Output 3 to 6 bullet points in present tense. Do not include the document title. Do not include a heading. Do not invent details that are not in the note. Output only the bullets, with no preamble and no closing remarks.`;

export const DEFAULT_USER_EVAL_PROMPT = `Output 2 to 4 sentences describing what happens in the fiction. If a third line of keywords is present in the resolution block, weave them in as inspiration. If a GM personality system prompt is in effect, match its tone. Do not include headers, do not restate the dice math, do not add meta-commentary. Output only the narration.`;

/** Quote-prefix every line of `body` for callout content. Empty lines become bare `>`. */
function quoteLines(body: string): string {
  return body
    .split("\n")
    .map((line) => (line.length === 0 ? ">" : `> ${line}`))
    .join("\n");
}

export function formatAiCallout(command: AiCommand, body: string): string {
  const title = command === "summary" ? "Summary" : "Evaluation";
  return `> [!ai] ${title}\n${quoteLines(body.trim())}`;
}

export function formatAiErrorCallout(reason: string): string {
  return `> [!ai]- Error\n${quoteLines(reason)}`;
}

export function buildInflightKey(filePath: string, position: number, originalBacktick: string): string {
  return `${filePath}::${position}::${originalBacktick}`;
}

async function findGmEntryBody(
  plugin: TextMapperPlugin,
  displayName: string | null,
): Promise<string> {
  if (!displayName) return "";
  const target = displayName.trim().toLowerCase();
  if (!target) return "";
  const entries = await plugin.gmPromptManager.list();
  for (const entry of entries) {
    const label = (entry.label || entry.name).trim().toLowerCase();
    if (label === target) return entry.body;
  }
  return "";
}

function getBaseCommandPrompt(command: AiCommand): string {
  return command === "summary" ? BASE_SUMMARY_PROMPT : BASE_EVAL_PROMPT;
}

/** User-style portion: their override file from the system prompt folder, or a built-in default. */
async function loadUserCommandPrompt(
  plugin: TextMapperPlugin,
  command: AiCommand,
): Promise<string> {
  const filename =
    command === "summary"
      ? plugin.aiSettings.summaryPromptFile
      : plugin.aiSettings.evalPromptFile;
  if (filename) {
    const entry = await plugin.promptManager.get(filename);
    if (entry?.body) return entry.body;
  }
  return command === "summary"
    ? DEFAULT_USER_SUMMARY_PROMPT
    : DEFAULT_USER_EVAL_PROMPT;
}

async function runAiInlineCall(params: {
  plugin: TextMapperPlugin;
  file: TFile;
  command: AiCommand;
  gmName: string | null;
  documentSnapshot: string;
  signal: AbortSignal;
}): Promise<string> {
  const { plugin, file, command, gmName, documentSnapshot, signal } = params;
  const settings = plugin.aiSettings;

  if (!settings.model.trim()) {
    throw new Error(
      "Set a model name in Tag and Tally AI settings (must match LM Studio).",
    );
  }

  const gmBody = await findGmEntryBody(plugin, gmName);
  const characterContext = await getCharacterContextMessage(plugin, file, signal);
  const globalEntries = await plugin.globalPromptManager.list();
  const basePrompt = getBaseCommandPrompt(command);
  const userPrompt = await loadUserCommandPrompt(plugin, command);

  const systemMessages: ChatMessage[] = [];
  if (gmBody) systemMessages.push({ role: "system", content: gmBody });
  if (characterContext) systemMessages.push({ role: "system", content: characterContext });
  for (const entry of globalEntries) {
    if (entry.body) systemMessages.push({ role: "system", content: entry.body });
  }
  systemMessages.push({ role: "system", content: basePrompt });
  if (userPrompt.trim()) {
    systemMessages.push({ role: "system", content: userPrompt });
  }

  const messages: ChatMessage[] = [
    ...systemMessages,
    { role: "user", content: documentSnapshot },
  ];

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

/**
 * Run the AI call for an inline `ai:command[:gm]` backtick and replace the backtick
 * in the file with a callout when it returns. The vault file is NOT modified before
 * the call returns — the in-flight UI is a view-side decoration / DOM pill keyed by
 * `plugin.inflightAi`.
 *
 * `documentSnapshot` is the prompt's user message: the full document text with the
 * matched backtick replaced by a textual marker (SUMMARY_MARKER / EVAL_MARKER).
 * Callers must build it from the freshest source they have (editor state for live
 * preview, vault read for reading view).
 */
export async function kickOffAi(params: {
  plugin: TextMapperPlugin;
  file: TFile;
  originalBacktick: string;
  position: number;
  documentSnapshot: string;
}): Promise<void> {
  const { plugin, file, originalBacktick, position, documentSnapshot } = params;
  const m = originalBacktick.match(AI_REGEX);
  if (!m) return;
  const rawCommand = m[1].toLowerCase();
  if (rawCommand !== "summary" && rawCommand !== "eval") return;
  const command = rawCommand as AiCommand;
  const gmName = m[2]?.trim() || null;

  const key = buildInflightKey(file.path, position, originalBacktick);
  if (plugin.inflightAi.has(key)) return;

  const controller = new AbortController();
  plugin.inflightAi.set(key, controller);

  new Notice(`Tag and Tally AI: ${command} starting…`, 3000);

  try {
    const body = await runAiInlineCall({
      plugin,
      file,
      command,
      gmName,
      documentSnapshot,
      signal: controller.signal,
    });
    const callout = body
      ? formatAiCallout(command, body)
      : formatAiErrorCallout("Empty response from model.");
    await replaceBacktickInFile(plugin, file, originalBacktick, callout);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      // Cancelled (e.g. plugin unload) — leave the backtick in place so the user can retry.
      return;
    }
    const reason = e instanceof Error ? e.message : String(e);
    new Notice(`Tag and Tally AI: ${reason}`, 8000);
    await replaceBacktickInFile(
      plugin,
      file,
      originalBacktick,
      formatAiErrorCallout(reason),
    ).catch(() => {});
  } finally {
    plugin.inflightAi.delete(key);
  }
}

async function replaceBacktickInFile(
  plugin: TextMapperPlugin,
  file: TFile,
  originalBacktick: string,
  replacement: string,
): Promise<void> {
  let replaced = false;
  await plugin.app.vault.process(file, (data) => {
    if (!data.includes(originalBacktick)) return data;
    replaced = true;
    return data.replace(originalBacktick, replacement);
  });
  if (!replaced) {
    console.warn(
      `Tag and Tally AI: could not place result for "${originalBacktick}" in ${file.path} — backtick not found (user likely edited it).`,
    );
  }
}

/**
 * Helper: replace the matched backtick in `text` at `position` with the appropriate
 * marker for the given command. Used when assembling the AI prompt's user message.
 */
export function spliceMarker(
  text: string,
  position: number,
  backtickLength: number,
  command: AiCommand,
): string {
  const marker = command === "summary" ? SUMMARY_MARKER : EVAL_MARKER;
  return text.slice(0, position) + marker + text.slice(position + backtickLength);
}

/** Returns true when this file has any in-flight ai: command. Used for fast view-plugin filtering. */
export function fileHasInflightAi(plugin: TextMapperPlugin, filePath: string): boolean {
  for (const key of plugin.inflightAi.keys()) {
    if (key.startsWith(`${filePath}::`)) return true;
  }
  return false;
}

/** Returns true if the (path, pos, backtick) tuple is currently in-flight. */
export function isBacktickInflight(
  plugin: TextMapperPlugin,
  filePath: string,
  position: number,
  originalBacktick: string,
): boolean {
  return plugin.inflightAi.has(buildInflightKey(filePath, position, originalBacktick));
}
