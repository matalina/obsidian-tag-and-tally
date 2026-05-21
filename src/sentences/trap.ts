import { SENTENCE_TEMPLATES, generateSentence } from "./utils";

export const TRAP_TEMPLATE = SENTENCE_TEMPLATES["Trap"];

export function generateTrapSentence(
    theme: string,
    locationType?: string
): string {
    return generateSentence(TRAP_TEMPLATE, theme, locationType);
}
