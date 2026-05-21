import { SENTENCE_TEMPLATES, generateSentence } from "./utils";

export const LOCATION_TEMPLATE = SENTENCE_TEMPLATES["Location"];

export function generateLocationSentence(
    theme: string,
    locationType?: string
): string {
    return generateSentence(LOCATION_TEMPLATE, theme, locationType);
}
