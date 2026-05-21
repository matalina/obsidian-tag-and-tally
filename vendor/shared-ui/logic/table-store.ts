import { DiceRoll } from "@dice-roller/rpg-dice-roller";
import type { ITableStore, TableResult, TablesBySource } from "../table-store";

interface TableOption {
  min: number | null;
  max: number | null;
  value: string;
}

interface RandomTable {
  name: string;
  formula: string;
  table: TableOption[];
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

export interface TableSourceInput {
  source: string;
  tables: unknown;
}

export function createTableStoreFromSources(sources: TableSourceInput[]): ITableStore {
  const tables = new Map<string, RandomTable>();
  const tablesBySource: TablesBySource[] = [];

  for (const { source, tables: arr } of sources) {
    if (!Array.isArray(arr)) continue;
    const names: string[] = [];
    for (const t of arr) {
      if (t && typeof t === "object" && "name" in t && t.name) {
        const table = t as RandomTable;
        const key = normalizeName(table.name);
        tables.set(key, table);
        names.push(key);
      }
    }
    if (names.length > 0) {
      tablesBySource.push({ source, tableNames: names });
    }
  }

  function findTable(name: string): RandomTable | null {
    const n = normalizeName(name);
    const t = tables.get(n) ?? null;
    if (t) return t;
    for (const [key, table] of tables) {
      if (key === n || key.includes(n) || n.includes(key)) return table;
    }
    return null;
  }

  return {
    hasTable(name: string): boolean {
      return findTable(name) !== null;
    },
    random(name: string): TableResult {
      const table = findTable(name);
      if (!table?.table?.length) {
        return { result: `[Table not found: ${name}]` };
      }
      try {
        const roll = new DiceRoll(table.formula || "1d1");
        const total = roll.total;
        const option = table.table.find(
          (o) => (o.min ?? -Infinity) <= total && total <= (o.max ?? Infinity)
        );
        const result = typeof option?.value === "string" ? option.value : `[No match: ${total}]`;
        return { result, roll: { total } };
      } catch {
        return { result: `[Error rolling: ${name}]` };
      }
    },
    getTableValues(name: string): string[] {
      const n = normalizeName(name);
      const table = tables.get(n) ?? null;
      if (!table?.table) return [];
      const out: string[] = [];
      for (const entry of table.table) {
        const v = typeof entry.value === "string" ? entry.value : null;
        if (v && !out.includes(v)) out.push(v);
      }
      return out;
    },
    listTableNames(): string[] {
      return Array.from(tables.keys());
    },
    getTablesBySource(): TablesBySource[] {
      return tablesBySource;
    },
    getTableDisplayName(name: string): string {
      const table = findTable(name);
      if (table?.name && table.name !== normalizeName(table.name)) {
        return table.name;
      }
      return name
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    },
  };
}
