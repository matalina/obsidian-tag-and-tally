/**
 * Abstraction for table lookups used by SentencesTab and sentence generator.
 */

export interface TableResult {
  result: string;
  roll?: { total: number };
}

export interface TablesBySource {
  source: string;
  tableNames: string[];
}

export interface ITableStore {
  hasTable(tableName: string): boolean;
  random(tableName: string): TableResult;
  /** Return distinct value strings from a table (for dropdowns). */
  getTableValues(tableName: string): string[];
  /** List all registered table names (for Random Table tab). */
  listTableNames(): string[];
  /** Optional: list tables grouped by source file. Tab uses this when present. */
  getTablesBySource?(): TablesBySource[];
  /** Optional: display name for the table (e.g. "Character Motivation Verb"). If missing, tab falls back to formatting the table name. */
  getTableDisplayName?(tableName: string): string;
}

let tableStoreInstance: ITableStore | null = null;

export function setTableStore(store: ITableStore): void {
  tableStoreInstance = store;
}

export function getTableStore(): ITableStore {
  if (!tableStoreInstance) throw new Error("tableStore not set");
  return tableStoreInstance;
}
