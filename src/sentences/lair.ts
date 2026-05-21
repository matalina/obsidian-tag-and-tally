import { SENTENCE_TEMPLATES, generateSentence } from "./utils";

export const LAIR_TEMPLATE = SENTENCE_TEMPLATES["Lair"];

export function generateLairSentence(
    theme: string,
    locationType?: string
): string {
    return generateSentence(LAIR_TEMPLATE, theme, locationType);
}
