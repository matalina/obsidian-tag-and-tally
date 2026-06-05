import { DiceRoll } from '@dice-roller/rpg-dice-roller';
import { App, Plugin, TFile, TFolder } from 'obsidian';
import { RandomTable, TableResult, RandomTableState } from './types/tables';
import { parseMarkdownTables } from './markdown-parser';
// Import JSON table files
import sceneTables from '../../vendor/data/tables/scene.json';
import creatureTables from '../../vendor/data/tables/creature.json';
import characterTables from '../../vendor/data/tables/character.json';
import woundsTables from '../../vendor/data/tables/wounds.json';
import gearTables from '../../vendor/data/tables/gear.json';
import inspirationTables from '../../vendor/data/tables/inspiration.json';
import questTables from '../../vendor/data/tables/quest.json';
import hexTables from '../../vendor/data/tables/hex.json';
import dungeonsTables from '../../vendor/data/tables/dungeons.json';
import loreTables from '../../vendor/data/tables/lore.json';
import npcInteractionsTables from '../../vendor/data/tables/npc-interactions.json';
import fantasyHexTables from '../../vendor/data/tables/settings/fantasy/hex.json';
import fantasyDungeonTables from '../../vendor/data/tables/settings/fantasy/dungeon.json';
import fantasyNpcTables from '../../vendor/data/tables/settings/fantasy/npc.json';
import modernHexTables from '../../vendor/data/tables/settings/modern/hex.json';
import modernNpcTables from '../../vendor/data/tables/settings/modern/npc.json';
import modernFactionTables from '../../vendor/data/tables/settings/modern/faction.json';
import modernDungeonTables from '../../vendor/data/tables/settings/modern/dungeon.json';
import monsterHunterNpcTables from '../../vendor/data/tables/settings/monster-hunter/npc.json';
import spellsTables from '../../vendor/data/tables/spells.json';

export interface TablesBySourceEntry {
  source: string;
  tableNames: string[];
}

interface CachedCustomTableFile {
  path: string;
  mtime: number;
  tables: RandomTable[];
}

interface CustomTablesCache {
  files: Record<string, CachedCustomTableFile>;
  version: number;
}

export class TableStore {
  private tables: RandomTableState = {};
  private tablesBySource: TablesBySourceEntry[] = [];
  private callStack: Set<string> = new Set(); // Prevent infinite recursion
  private customTableNames: Set<string> = new Set(); // Track custom tables for reloading
  private plugin: Plugin | null = null; // Plugin instance for cache persistence
  private customTablesFolder: string = ''; // Track the current custom tables folder path
  private app: App | null = null; // App instance for file watching

  constructor() {
    this.registerAllTables();
  }

