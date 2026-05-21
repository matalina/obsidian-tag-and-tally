import { SENTENCE_TEMPLATES, generateSentence } from "./utils";

export const WEAPON_TEMPLATE = SENTENCE_TEMPLATES["Weapon"];

export function generateWeaponSentence(
    theme: string,
    locationType?: string
): string {
    return generateSentence(WEAPON_TEMPLATE, theme, locationType);
}
