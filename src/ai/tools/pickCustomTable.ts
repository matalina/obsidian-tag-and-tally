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

export const pickCustomTableTool: ToolModule = {
  schema: {
    type: "function",
    function: {
      name: "pick_from_custom_table",
      description:
        "Pick a random entry from a user-defined custom table (the same tables used by the `{table-name}` inline syntax, loaded from the user's custom-tables folder). Returns the roll and the rolled result with nested formulas and table references already resolved. Use this tool for tables the user has authored; use pick_from_rulebook_table for bundled Tag and Tally tables.",
      parameters: {
        type: "object",
        properties: {
          table: {
            type: "string",
            description:
              "The custom table name (matches the '## table name' heading in the user's custom-tables folder).",
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
    const store = getTableStore();
    if (rulebookTableNames().has(normalized)) {
      return `Error: "${raw}" is a bundled rulebook table. Use pick_from_rulebook_table for it.`;
    }
    if (!store.hasTable(normalized)) {
      return `Error: no custom table named "${raw}" found. Check the user's custom tables folder.`;
    }
    const result = store.random(normalized);
    return `${raw} [${result.roll.notation} = ${result.roll.total}]: ${result.result}`;
  },
};
