<script setup lang="ts">
import { ref, computed, watch, inject } from "vue";
import { useSidebarStore } from "@shared-ui/stores/sidebar";
import { generateSentenceByType } from "@shared-ui/sentences/generator";
import { generateNPCAppearance } from "@shared-ui/sentences/npc-appearance";
import type { ITableStore } from "@shared-ui/table-store";
import ResultBox from "./ResultBox.vue";
import TagTallyIcon from "./TagTallyIcon.vue";

const store = useSidebarStore();
const tableStore = inject<ITableStore | null>("tableStore", null);

const SENTENCE_TYPES = [
  "Scene", "Creature", "Quest", "NPC/Character", "Species", "Type", "Wounds",
  "Blood Magic Trauma", "Faction", "Location", "Dungeon", "Lair", "Room",
  "Armor", "Item", "Weapon", "Trap", "Consumable", "Resource", "Insight",
  "Appearance",
];

const WOUND_INJURY_TYPES = ["Strain", "Lingering Trauma", "Debilitating Injury", "Lasting Scar"];

const THEMES = [
  { value: "fantasy", label: "Fantasy" },
  { value: "modern", label: "Modern" },
  { value: "monster-hunter", label: "Monster Hunter" },
];

const theme = ref(store.sentencesTheme);
const selectedSentenceType = ref(store.selectedSentenceType);
const useFantasySpecies = ref(store.useFantasySpecies);
const creatureType = ref("");
const injuryType = ref("");
const damageType = ref("");
const itemType = ref("");

const generatedText = ref("");
const appearanceText = ref("");

watch(theme, (v) => { store.sentencesTheme = v; });
watch(selectedSentenceType, (v) => { store.selectedSentenceType = v; });
watch(useFantasySpecies, (v) => { store.useFantasySpecies = v; });

function getTableValues(tableName: string): string[] {
  if (!tableStore) return [];
  return tableStore.getTableValues(tableName);
}

const creatureTypeOptions = computed(() => getTableValues("creature-type"));
const itemTypeOptions = computed(() => getTableValues("item-type"));
const damageTypeOptions = computed(() => getTableValues("wound-damage"));

const showCreatureType = computed(() => selectedSentenceType.value === "Creature");
const showItemType = computed(() => selectedSentenceType.value === "Item");
const showWoundsOptions = computed(() => selectedSentenceType.value === "Wounds");
const showUseFantasySpecies = computed(() =>
  selectedSentenceType.value === "NPC/Character" &&
  (theme.value === "modern" || theme.value === "monster-hunter")
);

function generate(): string {
  return generateSentenceByType(selectedSentenceType.value, {
    theme: theme.value,
    useFantasySpecies: useFantasySpecies.value,
    creatureType: creatureType.value || undefined,
    itemType: itemType.value || undefined,
    injuryType: injuryType.value || undefined,
    damageType: damageType.value || undefined,
  });
}

function updateGenerated() {
  generatedText.value = generate();
  if (selectedSentenceType.value === "NPC/Character" && tableStore?.hasTable("character-build-height")) {
    try {
      appearanceText.value = generateNPCAppearance(tableStore);
    } catch {
      appearanceText.value = "";
    }
  } else {
    appearanceText.value = "";
  }
}

const generatedHtml = computed(() => {
  const sentenceHtml = generatedText.value.replace(/\*\*([^*]*)\*\*/g, "<strong>$1</strong>");
  if (selectedSentenceType.value === "NPC/Character" && appearanceText.value) {
    const appearanceHtml = appearanceText.value.replace(/\n/g, "<br>");
    return sentenceHtml + "<br><br>" + appearanceHtml;
  }
  return sentenceHtml;
});

watch([theme, selectedSentenceType, useFantasySpecies, creatureType, injuryType, damageType, itemType], updateGenerated, { immediate: true });

function reroll() {
  updateGenerated();
}

