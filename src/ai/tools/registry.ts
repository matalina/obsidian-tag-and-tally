import { readFileTool } from "./readFile";
import { writeFileTool } from "./writeFile";
import { searchVaultTool } from "./searchVault";
import { listFilesTool } from "./listFiles";
import { rollDiceTool } from "./rollDice";
import { pickRulebookTableTool } from "./pickRulebookTable";
import { pickCustomTableTool } from "./pickCustomTable";
import { generateSentenceTool } from "./generateSentence";
import { runResolutionTool } from "./runResolution";
import { listTablesTool } from "./listTables";
import { generateNpcAppearanceTool } from "./generateNpcAppearance";
import type { ToolContext, ToolModule, ToolSchema } from "./types";

const TOOLS: ToolModule[] = [
  readFileTool,
  writeFileTool,
  searchVaultTool,
  listFilesTool,
  rollDiceTool,
  pickRulebookTableTool,
  pickCustomTableTool,
  generateSentenceTool,
  runResolutionTool,
  listTablesTool,
  generateNpcAppearanceTool,
];

const TOOL_BY_NAME = new Map<string, ToolModule>(
  TOOLS.map((t) => [t.schema.function.name, t]),
);

export const CHAT_TOOLS: ToolSchema[] = TOOLS.map((t) => t.schema);

export async function executeToolCall(
  name: string,
  argsJson: string,
  ctx: ToolContext,
): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    return "Error: invalid JSON arguments for tool.";
  }
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) return `Error: unknown tool ${name}`;
  try {
    return await tool.handler(args, ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `Error: ${msg}`;
  }
}

export const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant inside Obsidian, embedded in the Tag and Tally plugin. You can read, search, and write notes only through the provided tools, and you have access to Tag and Tally mechanics (dice rolls, rulebook table picks, custom table picks, sentence generation, resolutions, NPC appearance).

Rules:
1. Do not claim you read a note unless you used read_file or search_vault and received results.
2. Do not assume access to conversation logs on disk unless the user asks you to look them up; use tools when needed.
3. Respect the user's vault structure; prefer short, actionable edits.
4. Respond in the same language as the user's message when possible.
5. When the user message begins with "[Attachments — inserted by Tag and Tally AI]", those sections are exact file snapshots the user attached with @mentions for this turn; you may rely on them without calling read_file for those paths.
6. Use roll_dice for dice expressions like 2d6+1 or 1d20. Use pick_from_rulebook_table for bundled Tag and Tally tables (the same ones the user invokes with the \`pick:table-name\` inline syntax). Use pick_from_custom_table only for tables the user has defined in their own custom tables folder (the same ones the user invokes with the \`{table-name}\` inline syntax). Use generate_sentence to produce full templated sentences (Scene, NPC/Character, Creature, Quest, etc.).
7. Use run_resolution for oracle questions, task checks, combat resolutions, spellcasting, crafting, navigation, secrets, etc. (the same mechanic invoked by the \`resolve:\` inline syntax). Use generate_npc_appearance when the user asks for an NPC's appearance or physical description.
8. If you don't recognize a table name the user mentions, call list_tables first to discover the right name rather than guessing.
9. Output from roll_dice, pick_from_rulebook_table, pick_from_custom_table, run_resolution, generate_sentence, and generate_npc_appearance is shown to the user directly in the chat UI — they can see the exact roll, DC, outcome, and generated text. Do NOT restate, re-format, or re-list those values in your reply. Instead, add brief interpretation in 1–3 sentences: what the outcome means in the fiction, how a "Success, but" might complicate the scene, which traits from an appearance suggest a personality hook, a suggested next beat, etc. Never contradict the tool output.
10. search_vault skips the conversation folder by default. Prior chat transcripts are speculative scratch, not canon — treating them as established fiction will corrupt the user's game. Only pass \`includeChatHistory: true\` when the user explicitly asks about past conversations (e.g. "what did we decide last session", "look in my previous chats"). For all other queries, leave it unset.`;
