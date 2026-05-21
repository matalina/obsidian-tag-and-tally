import { generateSentenceByType } from "../../sentences/generator";
import type { ToolModule } from "./types";

const SUPPORTED_TYPES = [
  "Scene",
  "Creature",
  "Quest",
  "NPC",
  "Character",
  "NPC/Character",
  "Species",
  "Type",
  "Wounds",
  "Blood Magic Trauma",
  "Faction",
  "Location",
  "Dungeon",
  "Lair",
  "Room",
  "Armor",
  "Item",
  "Weapon",
  "Trap",
  "Consumable",
  "Resource",
  "Insight",
  "Appearance",
];

export const generateSentenceTool: ToolModule = {
  schema: {
    type: "function",
    function: {
      name: "generate_sentence",
      description:
        "Generate a complete templated sentence using the Tag and Tally sentence system. Supported types: Scene, Creature, Quest, NPC/Character, Species, Type, Wounds, Blood Magic Trauma, Faction, Location, Dungeon, Lair, Room, Armor, Item, Weapon, Trap, Consumable, Resource, Insight, Appearance. Nested table references and dice formulas are resolved automatically.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: SUPPORTED_TYPES,
            description: `Sentence type to generate. One of: ${SUPPORTED_TYPES.join(", ")}. Use "Appearance" only for a standalone appearance block (or prefer generate_npc_appearance for that).`,
          },
          theme: {
            type: "string",
            description:
              "Theme context for table resolution (e.g. 'fantasy', 'modern', 'monster-hunter'). Defaults to 'fantasy'.",
          },
          locationType: {
            type: "string",
            description:
              "Optional location descriptor (used by Resource and some templates).",
          },
          npcOption: {
            type: "string",
            description:
              "Optional NPC/Character subtype (used by NPC/Character template).",
          },
          useFantasySpecies: {
            type: "boolean",
            description:
              "Optional override to force fantasy species source for NPC/Character.",
          },
          creatureType: {
            type: "string",
            description: "Optional creature type (used by Creature template).",
          },
          itemType: {
            type: "string",
            description: "Optional item type (used by Item template).",
          },
          injuryType: {
            type: "string",
            description: "Optional injury type (used by Wounds template).",
          },
          damageType: {
            type: "string",
            description: "Optional damage type (used by Wounds template).",
          },
        },
        required: ["type"],
      },
    },
  },
  async handler(args) {
    const type = typeof args.type === "string" ? args.type.trim() : "";
    if (!type) return "Error: missing sentence type.";
    const theme = typeof args.theme === "string" ? args.theme.trim() : "";
    const sentence = generateSentenceByType(type, {
      theme,
      locationType:
        typeof args.locationType === "string" ? args.locationType : undefined,
      npcOption:
        typeof args.npcOption === "string" ? args.npcOption : undefined,
      useFantasySpecies:
        typeof args.useFantasySpecies === "boolean"
          ? args.useFantasySpecies
          : undefined,
      creatureType:
        typeof args.creatureType === "string" ? args.creatureType : undefined,
      itemType: typeof args.itemType === "string" ? args.itemType : undefined,
      injuryType:
        typeof args.injuryType === "string" ? args.injuryType : undefined,
      damageType:
        typeof args.damageType === "string" ? args.damageType : undefined,
    });
    if (!sentence) {
      return `Error: no template for sentence type "${type}". Supported types: ${SUPPORTED_TYPES.join(", ")}.`;
    }
    return sentence;
  },
};