const sentencesCopyText = computed(() => {
  if (selectedSentenceType.value === "NPC/Character" && appearanceText.value) {
    return generatedText.value + "\n\n" + appearanceText.value;
  }
  return generatedText.value;
});
</script>

<template>
  <div class="tag-tally-sentences-vue-wrapper">
    <div class="tag-tally-theme-container tag-tally-select-container">
      <label for="sentences-theme-select">Theme</label>
      <select id="sentences-theme-select" v-model="theme" class="tag-tally-select">
        <option v-for="opt in THEMES" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <div class="tag-tally-sentence-type-container tag-tally-select-container">
      <label for="sentence-type-select">Sentence Type</label>
      <div class="tag-tally-sentence-type-row">
        <select id="sentence-type-select" v-model="selectedSentenceType" class="tag-tally-select">
          <option v-for="t in SENTENCE_TYPES" :key="t" :value="t">
            {{ t }}
          </option>
        </select>
        <button type="button" class="clickable-icon" aria-label="Re-roll sentence" @click="reroll">
          <TagTallyIcon name="dices" />
        </button>
      </div>
    </div>

    <div v-if="showCreatureType" class="tag-tally-select-container">
      <label for="creature-type-select">Creature Type</label>
      <select id="creature-type-select" v-model="creatureType" class="tag-tally-select">
        <option value="">All</option>
        <option v-for="v in creatureTypeOptions" :key="v" :value="v">{{ v }}</option>
      </select>
    </div>

    <div v-if="showItemType" class="tag-tally-select-container">
      <label for="item-type-select">Item Type</label>
      <select id="item-type-select" v-model="itemType" class="tag-tally-select">
        <option value="">All</option>
        <option v-for="v in itemTypeOptions" :key="v" :value="v">{{ v }}</option>
      </select>
    </div>

    <div v-if="showWoundsOptions" class="tag-tally-wounds-options">
      <div class="tag-tally-select-container">
        <label for="injury-type-select">Injury Type</label>
        <select id="injury-type-select" v-model="injuryType" class="tag-tally-select">
          <option value="">All</option>
          <option v-for="w in WOUND_INJURY_TYPES" :key="w" :value="w">{{ w }}</option>
        </select>
      </div>
      <div class="tag-tally-select-container">
        <label for="damage-type-select">Damage Type</label>
        <select id="damage-type-select" v-model="damageType" class="tag-tally-select">
          <option value="">All</option>
          <option v-for="v in damageTypeOptions" :key="v" :value="v">{{ v }}</option>
        </select>
      </div>
    </div>

    <div v-if="showUseFantasySpecies" class="tag-tally-checkbox-container">
      <input id="fantasy-species-checkbox" v-model="useFantasySpecies" type="checkbox" />
      <label for="fantasy-species-checkbox">Fantasy Species</label>
    </div>

    <ResultBox
      class="tag-tally-sentences-result"
      :copy-value="sentencesCopyText"
      :content="generatedHtml"
      content-mode="html"
    />
  </div>
</template>

<style scoped>
.tag-tally-sentence-type-row {
  display: flex;
  align-items: center;
  gap: var(--size-2, 0.5rem);
}
.tag-tally-sentence-type-row .tag-tally-select {
  flex: 1;
}
.tag-tally-wounds-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-3, 1rem);
}
.tag-tally-sentences-result {
  margin-top: var(--size-3, 1rem);
}
.tag-tally-checkbox-container {
  display: flex;
  align-items: center;
  gap: var(--size-2, 0.5rem);
  margin-bottom: var(--size-2, 0.5rem);
}
.clickable-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--size-1, 0.25rem);
  min-width: var(--size-4, 1.5rem);
  min-height: var(--size-4, 1.5rem);
  border: none;
  border-radius: var(--radius-1, 2px);
  background: transparent;
  color: var(--gray-6, var(--text-muted));
  cursor: pointer;
}
.clickable-icon:hover {
  color: var(--text-normal);
  background: var(--background-modifier-hover);
}
</style>
