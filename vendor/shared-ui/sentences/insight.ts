import { getTableStore } from "../table-store";

export function generateInsightSentence(): string {
    const store = getTableStore();
    
    // Get status from table
    let status: string;
    try {
        const statusResult = store.random("insight-status");
        status = statusResult.result;
    } catch (error) {
        console.error("Error rolling insight-status:", error);
        status = "New"; // Fallback
    }
    
    // Get subject from table
    let subject: string;
    try {
        const subjectResult = store.random("insight-subject");
        subject = subjectResult.result;
    } catch (error) {
        console.error("Error rolling insight-subject:", error);
        subject = "NPC"; // Fallback
    }
    
    // Get modifier from appropriate table based on subject
    let modifier: string;
    const modifierTableMap: Record<string, string> = {
        "Creature": "insight-modifier-creature",
        "NPC": "insight-modifier-npc",
        "Faction": "insight-modifier-faction",
        "Quest": "insight-modifier-quest",
        "Character Arc": "insight-modifier-character-arc",
    };
    
    const modifierTableName = modifierTableMap[subject];
    if (modifierTableName) {
        try {
            const modifierResult = store.random(modifierTableName);
            modifier = modifierResult.result;
        } catch (error) {
            console.error(`Error rolling ${modifierTableName}:`, error);
            modifier = "Goal"; // Fallback
        }
    } else {
        modifier = "Goal"; // Fallback if subject not found
    }
    
    return `This insight reveals information about a [${status}] [${subject}] regarding its [${modifier}].`;
}
