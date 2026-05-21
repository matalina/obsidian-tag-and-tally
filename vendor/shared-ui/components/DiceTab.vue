<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { DiceRoll } from "@dice-roller/rpg-dice-roller";
import { storeToRefs } from "pinia";
import { useSidebarStore } from "@shared-ui/stores/sidebar";
import type { DiceTabState } from "@shared-ui/dice/types";
import ResultBox from "./ResultBox.vue";
import TagTallyIcon from "./TagTallyIcon.vue";

const MAX_LOG_ENTRIES = 100;

const store = useSidebarStore();
const { diceState } = storeToRefs(store);

const inputValue = ref("1d20");
const resultMessage = ref("Enter dice notation and click Roll");
const resultError = ref(false);
const loggingEnabled = ref(diceState.value?.loggingEnabled ?? false);
const log = ref<string[]>(diceState.value?.log ?? []);

watch(
  diceState,
  (state) => {
    if (state) {
      loggingEnabled.value = state.loggingEnabled;
      log.value = state.log ?? [];
    }
  },
  { immediate: true }
);

function persistDiceState() {
  const state: DiceTabState = {
    loggingEnabled: loggingEnabled.value,
    log: [...log.value],
  };
  store.diceState = state;
}

function rollDice() {
  const formula = inputValue.value.trim();
  if (!formula) {
    resultMessage.value = "Please enter a dice formula";
    resultError.value = true;
    return;
  }
  try {
    const roll = new DiceRoll(formula);
    resultMessage.value = roll.output;
    resultError.value = false;
    if (loggingEnabled.value) {
      log.value = [...log.value, roll.output];
      if (log.value.length > MAX_LOG_ENTRIES) {
        log.value = log.value.slice(-MAX_LOG_ENTRIES);
      }
      persistDiceState();
    }
  } catch {
    resultMessage.value = `Invalid dice formula: ${formula}`;
    resultError.value = true;
  }
}

function clearLog() {
  log.value = [];
  persistDiceState();
}

const showLogSection = computed(() => loggingEnabled.value);
const showClearBtn = computed(() => loggingEnabled.value);
</script>

<template>
  <div class="tag-tally-dice-tab">
    <div class="tag-tally-dice-input-row">
      <input
        v-model="inputValue"
        type="text"
        class="tag-tally-dice-input"
        placeholder="Enter dice notation (e.g., 2d6+3)"
        @keydown.enter.prevent="rollDice"
      />
      <button
        type="button"
        class="tag-tally-dice-roll-btn"
        aria-label="Roll dice"
        @click="rollDice"
      >
        <TagTallyIcon name="dices" />
      </button>
    </div>
    <ResultBox
      :copy-value="resultMessage"
      :content="resultMessage"
      content-mode="text"
      :error="resultError"
      class="tag-tally-dice-result"
    />
    <div class="tag-tally-dice-logging">
      <div class="tag-tally-dice-logging-header">
        <label class="tag-tally-dice-logging-toggle">
          <input v-model="loggingEnabled" type="checkbox" @change="persistDiceState" />
          <span>Enable roll logging</span>
        </label>
        <button v-show="showClearBtn" type="button" class="tag-tally-dice-clear-btn" @click="clearLog">
          Clear Log
        </button>
      </div>
      <div v-show="showLogSection" class="tag-tally-dice-log">
        <div v-if="log.length === 0" class="tag-tally-dice-log-empty">No rolls logged yet</div>
        <div v-for="(entry, i) in [...log].reverse()" :key="`${i}-${entry}`" class="tag-tally-dice-log-entry">
          {{ entry }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tag-tally-dice-tab {
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}
.tag-tally-dice-input-row {
  display: flex;
  gap: var(--size-2, 0.5rem);
  align-items: center;
  margin-bottom: var(--size-3, 1rem);
  width: 100%;
  flex-shrink: 0;
}
.tag-tally-dice-input {
  flex: 1;
  min-width: 0;
  padding: var(--size-2, 0.5rem) var(--size-3, 1rem);
  border-radius: var(--radius-2, 5px);
  background: var(--background-primary);
  color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
  font-size: 1em;
  font-family: var(--font-monospace, monospace);
  box-sizing: border-box;
}
.tag-tally-dice-input:focus {
  outline: none;
  border-color: var(--interactive-accent, currentColor);
}
.tag-tally-dice-roll-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--size-2, 0.5rem);
  background: var(--background-secondary);
  color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-2, 5px);
  cursor: pointer;
}
.tag-tally-dice-roll-btn:hover {
  background: var(--background-modifier-hover);
}
.tag-tally-dice-result {
  flex-shrink: 0;
}
.tag-tally-dice-logging {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  border-top: 1px solid var(--background-modifier-border);
  padding-top: var(--size-3, 1rem);
  width: 100%;
}
.tag-tally-dice-logging-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--size-2, 0.5rem);
  flex-shrink: 0;
}
.tag-tally-dice-logging-toggle {
  display: flex;
  align-items: center;
  gap: var(--size-2, 0.5rem);
  cursor: pointer;
  color: var(--gray-6, var(--text-muted));
  font-size: 0.9em;
}
.tag-tally-dice-logging-toggle input {
  cursor: pointer;
}
.tag-tally-dice-clear-btn {
  padding: var(--size-1, 0.25rem) var(--size-3, 1rem);
  background: transparent;
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-2, 5px);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.85em;
}
.tag-tally-dice-clear-btn:hover {
  color: var(--text-normal);
  border-color: var(--text-muted);
}
.tag-tally-dice-log {
  flex: 1;
  min-height: 6rem;
  overflow-y: auto;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-2, 5px);
  padding: var(--size-2, 0.5rem);
  width: 100%;
  box-sizing: border-box;
}
.tag-tally-dice-log-entry {
  font-family: var(--font-monospace, monospace);
  font-size: 0.85em;
  padding: var(--size-1, 0.25rem) var(--size-2, 0.5rem);
  border-bottom: 1px solid var(--background-modifier-border);
}
.tag-tally-dice-log-entry:last-child {
  border-bottom: none;
}
.tag-tally-dice-log-empty {
  color: var(--text-muted);
  font-style: italic;
  text-align: center;
  padding: var(--size-3, 1rem);
}
</style>
