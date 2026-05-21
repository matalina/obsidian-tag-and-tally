import { SENTENCE_TEMPLATES, generateSentence } from "./utils";

export const QUEST_TEMPLATE = SENTENCE_TEMPLATES["Quest"];

export function generateQuestSentence(
    theme: string,
    locationType?: string
): string {
    return generateSentence(QUEST_TEMPLATE, theme, locationType);
}
