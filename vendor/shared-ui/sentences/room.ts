import { SENTENCE_TEMPLATES, generateSentence } from "./utils";

export const ROOM_TEMPLATE = SENTENCE_TEMPLATES["Room"];

export function generateRoomSentence(
    theme: string,
    locationType?: string
): string {
    return generateSentence(ROOM_TEMPLATE, theme, locationType);
}
