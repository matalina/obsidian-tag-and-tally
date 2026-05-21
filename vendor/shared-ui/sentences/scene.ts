import { SENTENCE_TEMPLATES, generateSentence } from "./utils";

export const SCENE_TEMPLATE = SENTENCE_TEMPLATES["Scene"];

export function generateSceneSentence(
    theme: string,
    locationType?: string
): string {
    return generateSentence(SCENE_TEMPLATE, theme, locationType);
}
