import resolutionData from "../../vendor/data/tables/resolution.json";

export interface DifficultyLevel {
    level: number;
    dc: number;
    description: string;
}

export interface LikelihoodOption {
    label: string;
    mod: number;
}

export const DIFFICULTY_LEVELS: DifficultyLevel[] = [
    { level: 0, dc: 0, description: "Routine" },
    { level: 1, dc: 3, description: "Simple" },
    { level: 2, dc: 6, description: "Standard" },
    { level: 3, dc: 9, description: "Demanding" },
    { level: 4, dc: 12, description: "Difficult" },
    { level: 5, dc: 15, description: "Challenging" },
    { level: 6, dc: 18, description: "Interaction" },
    { level: 7, dc: 21, description: "Formidable" },
    { level: 8, dc: 24, description: "Heroic" },
    { level: 9, dc: 27, description: "Immortal" },
    { level: 10, dc: 30, description: "Impossible" },
];

export const LIKELIHOOD_OPTIONS: LikelihoodOption[] = [
    { label: "More Likely", mod: -3 },
    { label: "50/50", mod: 0 },
    { label: "Less Likely", mod: +3 },
];

// Helper function to get resolution types from JSON
function getResolutionTypes(): readonly string[] {
    const typesEntry = (resolutionData as any[]).find(entry => entry.name === "resolution-types");
    if (typesEntry?.types && Array.isArray(typesEntry.types)) {
        return typesEntry.types.map((t: any) => t.id) as readonly string[];
    }
    // Fallback to hardcoded list if JSON is not available
    return [
        "oracle",
        "task",
        "combat opening",
        "combat maneuver",
        "combat strike",
        "combat counter",
        "combat outcome",
        "spellcasting",
        "harvesting",
        "crafting",
        "augmenting",
        "salvaging",
        "you approach npc",
        "npc approaches you",
        "debt collection",
        "navigation",
        "secrets",
        "tracking",
    ] as const;
}

export const RESOLUTION_TYPES = getResolutionTypes();

export type ResolutionType = typeof RESOLUTION_TYPES[number];
