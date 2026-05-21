import { SENTENCE_TEMPLATES, generateSentence } from "./utils";

export const ITEM_TEMPLATE = SENTENCE_TEMPLATES["Item"];

export function generateItemSentence(
    theme: string,
    locationType?: string,
    itemType?: string
): string {
    return generateSentence(ITEM_TEMPLATE, theme, locationType, undefined, undefined, undefined, itemType);
}
