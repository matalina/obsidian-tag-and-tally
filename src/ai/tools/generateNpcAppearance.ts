import { generateNPCAppearance } from "@tag-and-tally/shared-ui";
import { getTableStore } from "../../tables/store";
import type { ToolModule } from "./types";

export const generateNpcAppearanceTool: ToolModule = {
  schema: {
    type: "function",
    function: {
      name: "generate_npc_appearance",
      description:
        "Generate a full NPC/character appearance block: pronoun, age, height, build, hair, eyes, skin, clothing, voice, and a distinguishing feature (with sub-detail when relevant). Uses the bundled character-* tables. Takes no arguments. Returns a multi-line string with one trait per line.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  async handler() {
    return generateNPCAppearance(getTableStore());
  },
};
