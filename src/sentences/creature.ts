import { SENTENCE_TEMPLATES, generateSentence } from "./utils";

export const CREATURE_TEMPLATE = SENTENCE_TEMPLATES["Creature"];

export function generateCreatureSentence(
    theme: string,
    locationType?: string,
    creatureType?: string
): string {
    return generateSentence(CREATURE_TEMPLATE, theme, locationType, undefined, undefined, creatureType);
}
