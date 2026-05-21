import { SENTENCE_TEMPLATES, generateSentence } from "./utils";

export const WOUNDS_TEMPLATE = SENTENCE_TEMPLATES["Wounds"];

export function generateWoundsSentence(
    theme: string,
    locationType?: string,
    injuryType?: string,
    damageType?: string
): string {
    // Validate parameters before passing them
    const injuryTypes = ['Strain', 'Lingering Trauma', 'Debilitating Injury', 'Lasting Scar'];
    if (damageType && (damageType.includes(' ') || injuryTypes.includes(damageType))) {
        // Don't pass the invalid damage type - it will be randomly generated
        return generateSentence(WOUNDS_TEMPLATE, theme, locationType, undefined, undefined, undefined, undefined, injuryType, undefined);
    }
    
    // IMPORTANT: Parameter order must match generateSentence signature:
    // template, theme, locationType, npcOption, useFantasySpecies, creatureType, itemType, injuryType, damageType
    return generateSentence(WOUNDS_TEMPLATE, theme, locationType, undefined, undefined, undefined, undefined, injuryType, damageType);
}
