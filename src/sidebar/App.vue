<script setup lang="ts">
import { inject, onMounted, watch, provide } from "vue";
import { storeToRefs } from "pinia";
import {
  type TabName,
  ResolutionTab,
  SentencesTab,
  SpellCalculatorTab,
  CardsTab,
  DiceTab,
  RandomTablesTab,
  setTableStore,
  type ITableStore,
} from "@tag-and-tally/shared-ui";
import { getTableStore } from "@/tables/store";
import TabButton from "./TabButton.vue";
import TravelTab from "./TravelTab.vue";

// Adapter: plugin table store implements ITableStore for shared-ui
const pluginTableStore = getTableStore();
const tableStoreAdapter: ITableStore = {
  hasTable: (name) => pluginTableStore.hasTable(name),
  random: (name) => {
    const r = pluginTableStore.random(name);
    return { result: r.result, roll: r.roll ? { total: r.roll.total } : undefined };
  },
  getTableValues: (name) => pluginTableStore.getTableValues(name),
  listTableNames: () => pluginTableStore.getTableNames(),
  getTablesBySource: () => pluginTableStore.getTablesBySource(),
  getTableDisplayName: (name: string) => pluginTableStore.getTableDisplayName(name),
};
setTableStore(tableStoreAdapter);
provide("tableStore", tableStoreAdapter);

const plugin = inject<{ loadData: () => Promise<unknown>; saveData: (data: unknown) => Promise<void> }>("obsidianPlugin");
const store = inject("sidebarStore")! as ReturnType<typeof import("@tag-and-tally/shared-ui").useSidebarStore>;
const { activeTab } = storeToRefs(store);

const tabs: { name: TabName; label: string; icon: string }[] = [
    { name: "resolution", label: "Resolution", icon: "scale" },
    { name: "travel", label: "Travel", icon: "hexagon" },
    { name: "sentences", label: "Sentences", icon: "scroll-text" },
    { name: "spell", label: "Spell Calculator", icon: "sparkles" },
    { name: "cards", label: "Cards", icon: "layers" },
    { name: "dice", label: "Dice", icon: "dices" },
    { name: "tables", label: "Random Tables", icon: "table" },
];

function setActiveTab(name: TabName) {
    store.activeTab = name;
}

// Persist store to Obsidian (merge with existing plugin data)
async function persist() {
    if (!plugin) return;
    const data = (await plugin.loadData()) as Record<string, unknown> || {};
    data.tagTallyViewState = {
        activeTab: store.activeTab,
        selectedMapPath: store.selectedMapPath ?? undefined,
        hexInputValue: store.hexInputValue,
        theme: store.theme,
        sentencesTheme: store.sentencesTheme,
        selectedSentenceType: store.selectedSentenceType,
        locationType: store.locationType,
        useFantasySpecies: store.useFantasySpecies,
        cardsState: store.cardsState ?? undefined,
        diceState: store.diceState ?? undefined,
    };
    await plugin.saveData(data);
}

let persistTimeout: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
    if (persistTimeout) clearTimeout(persistTimeout);
    persistTimeout = setTimeout(() => {
        persistTimeout = null;
        persist();
    }, 300);
}

onMounted(async () => {
    if (plugin) {
        const data = (await plugin.loadData()) as { tagTallyViewState?: Parameters<typeof store.hydrate>[0] } | null;
        store.hydrate(data?.tagTallyViewState ?? null);
    }
});

watch(
    () => ({ ...store.$state }),
    () => schedulePersist(),
    { deep: true }
);
</script>

<template>
    <div class="tag-tally-main-content tag-tally-vue-sidebar">
        <div class="tag-tally-tab-bar">
            <TabButton
                v-for="tab in tabs"
                :key="tab.name"
                :icon="tab.icon"
                :label="tab.label"
                :active="activeTab === tab.name"
                @click="setActiveTab(tab.name)"
            />
        </div>
        <div class="tag-tally-tab-content-container">
            <div class="tag-tally-tab-content active">
                <ResolutionTab v-if="activeTab === 'resolution'" />
                <TravelTab v-else-if="activeTab === 'travel'" />
                <SentencesTab v-else-if="activeTab === 'sentences'" />
                <SpellCalculatorTab v-else-if="activeTab === 'spell'" />
                <CardsTab v-else-if="activeTab === 'cards'" />
                <DiceTab v-else-if="activeTab === 'dice'" />
                <RandomTablesTab v-else-if="activeTab === 'tables'" />
            </div>
        </div>
    </div>
</template>

<style scoped>
.tag-tally-vue-sidebar {
    padding: var(--size-3, 1rem);
    min-width: 12rem;
}
.tag-tally-vue-placeholder {
    color: var(--gray-7, var(--text-muted));
    font-size: var(--font-size-0, 0.75rem);
}
</style>
