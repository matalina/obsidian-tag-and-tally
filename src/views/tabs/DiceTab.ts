/**
 * Dice tab state type (used by sidebar store and DiceTab.vue).
 * The tab UI is implemented in sidebar/DiceTab.vue.
 */

export interface DiceTabState {
    loggingEnabled: boolean;
    log: string[];
}
