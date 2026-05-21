import { DiceRoll } from "@dice-roller/rpg-dice-roller";
import type { ToolModule } from "./types";

export const rollDiceTool: ToolModule = {
  schema: {
    type: "function",
    function: {
      name: "roll_dice",
      description:
        "Roll dice using standard dice notation (e.g. 2d6+1, 1d20, 4d6kh3 for keep-highest-3, 2d20kh1 for advantage, 2d20kl1 for disadvantage). Returns the total and a human-readable breakdown.",
      parameters: {
        type: "object",
        properties: {
          formula: {
            type: "string",
            description: "Dice formula, e.g. 2d6+1 or 1d20",
          },
        },
        required: ["formula"],
      },
    },
  },
  async handler(args) {
    const formula = typeof args.formula === "string" ? args.formula.trim() : "";
    if (!formula) return "Error: empty dice formula.";
    try {
      const roll = new DiceRoll(formula);
      return `${formula} = ${roll.total}  (${roll.output})`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return `Error: invalid dice formula "${formula}": ${msg}`;
    }
  },
};
