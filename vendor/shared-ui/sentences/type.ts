import { SENTENCE_TEMPLATES, generateSentence } from "./utils";

export const TYPE_TEMPLATE = SENTENCE_TEMPLATES["Type"];

export function generateTypeSentence(
    theme: string,
    locationType?: string
): string {
    return generateSentence(TYPE_TEMPLATE, theme, locationType);
}
