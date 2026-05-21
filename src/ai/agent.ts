import type { App } from "obsidian";
import type TextMapperPlugin from "../main";
import type { AiPluginSettings } from "./settings";
import { VaultScope } from "./vaultScope";
import { CHAT_TOOLS, DEFAULT_SYSTEM_PROMPT, executeToolCall } from "./tools/registry";
import { streamChatCompletion, type ChatMessage } from "./lmClient";

const MAX_TOOL_ITERATIONS = 24;
const LEADING_SLASH_RE = /^\/([a-zA-Z0-9_-]+)(?:\s+|$)/;

/** In-memory chat history (no system). */
export interface TurnHistory {
  role: "user" | "assistant";
  content: string;
}

async function collectLeadingSlashPrompts(
  plugin: TextMapperPlugin,
  userText: string,
): Promise<{ bodies: string[]; strippedUserText: string }> {
  const bodies: string[] = [];
  let remaining = userText;
  while (true) {
    const m = remaining.match(LEADING_SLASH_RE);
    if (!m) break;
    const entry = await plugin.promptManager.get(m[1]);
    if (!entry) break;
    bodies.push(entry.body);
    remaining = remaining.slice(m[0].length).trimStart();
  }
  return { bodies, strippedUserText: remaining };
}

export async function runAgentTurn(options: {
  app: App;
  plugin: TextMapperPlugin;
  settings: AiPluginSettings;
  prior: TurnHistory[];
  userText: string;
  signal: AbortSignal;
  /** Optional GM personality prompt name (filename stem in the GM folder). */
  gmPersonalityName?: string | null;
  /** Called at the start of each LM Studio streaming request (clears UI between tool rounds). */
  onStreamRoundStart?: () => void;
  onAssistantTextChunk?: (chunk: string) => void;
  onStatus?: (text: string) => void;
  /** Fires once per tool call after it completes, so the UI can display the raw output. */
  onToolResult?: (name: string, argsJson: string, output: string) => void;
}): Promise<{ assistantText: string }> {
  const { app, plugin, settings, prior, userText, signal, gmPersonalityName } =
    options;
  const scope = new VaultScope(settings);
  const toolCtx = { app, plugin, scope, settings };

  if (!settings.model.trim()) {
    throw new Error(
      "Set a model name in Tag and Tally AI settings (must match LM Studio).",
    );
  }

  const gmBody = gmPersonalityName
    ? await plugin.gmPromptManager.getSystemPrompt(gmPersonalityName)
    : "";
  const globalEntries = await plugin.globalPromptManager.list();
  const { bodies: slashBodies, strippedUserText } =
    await collectLeadingSlashPrompts(plugin, userText);

  const systemMessages: ChatMessage[] = [
    { role: "system", content: DEFAULT_SYSTEM_PROMPT },
  ];
  if (gmBody) systemMessages.push({ role: "system", content: gmBody });
  for (const entry of globalEntries) {
    if (entry.body) systemMessages.push({ role: "system", content: entry.body });
  }
  for (const body of slashBodies) {
    systemMessages.push({ role: "system", content: body });
  }

  const messages: ChatMessage[] = [
    ...systemMessages,
    ...prior.map((p) => ({ role: p.role, content: p.content }) as ChatMessage),
    { role: "user", content: strippedUserText },
  ];

  let assistantTextOut = "";
  let iterations = 0;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations += 1;
    options.onStreamRoundStart?.();
    options.onStatus?.("Thinking…");

    const result = await streamChatCompletion({
      baseUrl: settings.lmStudioBaseUrl,
      apiKey: settings.apiKey,
      model: settings.model.trim(),
      messages,
      tools: CHAT_TOOLS,
      signal,
      onAssistantTextChunk: options.onAssistantTextChunk,
    });

    const msg = result.message;
    const toolCalls = msg.tool_calls;

    if (toolCalls?.length) {
      messages.push({
        role: "assistant",
        content: msg.content,
        tool_calls: toolCalls,
      });
      for (const tc of toolCalls) {
        options.onStatus?.(`Tool: ${tc.function.name}…`);
        const out = await executeToolCall(
          tc.function.name,
          tc.function.arguments,
          toolCtx,
        );
        options.onToolResult?.(tc.function.name, tc.function.arguments, out);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: out,
        });
      }
      continue;
    }

    const text = msg.content ?? "";
    assistantTextOut = text;
    messages.push({ role: "assistant", content: text });
    break;
  }

  if (iterations >= MAX_TOOL_ITERATIONS) {
    assistantTextOut += "\n\n[Stopped: tool iteration limit]";
  }

  return { assistantText: assistantTextOut };
}
