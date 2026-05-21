import { SENTENCE_TEMPLATES, generateSentence } from "./utils";

export const DUNGEON_TEMPLATE = SENTENCE_TEMPLATES["Dungeon"];

export function generateDungeonSentence(
    theme: string,
    locationType?: string
): string {
    return generateSentence(DUNGEON_TEMPLATE, theme, locationType);
}
