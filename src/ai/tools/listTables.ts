import { getTableStore } from "../../tables/store";
import type { ToolModule } from "./types";

const MAX_NAMES = 300;

function rulebookNamesBySource(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const entry of getTableStore().getTablesBySource()) {
    out.set(entry.source, [...entry.tableNames].sort());
  }
  return out;
}

function allRulebookNames(): Set<string> {
  const set = new Set<string>();
  for (const entry of getTableStore().getTablesBySource()) {
    for (const n of entry.tableNames) set.add(n);
  }
  return set;
}

function customNames(): string[] {
  const rulebook = allRulebookNames();
  const out: string[] = [];
  for (const n of getTableStore().getTableNames()) {
    if (!rulebook.has(n)) out.push(n);
  }
  return out.sort();
}

function renderRulebook(sourceFilter?: string): string {
  const bySource = rulebookNamesBySource();
  const sources = sourceFilter
    ? [...bySource.keys()].filter((s) => s === sourceFilter)
    : [...bySource.keys()];
  if (sources.length === 0) {
    return sourceFilter
      ? `No rulebook source named "${sourceFilter}". Known sources: ${[...bySource.keys()].join(", ")}.`
      : "No rulebook tables loaded.";
  }
  const lines: string[] = [];
  let total = 0;
  let truncated = false;
  for (const source of sources) {
    const names = bySource.get(source) ?? [];
    lines.push(`## ${source}`);
    for (const n of names) {
      if (total >= MAX_NAMES) {
        truncated = true;
        break;
      }
      lines.push(n);
      total++;
    }
    if (truncated) break;
  }
  if (truncated) {
    lines.push(
      `... (truncated at ${MAX_NAMES} names; call again with a specific 'source' to narrow down)`,
    );
  }
  return lines.join("\n");
}

function renderCustom(): string {
  const names = customNames();
  if (names.length === 0) return "No custom tables loaded.";
  const capped = names.slice(0, MAX_NAMES);
  const lines = ["## custom", ...capped];
  if (names.length > MAX_NAMES) {
    lines.push(`... (truncated at ${MAX_NAMES} of ${names.length})`);
  }
  return lines.join("\n");
}

export const listTablesTool: ToolModule = {
  schema: {
    type: "function",
    function: {
      name: "list_tables",
      description:
        "List available table names so you can call pick_from_rulebook_table or pick_from_custom_table without guessing. Use this first when the user asks about tables you don't recognize. Rulebook tables are grouped by source (scene, creature, character, wounds, gear, inspiration, quest, hex, dungeons, lore, spells, fantasy/*, modern/*, monster-hunter/*). Custom tables come from the user's custom-tables folder.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["rulebook", "custom", "all"],
            description:
              "Which set to list. Defaults to 'all'.",
          },
          source: {
            type: "string",
            description:
              "Optional rulebook source filter, e.g. 'scene', 'fantasy/npc'. Ignored when kind is 'custom'.",
          },
        },
      },
    },
  },
  async handler(args) {
    const kind =
      typeof args.kind === "string" &&
      (args.kind === "rulebook" ||
        args.kind === "custom" ||
        args.kind === "all")
        ? args.kind
        : "all";
    const source =
      typeof args.source === "string" && args.source.trim()
        ? args.source.trim()
        : undefined;

    if (kind === "rulebook") return renderRulebook(source);
    if (kind === "custom") return renderCustom();
    const parts = [renderRulebook(source), "", renderCustom()];
    return parts.join("\n");
  },
};
