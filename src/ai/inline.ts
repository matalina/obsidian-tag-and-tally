import { Notice, TFile } from "obsidian";
import type TextMapperPlugin from "../main";
import { getCharacterContextMessage } from "./characterContext";
import { streamChatCompletion, type ChatMessage } from "./lmClient";
import { extractRuleKeywords, searchRulebook } from "./rulebookContext";

/** Matches `ai:command` or `ai:command:gm display name` inline backtick code. */
export const AI_REGEX = /`ai\s*:\s*(\w+)(?:\s*:\s*([^`]+?))?\s*`/;
export const AI_REGEX_G = /`ai\s*:\s*(\w+)(?:\s*:\s*([^`]+?))?\s*`/g;

/** In-prompt textual marker that tells the model where the command sits in the document. Never written to the vault. */
export const SUMMARY_MARKER = "<<SUMMARY_HERE>>";
export const EVAL_MARKER = "<<EVAL_HERE>>";
export const ASK_MARKER = "<<ASK_HERE>>";
export const RULE_MARKER = "<<RULE_HERE>>";

export type AiCommand = "summary" | "eval" | "ask" | "rule";

const VALID_COMMANDS: ReadonlySet<string> = new Set([
  "summary",
  "eval",
  "ask",
  "rule",
]);

export function isAiCommand(value: string): value is AiCommand {
  return VALID_COMMANDS.has(value);
}

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

export const BASE_ASK_PROMPT = `You will receive the full text of a Markdown note as the user message. The user has placed the marker ${ASK_MARKER} at the position where they want an answer inserted.

The user's question is the paragraph immediately above the marker — typically the last non-empty line or block of text before ${ASK_MARKER}. Treat that paragraph as the question. The rest of the document is supporting context that may inform the answer.

Answer the question directly, drawing on the rest of the note as needed. Do not restate the question. Do not add a preamble like "Here is the answer" — go straight into the answer.

If a "character" key is present in the note's YAML frontmatter, an earlier system message contains a summary of that character; weight the answer toward what is relevant to that character when applicable.

A separate system message supplies the user's stylistic preferences (length, tone, output format). Apply those preferences.`;

export const BASE_RULE_PROMPT = `An earlier system message contains rulebook PAGES retrieved by a fuzzy search against the user's question. Each page starts with a "## {title}" line, then a path line, then the full page body. Pages are separated by "---".

The user message is a single question from the player.

CRITICAL — Reproduce game-sentence templates VERBATIM.

The Tag & Tally system is built on "game sentences" — templated lines that always start with a "!type" marker and contain "\\placeholder\\" slots. Examples from the rulebook:

  !scene Scene This scene is a \\descriptor\\ \\scene type\\ that \\does something\\
  !character Character Name is a \\descriptor\\ \\species\\ \\type\\ who \\specializes in\\
  !character NPC Name is a \\descriptor \\species \\type who \\does something special. ...
  !creature Creature Name (\\disposition \\descriptor \\type): This creature \\motivation and attacks with \\attack of choice for \\damage type damage. ...
  !wounds Wounds This wound is a \\descriptor \\type of mark located on \\the body part that \\specific mechanical detriment.

If the user's question is about anything covered by one of these templates (NPC, character, creature, scene, wound, species, type, etc.) and a matching template appears in the retrieved pages, you MUST reproduce the matching sentence(s) WORD-FOR-WORD in their original format — including the leading "!type" marker, every "\\placeholder\\" slot, and every literal word between them. Quote the template FIRST, before any explanation. Do NOT paraphrase, simplify, or expand a template. The templates ARE the mechanic; rewriting them breaks the game.

After quoting any required templates verbatim, you may add a short narrative explanation in your own words.

Other rules:
- Answer using only the retrieved pages. If they do not cover the question, say so plainly — do not invent rules.
- Cite the page title (e.g. "Per Game Sentences, …") so the user can find more.
- Narrative rules text (non-template content) may be paraphrased concisely.

A separate system message supplies the user's stylistic preferences (length, tone, output format). Apply those preferences, but they do NOT override the verbatim-template rule.`;

export const DEFAULT_USER_ASK_PROMPT = `Output a direct answer in 1 to 4 sentences. Do not include headers. Do not restate the question. Do not add meta-commentary like "based on the note" — just answer.`;

export const DEFAULT_USER_RULE_PROMPT = `Cite the relevant rulebook section. If the question is about something with a game-sentence template, quote the template verbatim first (as instructed by the base prompt), then add a 1 to 3 sentence narrative explanation. For questions without a template, answer in 1 to 4 sentences. Do not include headers. Paraphrase non-template rules text concisely. If the rulebook does not cover the question, say so plainly.`;

/** Quote-prefix every line of `body` for callout content. Empty lines become bare `>`. */
function quoteLines(body: string): string {
  return body
    .split("\n")
    .map((line) => (line.length === 0 ? ">" : `> ${line}`))
    .join("\n");
}

const CALLOUT_TITLES: Record<AiCommand, string> = {
  summary: "Summary",
  eval: "Evaluation",
  ask: "Answer",
  rule: "Rule",
};

export function formatAiCallout(command: AiCommand, body: string): string {
  return `> [!ai] ${CALLOUT_TITLES[command]}\n${quoteLines(body.trim())}`;
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

const BASE_PROMPTS: Record<AiCommand, string> = {
  summary: BASE_SUMMARY_PROMPT,
  eval: BASE_EVAL_PROMPT,
  ask: BASE_ASK_PROMPT,
  rule: BASE_RULE_PROMPT,
};

const DEFAULT_USER_PROMPTS: Record<AiCommand, string> = {
  summary: DEFAULT_USER_SUMMARY_PROMPT,
  eval: DEFAULT_USER_EVAL_PROMPT,
  ask: DEFAULT_USER_ASK_PROMPT,
  rule: DEFAULT_USER_RULE_PROMPT,
};

function getBaseCommandPrompt(command: AiCommand): string {
  return BASE_PROMPTS[command];
}

function getPromptFileSetting(
  plugin: TextMapperPlugin,
  command: AiCommand,
): string {
  switch (command) {
    case "summary":
      return plugin.aiSettings.summaryPromptFile;
    case "eval":
      return plugin.aiSettings.evalPromptFile;
    case "ask":
      return plugin.aiSettings.askPromptFile;
    case "rule":
      return plugin.aiSettings.rulePromptFile;
  }
}

/** User-style portion: their override file from the system prompt folder, or a built-in default. */
async function loadUserCommandPrompt(
  plugin: TextMapperPlugin,
  command: AiCommand,
): Promise<string> {
  const filename = getPromptFileSetting(plugin, command);
  if (filename) {
    const entry = await plugin.promptManager.get(filename);
    if (entry?.body) return entry.body;
  }
  return DEFAULT_USER_PROMPTS[command];
}

/**
 * Returns the last non-empty paragraph (text up to the previous blank line / start
 * of file) before `markerPosition`. Used by ai:rule to extract the user's question
 * from the document when the rest of the doc will not be sent to the model.
 */
export function extractQuestionAboveMarker(
  text: string,
  markerPosition: number,
): string {
  const before = text.slice(0, markerPosition).replace(/\s+$/, "");
  if (!before) return "";
  const paragraphs = before.split(/\n\s*\n/);
  return paragraphs[paragraphs.length - 1].trim();
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
  const characterContext =
    command === "rule"
      ? ""
      : await getCharacterContextMessage(plugin, file, signal);
  const globalEntries = await plugin.globalPromptManager.list();
  const basePrompt = getBaseCommandPrompt(command);
  const userPrompt = await loadUserCommandPrompt(plugin, command);

  const systemMessages: ChatMessage[] = [];
  if (gmBody) systemMessages.push({ role: "system", content: gmBody });
  if (characterContext) systemMessages.push({ role: "system", content: characterContext });
  for (const entry of globalEntries) {
    if (entry.body) systemMessages.push({ role: "system", content: entry.body });
  }
  let ruleQuestion = "";
  if (command === "rule") {
    ruleQuestion =
      extractQuestionAboveMarker(
        documentSnapshot,
        documentSnapshot.indexOf(RULE_MARKER),
      ) || documentSnapshot;
    const keywords = await extractRuleKeywords({
      plugin,
      question: ruleQuestion,
      signal,
    });
    const { context, hits } = searchRulebook(keywords);
    const excerptsMessage =
      hits > 0
        ? `Retrieved rulebook pages (search keywords: ${keywords.join(", ")}):\n\n${context}`
        : `No rulebook pages matched the search keywords: ${keywords.join(", ")}. Tell the user you couldn't find relevant rules and suggest they rephrase.`;
    systemMessages.push({ role: "system", content: excerptsMessage });
  }
  systemMessages.push({ role: "system", content: basePrompt });
  if (userPrompt.trim()) {
    systemMessages.push({ role: "system", content: userPrompt });
  }

  const userMessageContent =
    command === "rule" ? ruleQuestion : documentSnapshot;

  const messages: ChatMessage[] = [
    ...systemMessages,
    { role: "user", content: userMessageContent },
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
  if (!isAiCommand(rawCommand)) return;
  const command = rawCommand;
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
const MARKERS: Record<AiCommand, string> = {
  summary: SUMMARY_MARKER,
  eval: EVAL_MARKER,
  ask: ASK_MARKER,
  rule: RULE_MARKER,
};

export function spliceMarker(
  text: string,
  position: number,
  backtickLength: number,
  command: AiCommand,
): string {
  return text.slice(0, position) + MARKERS[command] + text.slice(position + backtickLength);
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
