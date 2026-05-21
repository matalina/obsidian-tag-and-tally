<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import {
  getBases,
  getAspects,
  getTypes,
  getEffectScopes,
  getBasePoints,
  getAspectPoints,
  getTypePoints,
  getAdditionalAxisCost,
  totalPoints,
  pointsToLevel,
  finalLevel,
} from "@shared-ui/spell-calc";
import ResultBox from "./ResultBox.vue";
import TagTallyIcon from "./TagTallyIcon.vue";

const bases = ref<string[]>([]);
const aspects = ref<string[]>([]);
const types = ref<string[]>([]);
const effectScopes = ref<Array<{ value: string; label: string; pm: number }>>([]);
const basePoints = ref<Record<string, number>>({});
const aspectPoints = ref<Record<string, number>>({});
const typePoints = ref<Record<string, number>>({});

const selectedBase = ref("");
const selectedAspect = ref("");
const selectedType = ref("");
const selectedScope = ref("");
const additionalAxesList = ref<string[]>([]);
const addAxisRevealed = ref(false);
const addAxisSelectValue = ref("");
const addAxisSelectRef = ref<HTMLSelectElement | null>(null);

onMounted(() => {
  bases.value = getBases();
  aspects.value = getAspects();
  types.value = getTypes();
  effectScopes.value = getEffectScopes();
  basePoints.value = getBasePoints();
  aspectPoints.value = getAspectPoints();
  typePoints.value = getTypePoints();
  if (bases.value.length) selectedBase.value = bases.value[0];
  if (aspects.value.length) selectedAspect.value = aspects.value[0];
  if (types.value.length) selectedType.value = types.value[0];
  if (effectScopes.value.length) selectedScope.value = effectScopes.value[0].value;
});

const isChaos = computed(() => selectedBase.value === "Chaos");

watch(selectedBase, (base, prev) => {
  if (prev === "Chaos" && base !== "Chaos") {
    additionalAxesList.value = [];
    addAxisRevealed.value = false;
    addAxisSelectValue.value = "";
  }
});

function getUsedAspects(): string[] {
  const list: string[] = [];
  if (selectedAspect.value) list.push(selectedAspect.value);
  additionalAxesList.value.forEach((s) => {
    if (s.startsWith("aspect:")) list.push(s.slice(7));
  });
  return list;
}

function getUsedTypes(): string[] {
  const list: string[] = [];
  if (selectedType.value) list.push(selectedType.value);
  additionalAxesList.value.forEach((s) => {
    if (s.startsWith("type:")) list.push(s.slice(5));
  });
  return list;
}

const addAxisDropdownOptions = computed(() => {
  const n = additionalAxesList.value.length;
  if (n >= 3) return [{ value: "", label: "—" }];
  const axisCost = getAdditionalAxisCost((n + 1) as 1 | 2 | 3);
  const usedAspects = getUsedAspects();
  const usedTypes = getUsedTypes();
  const result: Array<{ value: string; label: string }> = [{ value: "", label: "—" }];
  aspects.value.forEach((a) => {
    if (!usedAspects.includes(a)) {
      const pt = aspectPoints.value[a] ?? 0;
      result.push({ value: `aspect:${a}`, label: `${a} (${pt} + ${axisCost})` });
    }
  });
  types.value.forEach((t) => {
    if (!usedTypes.includes(t)) {
      const pt = typePoints.value[t] ?? 0;
      result.push({ value: `type:${t}`, label: `${t} (${pt} + ${axisCost})` });
    }
  });
  return result;
});

const showAddAxisDropdown = computed(
  () => selectedBase.value === "Chaos" && (addAxisRevealed.value || additionalAxesList.value.length > 0)
);

function onAddAxisClick() {
  if (selectedBase.value !== "Chaos") selectedBase.value = "Chaos";
  if (additionalAxesList.value.length >= 3) return;
  addAxisRevealed.value = true;
  addAxisSelectRef.value?.focus();
}

function onAddAxisSelect() {
  const val = addAxisSelectValue.value;
  if (!val) return;
  additionalAxesList.value = [...additionalAxesList.value, val];
  addAxisSelectValue.value = "";
}

function removeAdditionalAxis(index: number) {
  additionalAxesList.value = additionalAxesList.value.filter((_, i) => i !== index);
}

