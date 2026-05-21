import { SENTENCE_TEMPLATES, generateSentence } from "./utils";

export const SPECIES_TEMPLATE = SENTENCE_TEMPLATES["Species"];

export function generateSpeciesSentence(
    theme: string,
    locationType?: string
): string {
    return generateSentence(SPECIES_TEMPLATE, theme, locationType);
}
