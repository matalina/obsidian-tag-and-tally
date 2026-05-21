import { getTableStore } from "../../tables/store";
import type { ToolModule } from "./types";

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "-");
}

function rulebookTableNames(): Set<string> {
  const set = new Set<string>();
  for (const entry of getTableStore().getTablesBySource()) {
    for (const n of entry.tableNames) set.add(n);
  }
  return set;
}

export const pickRulebookTableTool: ToolModule = {
  schema: {
    type: "function",
    function: {
      name: "pick_from_rulebook_table",
      description:
        "Pick a random entry from a bundled Tag and Tally rulebook table (the same tables used by the `pick:table-name` inline syntax). Sources include scene, creature, character, wounds, gear, inspiration, quest, hex, dungeons, lore, spells, and theme-specific variants (fantasy/hex, fantasy/dungeon, fantasy/npc, modern/hex, modern/npc, modern/faction, modern/dungeon, monster-hunter/npc). Returns the roll and the rolled result with nested formulas and table references already resolved. Use this tool for rulebook tables; use pick_from_custom_table for tables the user has defined in their own custom tables folder.",
      parameters: {
        type: "object",
        properties: {
          table: {
            type: "string",
            description:
              "The rulebook table name, e.g. 'scene-type', 'creature-descriptor', 'quest-type', 'fantasy-npc-name-human'.",
          },
        },
        required: ["table"],
      },
    },
  },
  async handler(args) {
    const raw = typeof args.table === "string" ? args.table.trim() : "";
    if (!raw) return "Error: missing table name.";
    const normalized = normalizeName(raw);
    const rulebook = rulebookTableNames();
    if (!rulebook.has(normalized)) {
      return `Error: "${raw}" is not a bundled rulebook table. Use pick_from_custom_table for user-defined tables.`;
    }
    const result = getTableStore().random(normalized);
    return `${raw} [${result.roll.notation} = ${result.roll.total}]: ${result.result}`;
  },
};