function addedAxisLineLabel(entry: string, index: number): string {
  const axisCost = getAdditionalAxisCost((index + 1) as 1 | 2 | 3);
  const name = entry.startsWith("aspect:") ? entry.slice(7) : entry.slice(5);
  const pt = aspectPoints.value[name] ?? typePoints.value[name] ?? 0;
  return `${name}: ${pt} + ${axisCost} = ${pt + axisCost}`;
}

const aspectsList = computed(() => {
  const list = selectedAspect.value ? [selectedAspect.value] : [];
  if (!isChaos.value) return list;
  additionalAxesList.value.forEach((s) => {
    if (s.startsWith("aspect:")) list.push(s.slice(7));
  });
  return list;
});

const typesList = computed(() => {
  const list = selectedType.value ? [selectedType.value] : [];
  if (!isChaos.value) return list;
  additionalAxesList.value.forEach((s) => {
    if (s.startsWith("type:")) list.push(s.slice(5));
  });
  return list;
});

const result = computed(() => {
  const base = selectedBase.value;
  if (!base) return null;
  const scopeEntry = effectScopes.value.find((s) => s.value === selectedScope.value);
  const pm = scopeEntry?.pm ?? 0;
  const { total: totalPts, axisCost } = totalPoints(base, aspectsList.value, typesList.value);
  const spellLevel = pointsToLevel(totalPts);
  const effectiveLevel = finalLevel(spellLevel, pm);
  const displayFinalLevel = Math.min(10, effectiveLevel);
  const overpowered =
    effectiveLevel > 10
      ? effectiveLevel >= 13
        ? { label: "World Overpowered", hindrance: 2 }
        : { label: "Overpowered", hindrance: 1 }
      : null;
  return {
    totalPoints: totalPts,
    axisCost,
    spellLevel,
    pm,
    finalLevel: displayFinalLevel,
    overpowered,
  };
});

const spellSentenceRaw = computed(() => {
  const base = selectedBase.value || "[base]";
  return `**Name** is a [descriptor] [${base}] spell that [Effect].`;
});

const spellSentenceHtml = computed(() =>
  spellSentenceRaw.value.replace(/\*\*([^*]*)\*\*/g, "<strong>$1</strong>"),
);

const calculationLines = computed(() => {
  const r = result.value;
  const lines: string[] = [];
  if (!r) return lines;
  if (selectedBase.value) {
    lines.push(`Base: ${selectedBase.value} (${basePoints.value[selectedBase.value] ?? 0})`);
  }
  if (selectedAspect.value) {
    lines.push(`Aspect: ${selectedAspect.value} (${aspectPoints.value[selectedAspect.value] ?? 0})`);
  }
  if (selectedType.value) {
    lines.push(`Type: ${selectedType.value} (${typePoints.value[selectedType.value] ?? 0})`);
  }
  additionalAxesList.value.forEach((entry, i) => {
    const axisCost = getAdditionalAxisCost((i + 1) as 1 | 2 | 3);
    const name = entry.startsWith("aspect:") ? entry.slice(7) : entry.slice(5);
    const pt = aspectPoints.value[name] ?? typePoints.value[name] ?? 0;
    const kind = entry.startsWith("aspect:") ? "Aspect" : "Type";
    lines.push(`${kind}: ${name} (${pt} + ${axisCost})`);
  });
  if (selectedBase.value && aspectsList.value.length > 0 && typesList.value.length > 0) {
    lines.push(`Total: ${r.totalPoints} → Spell Level ${r.spellLevel}`);
    lines.push(`PM: ${r.pm}`);
    lines.push(`Final Spell Level: ${r.finalLevel}`);
    if (r.overpowered) lines.push(r.overpowered.label);
  }
  return lines;
});

const spellCopyText = computed(() => {
  const sentencePart = spellSentenceRaw.value;
  const r = result.value;
  const calcPart = calculationLines.value.length > 0
    ? calculationLines.value
        .map((line) =>
          r?.overpowered && line === r.overpowered.label ? `**${line}**` : line
        )
        .join("\n")
    : "";
  return calcPart ? `${sentencePart}\n\n${calcPart}` : sentencePart;
});
</script>

