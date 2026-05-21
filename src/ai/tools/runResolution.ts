import {
  runResolution,
  formatResolveOutput,
  RESOLUTION_TYPES,
  BINARY_TYPES,
} from "@tag-and-tally/shared-ui";
import type { ToolModule } from "./types";

const LIKELIHOOD_TYPES = new Set(["oracle", "secrets", "insights"]);

function normalizeType(raw: string): string {
  return raw.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

function clampLevel(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 5;
  const i = Math.round(n);
  if (i < 0) return 0;
  if (i > 10) return 10;
  return i;
}

function clampLikelihood(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  if (n <= -1) return -3;
  if (n >= 1) return 3;
  return 0;
}

export const runResolutionTool: ToolModule = {
  schema: {
    type: "function",
    function: {
      name: "run_resolution",
      description:
        "Run a Tag and Tally resolution (the same mechanic invoked by the `resolve:` inline syntax). Most types roll d20 against a difficulty class or likelihood band and return the outcome text (Yes/No/Success/Fail with 'and'/'but' qualifiers), the DC, and any third-line detail. The 'yes no' type rolls 1d6 (even=Yes, odd=No) instead. Use this for oracle questions, task checks, combat maneuvers, spellcasting, crafting, navigation, secrets, quick yes/no answers, etc.",
      parameters: {
        type: "object",
        properties: {
          resolutionType: {
            type: "string",
            enum: [...RESOLUTION_TYPES],
            description:
              "Type of resolution. 'oracle', 'secrets', and 'insights' use likelihood bands (ignore level). 'yes no' rolls 1d6 (even=Yes, odd=No) and ignores both level and likelihood. All other types use a numeric level 0-10.",
          },
          level: {
            type: "integer",
            minimum: 0,
            maximum: 10,
            description:
              "Difficulty level 0-10 (0 Routine, 1 Simple, 2 Standard, 3 Demanding, 4 Difficult, 5 Challenging, 6 Interaction, 7 Formidable, 8 Heroic, 9 Immortal, 10 Impossible). DC = level * 3. Required for non-likelihood types; ignored for oracle/secrets/insights.",
          },
          likelihoodMod: {
            type: "integer",
            enum: [-3, 0, 3],
            description:
              "Likelihood modifier for oracle/secrets/insights. -3 = More Likely, 0 = 50/50, 3 = Less Likely. Ignored for other types.",
          },
          questionOrAction: {
            type: "string",
            description:
              "Optional free text describing the question (for oracles) or the action being attempted. Echoed back in the formatted output.",
          },
        },
        required: ["resolutionType"],
      },
    },
  },
  async handler(args) {
    const rawType =
      typeof args.resolutionType === "string" ? args.resolutionType : "";
    if (!rawType) return "Error: missing resolutionType.";
    const normalized = normalizeType(rawType);
    if (!RESOLUTION_TYPES.includes(normalized)) {
      return `Error: unknown resolutionType "${rawType}". Supported: ${RESOLUTION_TYPES.join(", ")}.`;
    }
    const isBinary = BINARY_TYPES.has(normalized);
    const isLikelihood = LIKELIHOOD_TYPES.has(normalized);
    const level = isBinary ? 0 : isLikelihood ? 5 : clampLevel(args.level);
    const likelihoodMod = isBinary
      ? 0
      : isLikelihood
        ? clampLikelihood(args.likelihoodMod)
        : 0;
    const questionOrAction =
      typeof args.questionOrAction === "string" ? args.questionOrAction : "";
    const result = runResolution({
      resolutionType: normalized,
      level,
      likelihoodMod,
      questionOrAction,
    });
    return formatResolveOutput(result).trimEnd();
  },
};
