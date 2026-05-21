import "./styles/callouts-custom.css";

// Tab components (use in plugin sidebar and app pages)
export { default as ResolutionTab } from "./components/ResolutionTab.vue";
export { default as SentencesTab } from "./components/SentencesTab.vue";
export { default as SpellCalculatorTab } from "./components/SpellCalculatorTab.vue";
export { default as CardsTab } from "./components/CardsTab.vue";
export { default as DiceTab } from "./components/DiceTab.vue";
export { default as RandomTablesTab } from "./components/RandomTablesTab.vue";
export { default as MapTab } from "./components/MapTab.vue";
export { default as MapSourceEditor } from "./components/MapSourceEditor.vue";
export { default as ResultBox } from "./components/ResultBox.vue";
export { default as RulebookPanel } from "./components/RulebookPanel.vue";
export { default as RulebookRoot } from "./components/RulebookRoot.vue";
export { default as RulebookApp } from "./components/RulebookApp.vue";
export { createRulebookRouter } from "./rulebook-router";

// Rulebook
export {
  createRulebookRenderer,
  createJournalRenderer,
  buildJournalLookup,
  buildCrossLinkLookup,
  type CrossLinkSources,
  type RulebookPage,
  type RulebookPageForLookup,
  type RulebookPayload,
} from "./rulebook/rulebook-markdown";

// Sidebar store (Pinia)
export {
  useSidebarStore,
  type TabName,
  type SidebarState,
} from "./stores/sidebar";

// Table store abstraction (for SentencesTab; plugin/app provide implementation)
export {
  setTableStore,
  getTableStore,
  type ITableStore,
  type TableResult,
  type TablesBySource,
} from "./table-store";

// Resolution
export {
  runResolution,
  formatResolveOutput,
  parseResolveInline,
  BINARY_TYPES,
  type ResolutionResult,
  type ParseResolveInlineResult,
} from "./resolution/runResolution";
export {
  DIFFICULTY_LEVELS,
  LIKELIHOOD_OPTIONS,
  RESOLUTION_TYPES,
  type DifficultyLevel,
  type LikelihoodOption,
  type ResolutionType,
} from "./resolution/types";

// Spell calc
export * from "./spell-calc";

// Cards
export { getCardStore } from "./cards/store";
export type {
  Card,
  Deck,
  DeckConfigType,
  DeckState,
  CardsTabState,
  DeckConfig,
} from "./cards/types";
export { DECK_CONFIGS } from "./cards/types";

// Dice
export type { DiceTabState } from "./dice/types";

// Sentences (for consumers that need generateSentenceByType)
export {
  generateSentenceByType,
  type GenerateSentenceOptions,
} from "./sentences/generator";
export { generateNPCAppearance } from "./sentences/npc-appearance";
export {
  getTableRefsForSentenceType,
  resolveTableRefsToNames,
  getSentenceTypeKeys,
} from "./sentences/template-refs";
export {
  TABLE_PRESETS,
  getTableNamesForPreset,
  TABLE_ROLLS_ON,
  resolveRollOn,
  type TablePreset,
  type TablePresetEntry,
} from "./table-presets";

// Text Mapper
export {
  useTextMapper,
  type SaveBlobFn,
  type HexClickHandler,
} from "./composables/useTextMapper";

// Rulebook search
export {
  useRulebookSearch,
  type RulebookSearchHit,
} from "./composables/useRulebookSearch";
export {
  TextMapperParser,
  getHexNeighbors,
  Point,
  Orientation,
} from "./text-mapper";
