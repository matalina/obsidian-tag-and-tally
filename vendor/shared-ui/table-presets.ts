/**
 * Random table presets: a hardcoded list of (key, tables) for the Random Tables tab.
 * Each preset has an id, display name, and list of table entries. Add or edit entries below.
 *
 * Table list entries can be:
 * - Exact name: "wound-damage" → that table if it exists in the store.
 * - Prefix wildcard: "character-*" → all table names that start with "character-" (resolved at runtime from the store).
 * - Group array: ["table-a", "table-b"] → same as listing each (useful for readability).
 * - Roll-on: { table: "parent-table", rollsOn: ["child-1", "child-2"] } → include the parent and the tables it rolls on.
 */
import type { ITableStore } from "./table-store";

/** A single table name or prefix wildcard (e.g. "character-*"). */
export type TablePresetEntry =
  | string
  | string[]
  | { table: string; rollsOn: string[] };

export interface TablePreset {
  id: string;
  name: string;
  /** Table entries: names, wildcards, groups, or roll-on objects. Resolved against the store at runtime. */
  tables: TablePresetEntry[];
}

/** Flatten preset entries to a string list (groups and roll-on objects expanded). */
function flattenEntries(entries: TablePresetEntry[]): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    if (typeof entry === "string") {
      out.push(entry);
    } else if (Array.isArray(entry)) {
      out.push(...entry);
    } else {
      out.push(entry.table, ...entry.rollsOn);
    }
  }
  return out;
}

function expandTables(
  entries: TablePresetEntry[],
  allTableNames: string[],
): string[] {
  const tables = flattenEntries(entries);
  const lowerNames = new Set(allTableNames.map((n) => n.toLowerCase()));
  const out = new Set<string>();

  for (const entry of tables) {
    const entryLower = entry.toLowerCase();
    if (entryLower.endsWith("-*")) {
      const prefix = entryLower.slice(0, -1); // "character-"
      for (const name of allTableNames) {
        if (name.toLowerCase().startsWith(prefix)) out.add(name);
      }
    } else {
      if (lowerNames.has(entryLower)) {
        const exact = allTableNames.find((n) => n.toLowerCase() === entryLower);
        if (exact) out.add(exact);
      }
    }
  }

  return Array.from(out).sort();
}

/**
 * Return the list of table names for the given preset (for dropdown filter and Add all).
 * Only includes tables that exist in allTableNames.
 */
export function getTableNamesForPreset(
  preset: TablePreset,
  allTableNames: string[],
): string[] {
  return expandTables(preset.tables, allTableNames);
}

// ——— Roll-on: when a table result maps to another table to roll ———

/**
 * For tables whose result can trigger a roll on another table.
 * Key = table name; value = map from **exact result string** → table to roll on.
 * When the Random Tables tab rolls the key table and gets a result that matches a key in the value map,
 * it rolls the mapped table and displays "result — subResult".
 */
export const TABLE_ROLLS_ON: Record<string, Record<string, string>> = {
  "character-distinguishing-feature-type": {
    "Extreme Deformity/Scarring": "character-deformity",
    "Heavy Body Art": "character-body-art",
    "Notable Skin Condition": "character-skin-condition",
    "Minor Flaw": "character-minor-flaw",
    "Distinctive Grooming": "character-distinguished-grooming",
    "Clean/Striking Feature": "character-clean-striking-feature",
    "Wealth/Status": "character-status-feature",
    "Legendary Presence": "character-legendary-presence",
  },
};

/**
 * If the table has a roll-on mapping for this result, roll the sub-table and return "result — subResult".
 * Otherwise return the primary result as-is.
 */
export function resolveRollOn(
  store: ITableStore,
  tableName: string,
  primaryResult: string,
): string {
  const map = TABLE_ROLLS_ON[tableName];
  if (!map) return primaryResult;
  const subTable = map[primaryResult];
  if (!subTable || !store.hasTable(subTable)) return primaryResult;
  try {
    const sub = store.random(subTable).result;
    if (sub.startsWith("[") && sub.includes("missing")) return primaryResult;
    return `${primaryResult} — ${sub}`;
  } catch {
    return primaryResult;
  }
}

// ——— Hardcoded presets: add or modify as needed ———

