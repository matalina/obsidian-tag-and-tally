import { SENTENCE_TEMPLATES, generateSentence } from "./utils";

export const FACTION_TEMPLATE = SENTENCE_TEMPLATES["Faction"];

export function generateFactionSentence(
    theme: string,
    locationType?: string
): string {
    return generateSentence(FACTION_TEMPLATE, theme, locationType);
}
