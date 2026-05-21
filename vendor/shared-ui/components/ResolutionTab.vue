<script setup lang="ts">
import { ref, computed } from "vue";
import {
  DIFFICULTY_LEVELS,
  LIKELIHOOD_OPTIONS,
  RESOLUTION_TYPES,
} from "@shared-ui/resolution/types";
import { runResolution, formatResolveOutput, type ResolutionResult } from "@shared-ui/resolution/runResolution";
import ResultBox from "./ResultBox.vue";

const resolutionType = ref("oracle");
const level = ref(5);
const likelihoodMod = ref(0);
const questionOrAction = ref("");
const result = ref<ResolutionResult | null>(null);

const isOracle = computed(() => resolutionType.value === "oracle");
const isInsights = computed(() => resolutionType.value === "insights");
const isSecrets = computed(() => resolutionType.value === "secrets");
const isYesNo = computed(() => resolutionType.value === "yes no");
/** Oracle, insights, and secrets: always base DC 15 (level 5), with likelihood modifier */
const usesFixedDc15 = computed(
  () => isOracle.value || isInsights.value || isSecrets.value
);
const textareaLabel = computed(() =>
  isOracle.value || isYesNo.value ? "Question:" : "What do you want to do?"
);
const buttonText = computed(() =>
  isOracle.value || isYesNo.value ? "Ask" : "Resolve"
);

function displayLabel(t: string) {
  return t === "yes no" ? "Yes/No" : t.charAt(0).toUpperCase() + t.slice(1);
}

const resolutionCopyText = computed(() => {
  if (!result.value) return "";
  return formatResolveOutput(result.value);
});

function doResolve() {
  // Oracle, insights, and secrets always use level 5 (DC 15 base); difficulty dropdown is for other types only
  const levelForResolution = isYesNo.value
    ? 0
    : usesFixedDc15.value
      ? 5
      : level.value;
  const intent = questionOrAction.value.trim();
  result.value = runResolution({
    resolutionType: resolutionType.value,
    level: levelForResolution,
    likelihoodMod: isYesNo.value ? 0 : likelihoodMod.value,
    questionOrAction: intent,
  });
  questionOrAction.value = "";
}
</script>

<template>
  <div class="resolution-tab">
    <div class="tag-tally-select-container">
      <label for="resolution-select">Resolution Type</label>
      <select id="resolution-select" v-model="resolutionType" class="tag-tally-select">
        <option v-for="type in RESOLUTION_TYPES" :key="type" :value="type">
          {{ displayLabel(type) }}
        </option>
      </select>
    </div>

    <div v-show="!usesFixedDc15 && !isYesNo" class="tag-tally-select-container">
      <label for="difficulty-select">Difficulty Level</label>
      <select id="difficulty-select" v-model.number="level" class="tag-tally-select">
        <option v-for="opt in DIFFICULTY_LEVELS" :key="opt.level" :value="opt.level">
          Level {{ opt.level }}: {{ opt.description }}
        </option>
      </select>
    </div>

    <div v-show="usesFixedDc15" class="tag-tally-select-container">
      <label for="likelihood-select">Likelihood</label>
      <select id="likelihood-select" v-model.number="likelihoodMod" class="tag-tally-select">
        <option v-for="opt in LIKELIHOOD_OPTIONS" :key="opt.mod" :value="opt.mod">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <div class="tag-tally-textarea-container">
      <label for="resolution-textarea">{{ textareaLabel }}</label>
      <textarea
        id="resolution-textarea"
        v-model="questionOrAction"
        class="tag-tally-textarea"
        :placeholder="textareaLabel"
        rows="3"
      />
    </div>

    <div class="tag-tally-button-container">
      <button type="button" class="tag-tally-button" @click="doResolve">
        {{ buttonText }}
      </button>
    </div>

    <div v-if="result" class="tag-tally-output-spacer">
      <ResultBox :copy-value="resolutionCopyText">
        <div class="tag-tally-output-text">
          <strong>{{ result.capitalizedType }}</strong>
        </div>
        <div v-if="result.questionOrAction" class="tag-tally-output-intent">
          {{ result.questionOrAction }}
        </div>
        <div v-if="result.kind === 'binary'" class="tag-tally-output-dc">
          Roll: {{ result.rollResult }} (1d6) » {{ result.resolutionResult }}
        </div>
        <div v-else class="tag-tally-output-dc">
          DC {{ result.dc }} → {{ result.rollResult }} » {{ result.resolutionResult }}
        </div>
        <div v-if="result.thirdLine" class="tag-tally-output-details">
          <template v-if="result.thirdLine.includes('\n')">
            <div v-for="(line, i) in result.thirdLine.split('\n')" :key="i">
              {{ line }}
            </div>
          </template>
          <template v-else>
            {{ result.thirdLine }}
          </template>
        </div>
        <div v-if="result.isCritical" class="tag-tally-output-mastery">
          <strong>Add Mastery</strong>
        </div>
      </ResultBox>
    </div>
  </div>
</template>

<style scoped>
.resolution-tab {
  display: flex;
  flex-direction: column;
  padding: var(--size-2, 0.5rem) 0;
  overflow: visible;
}
.tag-tally-select-container,
.tag-tally-textarea-container,
.tag-tally-button-container {
  overflow: visible;
}
.tag-tally-select-container label,
.tag-tally-textarea-container label {
  display: block;
  margin-bottom: 0.15rem;
  margin-top: 0;
  font-size: var(--font-size-0, 0.75rem);
  color: var(--gray-7, var(--text-muted));
}
.tag-tally-select,
.tag-tally-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.35rem var(--size-3, 1rem);
  border-radius: var(--radius-2, 5px);
  background: var(--background-primary);
  color: var(--text-normal);
  overflow: visible;
  text-overflow: clip;
}
.tag-tally-select {
  min-height: 2.5rem;
  padding-top: 0.35rem;
  padding-bottom: 0.35rem;
  padding-left: var(--size-3, 1rem);
  padding-right: var(--size-7, 2rem);
}
.tag-tally-textarea {
  padding-right: var(--size-3, 1rem);
  min-height: 4.5em;
  resize: vertical;
}
.tag-tally-button {
  width: 100%;
  padding: var(--size-2, 0.5rem) var(--size-3, 1rem);
  border-radius: var(--radius-2, 5px);
  background: var(--background-secondary);
  color: var(--text-normal);
  cursor: pointer;
  font-weight: 500;
}
.tag-tally-button:hover {
  background: var(--background-modifier-hover);
}
.tag-tally-output-spacer {
  margin-top: var(--size-2, 0.5rem);
}
.tag-tally-output-spacer :deep(.tag-tally-result-box__body) {
  font-size: var(--font-size-0, 0.75rem);
}
.tag-tally-output-text {
  display: block;
}
.tag-tally-output-intent {
  display: block;
  margin-top: var(--size-2, 0.5rem);
  white-space: pre-wrap;
  word-break: break-word;
}
.tag-tally-output-dc {
  margin-top: var(--size-2, 0.5rem);
}
.tag-tally-output-details {
  margin-top: var(--size-2, 0.5rem);
}
.tag-tally-output-mastery {
  margin-top: var(--size-2, 0.5rem);
}
</style>