  /**
   * Set the plugin instance for cache persistence
   */
  setPlugin(plugin: Plugin): void {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  private registerAllTables() {
    // Register all tables from JSON files (each JSON file contains an array of tables)
    const jsonTableSources: { source: string; tables: unknown }[] = [
      { source: 'scene', tables: sceneTables },
      { source: 'creature', tables: creatureTables },
      { source: 'character', tables: characterTables },
      { source: 'wounds', tables: woundsTables },
      { source: 'gear', tables: gearTables },
      { source: 'inspiration', tables: inspirationTables },
      { source: 'quest', tables: questTables },
      { source: 'hex', tables: hexTables },
      { source: 'dungeons', tables: dungeonsTables },
      { source: 'lore', tables: loreTables },
      { source: 'npc-interactions', tables: npcInteractionsTables },
      { source: 'fantasy/hex', tables: fantasyHexTables },
      { source: 'fantasy/dungeon', tables: fantasyDungeonTables },
      { source: 'fantasy/npc', tables: fantasyNpcTables },
      { source: 'modern/hex', tables: modernHexTables },
      { source: 'modern/npc', tables: modernNpcTables },
      { source: 'modern/faction', tables: modernFactionTables },
      { source: 'modern/dungeon', tables: modernDungeonTables },
      { source: 'monster-hunter/npc', tables: monsterHunterNpcTables },
      { source: 'spells', tables: spellsTables },
    ];

    for (const { source, tables: tableArray } of jsonTableSources) {
      if (!Array.isArray(tableArray)) continue;
      const names: string[] = [];
      for (const table of tableArray) {
        if (table && typeof table === 'object' && table.name) {
          const t = table as RandomTable;
          const key = t.name.toLowerCase().replace(/\s+/g, '-');
          this.tables[key] = t;
          names.push(key);
        }
      }
      if (names.length > 0) {
        this.tablesBySource.push({ source, tableNames: names });
      }
    }
  }

  /**
   * Process a result value string to resolve dice formulas and table references
   * @param result - The result string that may contain formulas (backticks) and table references (curly brackets)
   * @returns The processed result with formulas and table references resolved
   */
  private processResultValue(result: string): string {
    let processed = result;
    const maxIterations = 100; // Prevent infinite loops
    let iterations = 0;

    // Keep processing until no more formulas or table references are found
    while (iterations < maxIterations) {
      iterations++;
      let changed = false;

      // Process all dice formulas (backticks) - process from end to start to avoid index issues
      const formulaRegex = /`([^`]+)`/g;
      const formulaMatches: Array<{ match: string; replacement: string; index: number }> = [];
      let formulaMatch;
      formulaRegex.lastIndex = 0;
      while ((formulaMatch = formulaRegex.exec(processed)) !== null) {
        const formula = formulaMatch[1];
        let replacement: string;
        try {
          const roll = new DiceRoll(formula);
          replacement = roll.total.toString();
        } catch (error) {
          console.error(`Error rolling formula ${formula}:`, error);
          replacement = `[Error: ${formula}]`;
        }
        formulaMatches.push({
          match: formulaMatch[0],
          replacement,
          index: formulaMatch.index,
        });
      }
      // Replace from end to start to preserve indices
      for (let i = formulaMatches.length - 1; i >= 0; i--) {
        const { match, replacement, index } = formulaMatches[i];
        processed = processed.substring(0, index) + replacement + processed.substring(index + match.length);
        changed = true;
      }

      // Process all table references (curly brackets) - process from end to start to avoid index issues
      const tableRegex = /\{([^}]+)\}/g;
      const tableMatches: Array<{ match: string; replacement: string; index: number }> = [];
      let tableMatch;
      tableRegex.lastIndex = 0;
      while ((tableMatch = tableRegex.exec(processed)) !== null) {
        const tableName = tableMatch[1].trim();
        // Normalize table name: convert spaces to dashes, then lowercase
        const normalizedTableName = tableName.toLowerCase().replace(/\s+/g, '-');

        // Check if we're already processing any table (prevent recursion)
        // The callStack uses original table names, so we check if any table in the stack
        // matches our normalized name (by normalizing each name in the stack)
        let isRecursive = false;
        for (const stackTableName of this.callStack) {
          const normalizedStackName = stackTableName.toLowerCase().replace(/\s+/g, '-');
          if (normalizedStackName === normalizedTableName) {
            isRecursive = true;
            break;
          }
        }

        let replacement: string;
        if (isRecursive) {
          replacement = `[Recursive: ${tableName}]`;
        } else {
          try {
            const tableResult = this.random(normalizedTableName);
            replacement = tableResult.result;
          } catch (error) {
            console.error(`Error rolling on table ${tableName}:`, error);
            replacement = `[Table not found: ${tableName}]`;
          }
        }
        tableMatches.push({
          match: tableMatch[0],
          replacement,
          index: tableMatch.index,
        });
      }
      // Replace from end to start to preserve indices
      for (let i = tableMatches.length - 1; i >= 0; i--) {
        const { match, replacement, index } = tableMatches[i];
        processed = processed.substring(0, index) + replacement + processed.substring(index + match.length);
        changed = true;
      }

      // If nothing changed, we're done
      if (!changed) {
        break;
      }
    }

    if (iterations >= maxIterations) {
      console.warn(`processResultValue reached max iterations for: ${result}`);
    }

    return processed;
  }

  /**
   * Find a table by name with partial matching support
   * @param tableName - The table name to search for (supports partial matching)
   * @returns The matching table or null if not found
   */
  private findTable(tableName: string): RandomTable | null {
    // Normalize table name: lowercase and replace spaces with dashes
    // This matches how tables are stored (see markdown-parser.ts)
    const normalizedName = tableName.trim().toLowerCase().replace(/\s+/g, '-');
    // First try exact match
    if (this.tables[normalizedName]) {
      return this.tables[normalizedName];
    }

    // Try partial match - find table whose name contains the search term
    // Note: table names in this.tables are already normalized (lowercase + dashes)
    for (const [name, table] of Object.entries(this.tables)) {
      // Both names are already normalized, so we can compare directly
      if (name === normalizedName || name.includes(normalizedName) || normalizedName.includes(name)) {
        return table;
      }
    }

    return null;
  }

  /**
   * Roll on a random table
   * @param tableName - The name of the table to roll on (supports partial matching)
   * @returns TableResult with the roll and result
   */
  random(tableName: string): TableResult {
    const table = this.findTable(tableName);

    if (!table) {
      // Return error result
      const errorRoll = new DiceRoll('1d1');
      return {
        roll: errorRoll,
        result: `[Table not found: ${tableName}]`,
      };
    }

    // Check for infinite recursion
    if (this.callStack.has(table.name)) {
      this.callStack.clear();
      const errorRoll = new DiceRoll('1d1');
      return {
        roll: errorRoll,
        result: `[Recursive table call detected: ${table.name}]`,
      };
    }

    this.callStack.add(table.name);

    try {
      // Roll the table's formula
      const roll = new DiceRoll(table.formula);
      const rollTotal = roll.total;

      // Find matching table entry
      let result = '';
      for (const option of table.table) {
        const min = option.min ?? -Infinity;
        const max = option.max ?? Infinity;

        if (rollTotal >= min && rollTotal <= max) {
          if (typeof option.value === 'string') {
            result = option.value;
          } else if (typeof option.value === 'object' && 'table' in option.value) {
            // Handle table references - roll on the referenced table
            try {
              const referencedResult = this.random(option.value.table);
              result = referencedResult.result;
            } catch (error) {
              console.error(`Error rolling on referenced table ${option.value.table} for ${table.name}:`, error);
              result = `[Error rolling on table: ${option.value.table}]`;
            }
          }
          break;
        }
      }

      // If no match found, return error
      if (!result) {
        result = `[No match for roll ${rollTotal} in table ${table.name}]`;
      }

      // Process the result to resolve formulas and table references
      const processedResult = this.processResultValue(result);

      this.callStack.delete(table.name);

      return {
        roll: roll,
        result: processedResult,
      };
    } catch (error) {
      this.callStack.delete(table.name);
      console.error(`Error rolling on table ${table.name}:`, error);
      const errorRoll = new DiceRoll('1d1');
      return {
        roll: errorRoll,
        result: `[Error rolling on table: ${table.name}]`,
      };
    }
  }

  /**
   * Get all registered table names
   */
  getTableNames(): string[] {
    return Object.keys(this.tables);
  }

  /**
   * Display name for a table (for Random Table tab). Uses table's name from JSON if it differs from the key, else formats key as title case.
   */
  getTableDisplayName(tableName: string): string {
    const table = this.findTable(tableName);
    if (table?.name) {
      const key = table.name.toLowerCase().replace(/\s+/g, '-');
      if (table.name !== key) return table.name;
    }
    return tableName
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Get tables grouped by source file (for Random Table tab).
   */
  getTablesBySource(): TablesBySourceEntry[] {
    return this.tablesBySource;
  }

  /**
   * Check if a table exists
   */
  hasTable(tableName: string): boolean {
    return this.findTable(tableName) !== null;
  }

  /**
   * List all registered table names.
   */
  listTableNames(): string[] {
    return Object.keys(this.tables);
  }

  /**
   * Get distinct string values from a table (for dropdowns). Ignores table references.
   */
  getTableValues(tableName: string): string[] {
    const table = this.findTable(tableName);
    if (!table?.table || !Array.isArray(table.table)) return [];
    const out: string[] = [];
    for (const entry of table.table) {
      const v = typeof entry.value === 'string' ? entry.value : null;
      if (v && !out.includes(v)) out.push(v);
    }
    return out;
  }

  /**
   * Load cached custom tables data
   */
  private async loadCache(): Promise<CustomTablesCache | null> {
    if (!this.plugin) return null;

    try {
      const data = await this.plugin.loadData();
      return data?.customTablesCache || null;
    } catch (error) {
      console.warn('Error loading custom tables cache:', error);
      return null;
    }
  }

  /**
   * Save custom tables data to cache
   */
  private async saveCache(cache: CustomTablesCache): Promise<void> {
    if (!this.plugin) return;

    try {
      const data = (await this.plugin.loadData()) || {};
      data.customTablesCache = cache;
      await this.plugin.saveData(data);
    } catch (error) {
      console.warn('Error saving custom tables cache:', error);
    }
  }

  /**
   * Setup file watcher for custom tables folder
   */
  private setupFileWatcher(folderPath: string): void {
    if (!this.plugin || !this.app) return;

    const normalizedPath = folderPath.trim().replace(/^\/+|\/+$/g, '');
    this.customTablesFolder = normalizedPath;

    // Remove existing watcher if folder changed
    if (this.plugin.app.vault.on) {
      // Register vault event listener for file changes
      this.plugin.registerEvent(
        this.app.vault.on('modify', async (file) => {
          if (file instanceof TFile && file.extension === 'md' && file.path.startsWith(normalizedPath + '/')) {
            await this.reloadSingleFile(file);
          }
        }),
      );

      this.plugin.registerEvent(
        this.app.vault.on('create', async (file) => {
          if (file instanceof TFile && file.extension === 'md' && file.path.startsWith(normalizedPath + '/')) {
            await this.reloadSingleFile(file);
          }
        }),
      );

      this.plugin.registerEvent(
        this.app.vault.on('delete', async (file) => {
          if (file instanceof TFile && file.extension === 'md' && file.path.startsWith(normalizedPath + '/')) {
            await this.removeFileFromCache(file.path);
          }
        }),
      );

      this.plugin.registerEvent(
        this.app.vault.on('rename', async (file, oldPath) => {
          if (file instanceof TFile && file.extension === 'md') {
            const newInFolder = file.path.startsWith(normalizedPath + '/');
            const oldInFolder = oldPath.startsWith(normalizedPath + '/');

            if (newInFolder && !oldInFolder) {
              // File moved into folder
              await this.reloadSingleFile(file);
            } else if (!newInFolder && oldInFolder) {
              // File moved out of folder
              await this.removeFileFromCache(oldPath);
            } else if (newInFolder && oldInFolder) {
              // File renamed within folder
              await this.removeFileFromCache(oldPath);
              await this.reloadSingleFile(file);
            }
          }
        }),
      );
    }
  }

  /**
   * Reload a single file and update cache
   */
  private async reloadSingleFile(file: TFile): Promise<void> {
    if (!this.app) return;

    try {
      const content = await this.app.vault.read(file);
      const tables = parseMarkdownTables(content);
      const fileStat = file.stat;
      const mtime = fileStat.mtime;

      // Remove old tables from this file
      const cache = await this.loadCache();
      const oldCachedFile = cache?.files[file.path];
      if (oldCachedFile) {
        for (const table of oldCachedFile.tables) {
          delete this.tables[table.name];
          this.customTableNames.delete(table.name);
        }
      }

      // Add new tables
      for (const table of tables) {
        const storageKey = table.name;
        this.tables[storageKey] = table;
        this.customTableNames.add(storageKey);
      }

      // Update cache
      const updatedCache = (await this.loadCache()) || { files: {}, version: 3 };
      updatedCache.files[file.path] = {
        path: file.path,
        mtime: mtime,
        tables: tables,
      };
      await this.saveCache(updatedCache);
    } catch (error) {
      console.error(`Error reloading custom table file ${file.path}:`, error);
    }
  }

  /**
   * Remove a file from cache and tables
   */
  private async removeFileFromCache(filePath: string): Promise<void> {
    const cache = await this.loadCache();
    if (cache?.files[filePath]) {
      // Remove tables
      const cachedFile = cache.files[filePath];
      for (const table of cachedFile.tables) {
        delete this.tables[table.name];
        this.customTableNames.delete(table.name);
      }

      // Remove from cache
      delete cache.files[filePath];
      await this.saveCache(cache);
    }
  }

  /**
   * Load custom tables from markdown files in the specified folder
   * Uses caching to avoid vault indexing issues
   * @param app - Obsidian app instance
   * @param folderPath - Path to the folder containing markdown table files
   */
  async loadCustomTables(app: App, folderPath: string): Promise<void> {
    // Clear existing custom tables from memory
    this.clearCustomTables();

    if (!folderPath || folderPath.trim() === '') {
      console.warn('Custom tables folder path is empty, skipping custom table loading');
      return;
    }

    // Load cache first
    const cache = await this.loadCache();
    const normalizedPath = folderPath.trim().replace(/^\/+|\/+$/g, '');

    // Setup file watcher for automatic reloading
    this.setupFileWatcher(normalizedPath);

    // Load tables from cache immediately (so they're available even if folder isn't found yet)
    // But only if cache version matches current version (3) - invalidate old caches
    // Version 3: Fixed range parsing (check ranges before single numbers)
    const CACHE_VERSION = 3;
    const cacheVersion = cache?.version;

    if (cache && cache.version === CACHE_VERSION && cache.files) {
      for (const [filePath, cachedFile] of Object.entries(cache.files)) {
        for (const table of cachedFile.tables) {
          this.tables[table.name] = table;
          this.customTableNames.add(table.name);
        }
      }
    } else if (cache && cache.version !== CACHE_VERSION) {
      // Clear the old cache by saving an empty cache with new version
      await this.saveCache({ files: {}, version: CACHE_VERSION });
      // Clear tables from memory so they get re-parsed
      this.clearCustomTables();
    }

    try {
      // Now try to find the folder to check for new/modified files

      // Try multiple path variations to handle different Obsidian path formats
      let folder = app.vault.getAbstractFileByPath(normalizedPath);

      // If not found, try with leading slash
      if (!folder && !normalizedPath.startsWith('/')) {
        folder = app.vault.getAbstractFileByPath(`/${normalizedPath}`);
      }

      // If still not found, try to find it using root traversal or create it
      if (!folder) {
        // Try to get the root and check children
        try {
          const root = app.vault.getRoot();

          if (root && 'children' in root) {
            // First, try to find the folder by checking root children directly
            for (const child of root.children) {
              if (
                child.path === normalizedPath ||
                child.path === `/${normalizedPath}` ||
                child.path.toLowerCase() === normalizedPath.toLowerCase() ||
                child.path.toLowerCase() === `/${normalizedPath.toLowerCase()}`
              ) {
                folder = child;
                break;
              }
            }

            // If still not found, try recursive search
            if (!folder) {
              const findFolder = (node: any, targetPath: string, depth: number = 0): any => {
                if (depth > 10) return null; // Prevent infinite recursion
                if (!node || !('children' in node)) return null;

                for (const child of node.children) {
                  if (child.path === targetPath || child.path === `/${targetPath}`) {
                    return child;
                  }
                  if (
                    child.path.toLowerCase() === targetPath.toLowerCase() ||
                    child.path.toLowerCase() === `/${targetPath.toLowerCase()}`
                  ) {
                    return child;
                  }
                  // Recursively search (but only in subdirectories, not root level again)
                  if (depth === 0) {
                    const found = findFolder(child, targetPath, depth + 1);
                    if (found) return found;
                  }
                }
                return null;
              };

              folder = findFolder(root, normalizedPath);
            }

            // If still not found, try to create the folder (or find it if it already exists)
            if (!folder) {
              try {
                await app.vault.createFolder(normalizedPath);
                // Wait a bit for the folder to be created
                await new Promise((resolve) => window.setTimeout(resolve, 100));
                folder = app.vault.getAbstractFileByPath(normalizedPath);
              } catch (createError: any) {
                // Folder already exists - try to get it with retries
                // The folder exists but vault might not have indexed it yet
                for (let i = 0; i < 5; i++) {
                  const delay = 100 * (i + 1);
                  await new Promise((resolve) => window.setTimeout(resolve, delay));

                  folder = app.vault.getAbstractFileByPath(normalizedPath);
                  if (!folder) {
                    folder = app.vault.getAbstractFileByPath(`/${normalizedPath}`);
                  }

                  if (folder) break;

                  // Also try refreshing the root and checking again
                  if (i === 2) {
                    const refreshedRoot = app.vault.getRoot();
                    if (refreshedRoot && 'children' in refreshedRoot) {
                      for (const child of refreshedRoot.children) {
                        if (
                          child.path === normalizedPath ||
                          child.path === `/${normalizedPath}` ||
                          child.path.toLowerCase() === normalizedPath.toLowerCase()
                        ) {
                          folder = child;
                          break;
                        }
                      }
                    }
                    if (folder) break;
                  }
                }
              }
            }
          }
        } catch (error) {
          console.warn(`Error searching for custom tables folder:`, error);
        }

        if (!folder) {
          console.warn(
            `Custom tables folder not found: "${normalizedPath}". Tables will be loaded from cache if available.`,
          );
          return;
        }
      }

      if (folder instanceof TFolder) {
        // It's a folder, get all markdown files
        const markdownFiles = folder.children.filter(
          (file): file is TFile => file instanceof TFile && file.extension === 'md',
        );

        // Build new cache
        const newCache: CustomTablesCache = {
          files: {},
          version: 3,
        };

        // Process each file
        for (const file of markdownFiles) {
          try {
            const filePath = file.path;
            const fileStat = file.stat;
            const mtime = fileStat.mtime;

            // Check if file is new or modified, or if cache version is old
            const cachedFile = cache?.files[filePath];
            const cacheVersionMismatch = !cache || cache.version !== 3;
            const needsReload = !cachedFile || cachedFile.mtime !== mtime || cacheVersionMismatch;

            if (needsReload) {
              // File is new or modified, parse it
              const content = await app.vault.read(file);
              const tables = parseMarkdownTables(content);

              // Store in cache
              newCache.files[filePath] = {
                path: filePath,
                mtime: mtime,
                tables: tables,
              };

              // Add tables to store (replace if they exist)
              for (const table of tables) {
                const storageKey = table.name;
                this.tables[storageKey] = table;
                this.customTableNames.add(storageKey);
              }
            } else {
              // File hasn't changed, use cached data (already loaded above)
              newCache.files[filePath] = cachedFile;
            }
          } catch (error) {
            console.error(`Error processing custom table file ${file.path}:`, error);
          }
        }

        // Remove files from cache that no longer exist
        if (cache?.files) {
          const existingFilePaths = new Set(markdownFiles.map((f) => f.path));
          for (const cachedPath of Object.keys(cache.files)) {
            if (!existingFilePaths.has(cachedPath)) {
              // Remove tables from this file
              const cachedFile = cache.files[cachedPath];
              for (const table of cachedFile.tables) {
                delete this.tables[table.name];
                this.customTableNames.delete(table.name);
              }
            }
          }
        }

        // Save updated cache
        await this.saveCache(newCache);
      } else {
        console.warn(`Custom tables path is not a folder: ${normalizedPath}`);
      }
    } catch (error) {
      console.error('Error loading custom tables:', error);
    }
  }

  /**
   * Clear all custom tables (used when reloading)
   */
  private clearCustomTables(): void {
    for (const tableName of this.customTableNames) {
      delete this.tables[tableName];
    }
    this.customTableNames.clear();
  }

  /**
   * Reload custom tables (clear and load again)
   * @param app - Obsidian app instance
   * @param folderPath - Path to the folder containing markdown table files
   */
  async reloadCustomTables(app: App, folderPath: string): Promise<void> {
    await this.loadCustomTables(app, folderPath);
  }
}

// Export singleton instance
let tableStoreInstance: TableStore | null = null;

export function getTableStore(): TableStore {
  if (!tableStoreInstance) {
    tableStoreInstance = new TableStore();
  }
  return tableStoreInstance;
}
