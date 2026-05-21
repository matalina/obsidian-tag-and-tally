import { SENTENCE_TEMPLATES, generateSentence } from "./utils";

export const CONSUMABLE_TEMPLATE = SENTENCE_TEMPLATES["Consumable"];

export function generateConsumableSentence(
    theme: string,
    locationType?: string
): string {
    return generateSentence(CONSUMABLE_TEMPLATE, theme, locationType);
}
