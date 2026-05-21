export {
  runResolution,
  formatResolveOutput,
  parseResolveInline,
  BINARY_TYPES,
  type ResolutionResult,
  type ParseResolveInlineResult,
} from "../resolution/runResolution";

export {
  DIFFICULTY_LEVELS,
  LIKELIHOOD_OPTIONS,
  RESOLUTION_TYPES,
  type DifficultyLevel,
  type LikelihoodOption,
  type ResolutionType,
} from "../resolution/types";

export {
  setTableStore,
  getTableStore,
  type ITableStore,
  type TableResult,
  type TablesBySource,
} from "../table-store";

export { createTableStoreFromSources, type TableSourceInput } from "./table-store";

export {
  generateSentenceByType,
  type GenerateSentenceOptions,
} from "../sentences/generator";
export { generateNPCAppearance } from "../sentences/npc-appearance";
export { getSentenceTypeKeys, THEME_PRESET_LABELS } from "../sentences/template-refs";

export {
  TABLE_PRESETS,
  getTableNamesForPreset,
  TABLE_ROLLS_ON,
  resolveRollOn,
  type TablePreset,
  type TablePresetEntry,
} from "../table-presets";

export {
  createDocsFuse,
  slugifyHeading,
  DOCS_FUSE_OPTIONS,
  type SearchEntry,
} from "./search";

export {
  getBases,
  getAspects,
  getTypes,
  getEffectScopes,
  getBasePoints,
  getAspectPoints,
  getTypePoints,
  getAdditionalAxisCost,
  getAdditionalAxisCosts,
  totalPoints,
  pointsToLevel,
  finalLevel,
  type SpellLevelResult,
} from "../spell-calc";
