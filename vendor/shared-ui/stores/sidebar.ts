import { defineStore } from "pinia";
import type { CardsTabState } from "@shared-ui/cards/types";
import type { DiceTabState } from "@shared-ui/dice/types";

export type TabName = "resolution" | "travel" | "sentences" | "spell" | "cards" | "dice" | "tables" | "map";

const DEFAULT_SIDEBAR_WIDTH_PX = 480; // ~1/4 of 1920px
const SIDEBAR_WIDTH_MIN_PX = 280;
const SIDEBAR_WIDTH_MAX_PX = 640;

function clampSidebarWidth(px: number) {
    return Math.min(SIDEBAR_WIDTH_MAX_PX, Math.max(SIDEBAR_WIDTH_MIN_PX, px));
}

export interface SidebarState {
    activeTab: TabName;
    selectedMapPath: string | null;
    hexInputValue: string;
    theme: string;
    sentencesTheme: string;
    selectedSentenceType: string;
    locationType: string;
    useFantasySpecies: boolean;
    cardsState: CardsTabState | null;
    diceState: DiceTabState | null;
    /** Layout: pinned state for tools/docs sidebars (app only) */
    toolsDrawerPinned: boolean;
    docsDrawerPinned: boolean;
    /** Layout: width in px for pinned sidebars (app only) */
    toolsSidebarWidthPx: number;
    docsSidebarWidthPx: number;
}

const defaultState: SidebarState = {
    activeTab: "resolution",
    selectedMapPath: null,
    hexInputValue: "0000",
    theme: "terrain",
    sentencesTheme: "fantasy",
    selectedSentenceType: "Scene",
    locationType: "terrain",
    useFantasySpecies: false,
    cardsState: null,
    diceState: null,
    toolsDrawerPinned: false,
    docsDrawerPinned: false,
    toolsSidebarWidthPx: DEFAULT_SIDEBAR_WIDTH_PX,
    docsSidebarWidthPx: DEFAULT_SIDEBAR_WIDTH_PX,
};

export const useSidebarStore = defineStore("sidebar", {
    state: (): SidebarState => ({ ...defaultState }),
    actions: {
        hydrate(loaded: Partial<SidebarState> | null) {
            if (!loaded) return;
            const validTabs: TabName[] = ["resolution", "travel", "sentences", "spell", "cards", "dice", "tables", "map"];
            if (loaded.activeTab && validTabs.includes(loaded.activeTab)) {
                this.activeTab = loaded.activeTab;
            }
            if (loaded.selectedMapPath !== undefined) this.selectedMapPath = loaded.selectedMapPath;
            if (loaded.hexInputValue !== undefined) this.hexInputValue = loaded.hexInputValue;
            if (loaded.theme !== undefined) this.theme = loaded.theme;
            if (loaded.sentencesTheme !== undefined) this.sentencesTheme = loaded.sentencesTheme;
            if (loaded.selectedSentenceType !== undefined) this.selectedSentenceType = loaded.selectedSentenceType;
            if (loaded.locationType !== undefined) this.locationType = loaded.locationType;
            if (loaded.useFantasySpecies !== undefined) this.useFantasySpecies = loaded.useFantasySpecies;
            if (loaded.cardsState !== undefined) this.cardsState = loaded.cardsState;
            if (loaded.diceState !== undefined) this.diceState = loaded.diceState;
            if (loaded.toolsDrawerPinned !== undefined) this.toolsDrawerPinned = loaded.toolsDrawerPinned;
            if (loaded.docsDrawerPinned !== undefined) this.docsDrawerPinned = loaded.docsDrawerPinned;
            if (loaded.toolsSidebarWidthPx !== undefined) this.toolsSidebarWidthPx = clampSidebarWidth(loaded.toolsSidebarWidthPx);
            if (loaded.docsSidebarWidthPx !== undefined) this.docsSidebarWidthPx = clampSidebarWidth(loaded.docsSidebarWidthPx);
        },
    },
});
