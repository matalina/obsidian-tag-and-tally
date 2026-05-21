import { SENTENCE_TEMPLATES, generateSentence } from "./utils";

export const NPC_TEMPLATE = SENTENCE_TEMPLATES["NPC/Character"];

export function generateNPCSentence(
    theme: string,
    npcOption?: string,
    locationType?: string,
    useFantasySpecies?: boolean
): string {
    return generateSentence(NPC_TEMPLATE, theme, locationType, npcOption, useFantasySpecies);
}
