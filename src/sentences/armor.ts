import { SENTENCE_TEMPLATES, generateSentence } from "./utils";

export const ARMOR_TEMPLATE = SENTENCE_TEMPLATES["Armor"];

export function generateArmorSentence(
    theme: string,
    locationType?: string
): string {
    return generateSentence(ARMOR_TEMPLATE, theme, locationType);
}