/** All presets. Character (by theme) first, then other sentence-like presets, then custom. */
export const TABLE_PRESETS: TablePreset[] = [
  // Character Presets
  {
    id: "fantasy-character",
    name: "Fantasy Character",
    tables: [
      "character-motivation-verb",
      "character-motivation-noun",
      "character-goal-verb",
      "character-goal-noun",
      "character-secret-verb",
      "character-secret-noun",
      "character-attack-choice",
      "fantasy-descriptor",
      "fantasy-species",
      "fantasy-type-*",
      "fantasy-verb",
      "fantasy-something",
      "wound-damage",
    ],
  },
  {
    id: "modern-character",
    name: "Modern Character",
    tables: [
      "character-motivation-verb",
      "character-motivation-noun",
      "character-goal-verb",
      "character-goal-noun",
      "character-secret-verb",
      "character-secret-noun",
      "character-attack-choice",
      "modern-descriptor",
      "modern-verb",
      "modnern-something",
      "modern-type",
      "wound-damage",
    ],
  },
  {
    id: "monster-hunter-character",
    name: "Monster Hunter Character",
    tables: [
      "character-motivation-verb",
      "character-motivation-noun",
      "character-goal-verb",
      "character-goal-noun",
      "character-secret-verb",
      "character-secret-noun",
      "character-attack-choice",
      "modern-descriptor",
      "monster-hunter-does-something",
      "monster-hunter-type",
      "wound-damage",
    ],
  },
  {
    id: "male-name",
    name: "Male Name",
    tables: [
      "modern-male-firstname",
      "modern-male-middlename",
      "modern-lastname",
    ],
  },
  {
    id: "female-name",
    name: "Female Name",
    tables: [
      "modern-female-firstname",
      "modern-female-middlename",
      "modern-lastname",
    ],
  },
  {
    id: "character-appearance",
    name: "Character Appearance",
    tables: [
      "character-pronoun",
      "character-age",
      "character-build-height",
      "character-hair-texture",
      "character-hair-style",
      "character-hair-color",
      "character-eye-color",
      "character-skin-tone",
      "character-skin-complexion",
      "character-clothing",
      "character-voice",
      {
        table: "character-distinguishing-feature-type",
        rollsOn: [
          "character-deformity",
          "character-body-art",
          "character-skin-condition",
          "character-minor-flaw",
          "character-distinguished-grooming",
          "character-clean-striking-feature",
          "character-status-feature",
          "character-legendary-presence",
        ],
      },
    ],
  },
  // Scene Presets
  {
    id: "scene",
    name: "Scene",
    tables: [
      "scene-*",
      "tier1-scene",
      "tier2-scene",
      "tier3-scene",
      "tier4-scene",
    ],
  },
  {
    id: "scene-details",
    name: "Scene Details",
    tables: [
      "season",
      "time-of-day",
      "phase-of-the-moon",
      "weather",
      "natural-disaster",
      "artificial-disaster",
    ],
  },
  // Creature Presets
  {
    id: "creature-animal",
    name: "Creature Animal",
    tables: [
      "creature-name-prefix",
      "creature-name-animal",
      "creature-type",
      "creature-motivation",
      "creature-descriptor",
      "creature-disposition",
      "creature-attack-beast",
      "creature-special-ability-animal",
      "creature-strength-animal",
      "creature-weakness-animal",
    ],
  },
  {
    id: "creature-automation",
    name: "Creature Automation",
    tables: [
      "creature-name-prefix",
      "creature-name-automation",
      "creature-type",
      "creature-motivation",
      "creature-descriptor",
      "creature-disposition",
      "creature-attack-mech",
      "creature-special-ability-automation",
      "creature-strength-automation",
      "creature-weakness-automation",
    ],
  },
  {
    id: "creature-ethereal",
    name: "Creature Ethereal",
    tables: [
      "creature-name-prefix",
      "creature-name-ethereal",
      "creature-type",
      "creature-motivation",
      "creature-descriptor",
      "creature-disposition",
      "damage-type",
      "creature-attack-ethereal",
      "creature-special-ability-ethereal",
      "creature-strength-ethereal",
      "creature-weakness-ethereal",
    ],
  },
  {
    id: "creature-undead",
    name: "Creature Undead",
    tables: [
      "creature-name-prefix",
      "creature-name-undead",
      "creature-type",
      "creature-motivation",
      "creature-descriptor",
      "creature-disposition",
      "damage-type",
      "creature-attack-undead",
      "creature-special-ability-undead",
      "creature-strength-undead",
      "creature-weakness-undead",
    ],
  },
  {
    id: "creature-draconic",
    name: "Creature Draconic",
    tables: [
      "creature-name-prefix",
      "creature-name-draconic",
      "creature-type",
      "creature-motivation",
      "creature-descriptor",
      "creature-disposition",
      "creature-attack-draconic",
      "creature-special-ability-draconic",
      "creature-strength-draconic",
      "creature-weakness-draconic",
    ],
  },
  {
    id: "creature-ooze-slime",
    name: "Creature Ooze Slime",
    tables: [
      "creature-name-prefix",
      "creature-name-ooze-slime",
      "creature-type",
      "creature-motivation",
      "creature-descriptor",
      "creature-disposition",
      "creature-attack-ooze-slime",
      "creature-special-ability-ooze-slime",
      "creature-strength-ooze-slime",
      "creature-weakness-ooze-slime",
    ],
  },
  {
    id: "creature-insect",
    name: "Creature Insect",
    tables: [
      "creature-name-prefix",
      "creature-name-insect",
      "creature-type",
      "creature-motivation",
      "creature-descriptor",
      "creature-disposition",
      "creature-attack-insect",
      "creature-special-ability-insect",
      "creature-strength-insect",
      "creature-weakness-insect",
    ],
  },
  {
    id: "creature-plant",
    name: "Creature Plant",
    tables: [
      "creature-name-prefix",
      "creature-name-plant",
      "creature-type",
      "creature-motivation",
      "creature-descriptor",
      "creature-disposition",
      "creature-attack-plant",
      "creature-special-ability-plant",
      "creature-strength-plant",
      "creature-weakness-plant",
    ],
  },
  {
    id: "creature-elemental",
    name: "Creature Elemental",
    tables: [
      "creature-name-prefix",
      "creature-name-elemental",
      "creature-type",
      "creature-motivation",
      "creature-descriptor",
      "creature-disposition",
      "creature-attack-elemental",
      "creature-special-ability-elemental",
      "creature-strength-elemental",
      "creature-weakness-elemental",
    ],
  },
  {
    id: "creature-fey",
    name: "Creature Fey",
    tables: [
      "creature-name-prefix",
      "creature-name-fey",
      "creature-type",
      "creature-motivation",
      "creature-descriptor",
      "creature-disposition",
      "creature-attack-fey",
      "creature-special-ability-fey",
      "creature-strength-fey",
      "creature-weakness-fey",
    ],
  },
  {
    id: "creature-fiend",
    name: "Creature Fiend",
    tables: [
      "creature-name-prefix",
      "creature-name-fiend",
      "creature-type",
      "creature-motivation",
      "creature-descriptor",
      "creature-disposition",
      "creature-attack-fiend",
      "creature-special-ability-fiend",
      "creature-strength-fiend",
      "creature-weakness-fiend",
    ],
  },
  {
    id: "creature-celestial",
    name: "Creature Celestial",
    tables: [
      "creature-name-prefix",
      "creature-name-celestial",
      "creature-type",
      "creature-motivation",
      "creature-descriptor",
      "creature-disposition",
      "creature-attack-celestial",
      "creature-special-ability-celestial",
      "creature-strength-celestial",
      "creature-weakness-celestial",
    ],
  },
  {
    id: "creature-giant",
    name: "Creature Giant",
    tables: [
      "creature-name-prefix",
      "creature-name-giant",
      "creature-type",
      "creature-motivation",
      "creature-descriptor",
      "creature-disposition",
      "creature-attack-giant",
      "creature-special-ability-giant",
      "creature-strength-giant",
      "creature-weakness-giant",
    ],
  },
  {
    id: "creature-monstrosity",
    name: "Creature Monstrosity",
    tables: [
      "creature-name-prefix",
      "creature-name-monstrosity",
      "creature-type",
      "creature-motivation",
      "creature-descriptor",
      "creature-disposition",
      "creature-attack-monstrosity",
      "creature-special-ability-monstrosity",
      "creature-strength-monstrosity",
      "creature-weakness-monstrosity",
    ],
  },
  {
    id: "creature-alien",
    name: "Creature Alien",
    tables: [
      "creature-name-prefix",
      "creature-name-alien",
      "creature-type",
      "creature-motivation",
      "creature-descriptor",
      "creature-disposition",
      "creature-attack-alien",
      "creature-special-ability-alien",
      "creature-strength-alien",
      "creature-weakness-alien",
    ],
  },
  // Quest Presets
  { id: "quest", name: "Quest", tables: ["quest-*"] },
  { id: "species", name: "Species", tables: ["character-species-*"] },
  {
    id: "type",
    name: "Type",
    tables: ["fantasy-descriptor", "fantasy-type", "fantasy-does-something"],
  },
  { id: "wounds", name: "Wounds", tables: ["wound-*"] },
  {
    id: "fantasy-faction",
    name: "Fantasy Faction",
    tables: ["fantasy-faction-*"],
  },
  {
    id: "modern-faction",
    name: "Modern Faction",
    tables: ["modern-faction-*"],
  },
  {
    id: "monster-hunter-faction",
    name: "Monster Hunter Faction",
    tables: ["monster-hunter-faction-*"],
  },
  { id: "location", name: "Location", tables: ["location-*"] },
  {
    id: "fantasy-dungeon",
    name: "Fantasy Dungeon",
    tables: ["fantasy-dungeon-*"],
  },
  {
    id: "modern-dungeon",
    name: "Modern Dungeon",
    tables: ["modern-dungeon-*"],
  },
  {
    id: "monster-hunter-dungeon",
    name: "Monster Hunter Dungeon",
    tables: ["monster-hunter-dungeon-*"],
  },
  { id: "lair", name: "Lair", tables: ["lair-*"] },
  { id: "room", name: "Room", tables: ["room-*"] },
  { id: "armor", name: "Armor", tables: ["armor-*", "material-armor"] },
  { id: "item", name: "Item", tables: ["item-*"] },
  {
    id: "weapon",
    name: "Weapon",
    tables: ["weapon-*", "material-weapon", "damage-type"],
  },
  { id: "trap", name: "Trap", tables: ["trap-*", "trigger-type"] },
  { id: "consumable", name: "Consumable", tables: ["consumable-*"] },
];