<template>
  <div class="spell-calculator-tab">
    <div class="tag-tally-select-container">
      <label for="spell-base">Base</label>
      <select id="spell-base" v-model="selectedBase" class="tag-tally-select">
        <option v-for="b in bases" :key="b" :value="b">{{ b }} ({{ basePoints[b] ?? 0 }})</option>
      </select>
    </div>

    <div class="tag-tally-select-container">
      <label for="spell-aspect">Aspect</label>
      <select id="spell-aspect" v-model="selectedAspect" class="tag-tally-select">
        <option v-for="a in aspects" :key="a" :value="a">{{ a }} ({{ aspectPoints[a] ?? 0 }})</option>
      </select>
    </div>

    <div class="tag-tally-select-container">
      <label for="spell-type">Type</label>
      <select id="spell-type" v-model="selectedType" class="tag-tally-select">
        <option v-for="t in types" :key="t" :value="t">{{ t }} ({{ typePoints[t] ?? 0 }})</option>
      </select>
    </div>

    <div class="spell-add-axis-row">
      <button
        type="button"
        class="tag-tally-button spell-axis-btn"
        :disabled="additionalAxesList.length >= 3"
        title="Add axis (switches to Chaos if needed)"
        @click="onAddAxisClick"
      >
        <TagTallyIcon name="plus" />
        <span class="spell-axis-label">Axis ({{ additionalAxesList.length }}/3)</span>
      </button>
      <select
        v-if="showAddAxisDropdown"
        ref="addAxisSelectRef"
        v-model="addAxisSelectValue"
        class="tag-tally-select spell-add-axis-select"
        @change="onAddAxisSelect"
      >
        <option v-for="opt in addAxisDropdownOptions" :key="opt.value || 'none'" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>
    <div v-if="showAddAxisDropdown && additionalAxesList.length > 0" class="spell-added-axes-list">
      <div
        v-for="(entry, index) in additionalAxesList"
        :key="`${index}-${entry}`"
        class="spell-added-axis-line"
      >
        <span class="spell-added-axis-text">{{ addedAxisLineLabel(entry, index) }}</span>
        <button
          type="button"
          class="clickable-icon"
          aria-label="Remove axis"
          @click="removeAdditionalAxis(index)"
        >
          <TagTallyIcon name="trash-2" />
        </button>
      </div>
    </div>

    <div class="tag-tally-select-container">
      <label for="spell-scope">Effect Scope</label>
      <select id="spell-scope" v-model="selectedScope" class="tag-tally-select">
        <option v-for="s in effectScopes" :key="s.value" :value="s.value">
          {{ s.label }} (PM {{ s.pm }})
        </option>
      </select>
    </div>

    <ResultBox :copy-value="spellCopyText" class="spell-result-box">
      <div class="tag-tally-generated-display" v-html="spellSentenceHtml" />
      <div v-if="result && calculationLines.length > 0" class="spell-calculation">
        <div v-for="(line, idx) in calculationLines" :key="idx">
          <strong v-if="result.overpowered && line === result.overpowered.label">{{ line }}</strong>
          <template v-else>{{ line }}</template>
        </div>
      </div>
    </ResultBox>
  </div>
</template>

<style scoped>
.spell-calculator-tab {
  display: flex;
  flex-direction: column;
}
.spell-add-axis-row {
  display: flex;
  align-items: center;
  gap: var(--size-2, 0.5rem);
  flex-wrap: nowrap;
  margin-bottom: 0.5em;
}
.spell-axis-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1, 0.25rem);
  width: auto;
  flex-shrink: 0;
  padding: var(--size-2, 0.5rem) var(--size-3, 1rem);
  border-radius: var(--radius-2, 5px);
  background: var(--background-secondary);
  color: var(--text-normal);
  cursor: pointer;
  font-weight: 500;
  font-size: var(--font-size-0, 0.75rem);
}
.spell-axis-btn:hover:not(:disabled) {
  background: var(--background-modifier-hover);
}
.spell-axis-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.spell-axis-label {
  white-space: nowrap;
}
.spell-add-axis-select {
  flex: 1;
  min-width: 0;
  max-width: 200px;
}
.spell-added-axes-list {
  margin-left: 0;
  margin-bottom: 0.5em;
}
.spell-added-axis-line {
  display: flex;
  align-items: center;
  gap: var(--size-2, 0.5rem);
  margin-bottom: var(--size-1, 0.25rem);
}
.spell-added-axis-text {
  font-size: var(--font-size-0, 0.75rem);
  color: var(--text-muted);
}
.spell-result-box .tag-tally-generated-display {
  font-size: 100%;
}
.spell-result-box .spell-calculation {
  font-size: 100%;
  margin-top: var(--size-2, 0.5rem);
  padding-top: var(--size-2, 0.5rem);
  border-top: 1px solid var(--background-modifier-border);
}
.spell-result-box .spell-calculation div {
  font-size: var(--font-size-0, 0.75rem);
  color: var(--text-muted);
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
