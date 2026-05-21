<script setup lang="ts">
import { ref, computed, inject, onMounted, onUnmounted } from "vue";
import type { ITableStore } from "@shared-ui/table-store";
import { TABLE_PRESETS, getTableNamesForPreset, resolveRollOn } from "@shared-ui/table-presets";
import TagTallyIcon from "./TagTallyIcon.vue";

const tableStore = inject<ITableStore | null>("tableStore", null);

/** Selected preset id; empty string = "All tables". */
const presetId = ref<string>("");
/** Typeable combobox value: what the user types to filter / the selected table name. */
const tableSearchQuery = ref<string>("");
const tableListOpen = ref(false);
/** Selected tables in order: { tableName, result (null until rolled) } */
const selectedEntries = ref<{ tableName: string; result: string | null }[]>([]);

const selectedPreset = computed(() =>
  presetId.value ? TABLE_PRESETS.find((p) => p.id === presetId.value) ?? null : null
);

const allTableNames = computed(() => {
  if (!tableStore?.listTableNames) return [];
  return tableStore.listTableNames();
});

/** Table names to show in the dropdown (all or filtered by selected preset). */
const displayedTableNames = computed(() => {
  const all = allTableNames.value;
  const preset = selectedPreset.value;
  if (!preset) return all;
  return getTableNamesForPreset(preset, all);
});

/** Sorted for dropdown (same list, stable order). */
const dropdownOptions = computed(() => [...displayedTableNames.value].sort());

/** Filter options by typed query (case-insensitive substring). */
const filteredTableOptions = computed(() => {
  const q = tableSearchQuery.value.trim().toLowerCase();
  if (!q) return dropdownOptions.value;
  return dropdownOptions.value.filter((name) => name.toLowerCase().includes(q));
});

/** Exact match for current query so Add is enabled. */
const addableTableName = computed(() => {
  const q = tableSearchQuery.value.trim();
  if (!q) return null;
  const found = dropdownOptions.value.find((n) => n.toLowerCase() === q.toLowerCase());
  return found ?? null;
});

/** Display name for a table (from store if provided, else dash-to-space + title case). */
function tableDisplayName(tableName: string): string {
  const fromStore = tableStore?.getTableDisplayName?.(tableName);
  if (fromStore) return fromStore;
  return tableName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function closeTableList() {
  tableListOpen.value = false;
}

function selectTable(name: string) {
  tableSearchQuery.value = name;
  closeTableList();
}

function addSelected() {
  const name = addableTableName.value;
  if (!name || !tableStore?.hasTable(name)) return;
  selectedEntries.value = [...selectedEntries.value, { tableName: name, result: null }];
  tableSearchQuery.value = "";
  closeTableList();
}

/** Add all tables for the current preset (only when a preset is selected). Skips already-added tables. */
function addAllForPreset() {
  if (!selectedPreset.value || !tableStore) return;
  const existing = new Set(selectedEntries.value.map((e) => e.tableName));
  const toAdd = displayedTableNames.value.filter(
    (name) => tableStore.hasTable(name) && !existing.has(name)
  );
  if (toAdd.length === 0) return;
  selectedEntries.value = [
    ...selectedEntries.value,
    ...toAdd.map((tableName) => ({ tableName, result: null as string | null })),
  ];
}

function removeEntry(index: number) {
  selectedEntries.value = selectedEntries.value.filter((_, i) => i !== index);
}

function rollAll() {
  if (!tableStore) return;
  selectedEntries.value = selectedEntries.value.map((e) => {
    const primary = tableStore!.random(e.tableName).result;
    const result = resolveRollOn(tableStore!, e.tableName, primary);
    return { tableName: e.tableName, result };
  });
}

function rollOne(index: number) {
  if (!tableStore) return;
  const entry = selectedEntries.value[index];
  if (!entry) return;
  const primary = tableStore.random(entry.tableName).result;
  const result = resolveRollOn(tableStore, entry.tableName, primary);
  selectedEntries.value = selectedEntries.value.slice();
  selectedEntries.value[index] = { ...entry, result };
}

const copyFeedbackRow = ref<string | null>(null);
const copyFeedbackAll = ref(false);
async function copyRow(text: string, tableName: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copyFeedbackRow.value = tableName;
    setTimeout(() => (copyFeedbackRow.value = null), 1000);
  } catch (err) {
    console.error("Failed to copy:", err);
  }
}

function copyAll() {
  const lines = selectedEntries.value.map(
    (e) => `${tableDisplayName(e.tableName)}: ${e.result ?? "Not rolled yet"}`
  );
  const text = lines.join("\n");
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    copyFeedbackAll.value = true;
    setTimeout(() => (copyFeedbackAll.value = false), 1000);
  }).catch((err) => console.error("Failed to copy all:", err));
}

const hasDropdownOptions = computed(() => dropdownOptions.value.length > 0);
const hasSelected = computed(() => selectedEntries.value.length > 0);
const canAdd = computed(() => addableTableName.value !== null);
/** Show "Add all" when a preset is selected and there are tables to add. */
const canAddAll = computed(
  () =>
    !!selectedPreset.value &&
    displayedTableNames.value.length > 0 &&
    !!tableStore
);

const comboboxRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const dropdownStyle = ref<{ top: string; left: string; width: string }>({ top: "0", left: "0", width: "0" });
/** Only render Teleport after mount to avoid dev-server 500 when compiling this file. */
const teleportReady = ref(false);

function updateDropdownPosition() {
  const input = inputRef.value;
  if (!input) return;
  const rect = input.getBoundingClientRect();
  dropdownStyle.value = {
    top: `${rect.bottom + 2}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
  };
}

function openTableList() {
  tableListOpen.value = true;
  setTimeout(updateDropdownPosition, 0);
}

function onDocumentClick(e: MouseEvent) {
  const target = e.target as Node;
  if (comboboxRef.value?.contains(target)) return;
  const list = document.getElementById("random-tables-combobox-list");
  if (list?.contains(target)) return;
  const emptyEl = document.getElementById("random-tables-combobox-empty");
  if (emptyEl?.contains(target)) return;
  closeTableList();
}
onMounted(() => {
  teleportReady.value = true;
  document.addEventListener("click", onDocumentClick);
  window.addEventListener("scroll", updateDropdownPosition, true);
  window.addEventListener("resize", updateDropdownPosition);
});
onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick);
  window.removeEventListener("scroll", updateDropdownPosition, true);
  window.removeEventListener("resize", updateDropdownPosition);
});
</script>

<template>
  <div class="tag-tally-random-tables-tab">
    <div class="tag-tally-random-tables-filter tag-tally-select-container">
      <label for="random-tables-preset">Preset</label>
      <select
        id="random-tables-preset"
        v-model="presetId"
        class="tag-tally-select"
      >
        <option value="">All tables</option>
        <option v-for="preset in TABLE_PRESETS" :key="preset.id" :value="preset.id">
          {{ preset.name }}
        </option>
      </select>
    </div>

    <div v-if="!tableStore" class="tag-tally-random-tables-empty">
      Table store not available.
    </div>
    <template v-else-if="hasDropdownOptions">
      <div class="tag-tally-random-tables-add-row">
        <div ref="comboboxRef" class="tag-tally-random-tables-combobox">
          <input
            ref="inputRef"
            v-model="tableSearchQuery"
            type="text"
            class="tag-tally-random-tables-input"
            placeholder="Type to filter tables…"
            aria-label="Choose a table to add (type to filter)"
            aria-autocomplete="list"
            :aria-expanded="tableListOpen"
            autocomplete="off"
            @focus="openTableList"
            @keydown.escape="closeTableList"
          />
          <Teleport v-if="teleportReady" to="body">
            <div
              v-show="tableListOpen && filteredTableOptions.length > 0"
              id="random-tables-combobox-list"
              class="tag-tally-random-tables-combobox-list tag-tally-random-tables-combobox-list--fixed"
              role="listbox"
              :style="dropdownStyle"
            >
              <button
                v-for="name in filteredTableOptions"
                :key="name"
                type="button"
                role="option"
                class="tag-tally-random-tables-combobox-option"
                :class="{ 'tag-tally-random-tables-combobox-option--selected': addableTableName === name }"
                @click="selectTable(name)"
              >
                {{ tableDisplayName(name) }}
              </button>
            </div>
            <div
              v-if="tableListOpen && filteredTableOptions.length === 0"
              id="random-tables-combobox-empty"
              class="tag-tally-random-tables-combobox-empty tag-tally-random-tables-combobox-empty--fixed"
              :style="dropdownStyle"
            >
              No matching tables
            </div>
          </Teleport>
        </div>
        <button
          type="button"
          class="tag-tally-random-tables-add-btn"
          :disabled="!canAdd"
          aria-label="Add table"
          @click="addSelected"
        >
          <TagTallyIcon name="plus" />
          Add
        </button>
      </div>

      <div class="tag-tally-random-tables-actions">
        <button
          v-if="canAddAll"
          type="button"
          class="tag-tally-random-tables-add-all-btn"
          aria-label="Add all tables for this preset"
          @click="addAllForPreset"
        >
          <TagTallyIcon name="plus" />
          All
        </button>
        <button
          type="button"
          class="tag-tally-random-tables-roll-btn"
          :disabled="!hasSelected"
          aria-label="Roll all selected tables"
          @click="rollAll"
        >
          <TagTallyIcon name="dices" />
          All
        </button>
        <button
          type="button"
          class="tag-tally-random-tables-copy-all-btn"
          :disabled="!hasSelected"
          aria-label="Copy all tables and results"
          @click="copyAll"
        >
          <TagTallyIcon :name="copyFeedbackAll ? 'check' : 'copy'" />
          All
        </button>
      </div>

      <div v-if="hasSelected" class="tag-tally-random-tables-selected">
        <div
          v-for="(entry, i) in selectedEntries"
          :key="`${entry.tableName}-${i}`"
          class="tag-tally-random-tables-selected-row"
        >
          <div class="tag-tally-random-tables-selected-header">
            <span class="tag-tally-random-tables-selected-name">{{ tableDisplayName(entry.tableName) }}</span>
            <div class="tag-tally-random-tables-selected-btns">
              <button
                type="button"
                class="tag-tally-random-tables-result-btn"
                aria-label="Copy result"
                :title="entry.result ? 'Copy' : ''"
                :disabled="!entry.result"
                @click="entry.result ? copyRow(entry.result, entry.tableName) : null"
              >
                <TagTallyIcon :name="copyFeedbackRow === entry.tableName ? 'check' : 'copy'" />
              </button>
              <button
                type="button"
                class="tag-tally-random-tables-result-btn"
                aria-label="Roll this table"
                title="Roll"
                @click="rollOne(i)"
              >
                <TagTallyIcon name="dices" />
              </button>
              <button
                type="button"
                class="tag-tally-random-tables-result-btn tag-tally-random-tables-remove-btn"
                aria-label="Remove table"
                title="Remove"
                @click="removeEntry(i)"
              >
                <TagTallyIcon name="trash-2" />
              </button>
            </div>
          </div>
          <div v-if="entry.result !== null" class="tag-tally-random-tables-result-body">
            {{ entry.result }}
          </div>
          <div v-else class="tag-tally-random-tables-result-placeholder">Not rolled yet</div>
        </div>
      </div>
    </template>
    <div v-else class="tag-tally-random-tables-empty">
      No tables to show. Select "All tables" or a preset that has tables.
    </div>
  </div>
</template>

<style scoped>
.tag-tally-random-tables-tab {
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: visible;
}
.tag-tally-random-tables-filter {
  flex-shrink: 0;
  margin-bottom: var(--size-3, 1rem);
}
.tag-tally-random-tables-empty {
  color: var(--text-muted);
  font-style: italic;
  padding: var(--size-3, 1rem);
}

.tag-tally-random-tables-add-row {
  display: flex;
  gap: var(--size-2, 0.5rem);
  align-items: flex-start;
  flex-shrink: 0;
  margin-bottom: var(--size-2, 0.5rem);
  overflow: visible;
}
.tag-tally-random-tables-combobox {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: visible;
}
.tag-tally-random-tables-input {
  width: 100%;
  min-width: 0;
  padding: var(--size-2, 0.5rem) var(--size-3, 1rem);
  border-radius: var(--radius-2, 5px);
  background: var(--background-primary);
  color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
  font-size: 1em;
  box-sizing: border-box;
}
.tag-tally-random-tables-input:focus {
  outline: none;
  border-color: var(--interactive-accent, currentColor);
}
.tag-tally-random-tables-input::placeholder {
  color: var(--text-muted);
}
.tag-tally-random-tables-combobox-list {
  max-height: 12rem;
  overflow-y: auto;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-2, 5px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
}
.tag-tally-random-tables-combobox-list--fixed {
  position: fixed;
  z-index: 9999;
}
.tag-tally-random-tables-combobox-option {
  display: block;
  width: 100%;
  padding: var(--size-2, 0.5rem) var(--size-3, 1rem);
  text-align: left;
  border: none;
  background: transparent;
  color: var(--text-normal);
  cursor: pointer;
  font-size: 0.95em;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.tag-tally-random-tables-combobox-option:hover,
.tag-tally-random-tables-combobox-option--selected {
  background: var(--background-modifier-hover);
}
.tag-tally-random-tables-combobox-empty {
  padding: var(--size-3, 1rem);
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-2, 5px);
  font-size: 0.9em;
  color: var(--text-muted);
}
.tag-tally-random-tables-combobox-empty--fixed {
  position: fixed;
  z-index: 9999;
}
.tag-tally-random-tables-add-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1, 0.25rem);
  padding: var(--size-2, 0.5rem) var(--size-3, 1rem);
  background: var(--background-secondary);
  color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-2, 5px);
  cursor: pointer;
  font-size: 0.95em;
  flex-shrink: 0;
}
.tag-tally-random-tables-add-btn:hover:not(:disabled) {
  background: var(--background-modifier-hover);
}
.tag-tally-random-tables-add-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tag-tally-random-tables-actions {
  flex-shrink: 0;
  margin-bottom: var(--size-3, 1rem);
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-2, 0.5rem);
}
.tag-tally-random-tables-add-all-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2, 0.5rem);
  padding: var(--size-2, 0.5rem) var(--size-3, 1rem);
  background: var(--background-secondary);
  color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-2, 5px);
  cursor: pointer;
  font-size: 1em;
}
.tag-tally-random-tables-add-all-btn:hover {
  background: var(--background-modifier-hover);
}
.tag-tally-random-tables-roll-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2, 0.5rem);
  padding: var(--size-2, 0.5rem) var(--size-3, 1rem);
  background: var(--background-secondary);
  color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-2, 5px);
  cursor: pointer;
  font-size: 1em;
}
.tag-tally-random-tables-roll-btn:hover:not(:disabled) {
  background: var(--background-modifier-hover);
}
.tag-tally-random-tables-roll-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.tag-tally-random-tables-copy-all-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2, 0.5rem);
  padding: var(--size-2, 0.5rem) var(--size-3, 1rem);
  background: var(--background-secondary);
  color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-2, 5px);
  cursor: pointer;
  font-size: 1em;
}
.tag-tally-random-tables-copy-all-btn:hover:not(:disabled) {
  background: var(--background-modifier-hover);
}
.tag-tally-random-tables-copy-all-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tag-tally-random-tables-selected {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--size-2, 0.5rem);
}
.tag-tally-random-tables-selected-row {
  background: var(--result-box-bg, #f5f5f5);
  border: 1px solid var(--result-box-border, #e5e5e5);
  border-radius: 8px;
  padding: var(--size-2, 0.5rem) var(--size-3, 1rem);
  flex-shrink: 0;
}
.tag-tally-random-tables-selected-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--size-2, 0.5rem);
  margin-bottom: var(--size-1, 0.25rem);
}
.tag-tally-random-tables-selected-name {
  font-weight: 600;
  font-size: 0.9em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tag-tally-random-tables-selected-btns {
  display: flex;
  gap: var(--size-1, 0.25rem);
  flex-shrink: 0;
}
.tag-tally-random-tables-result-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--size-1, 0.25rem);
  min-width: 1.75rem;
  min-height: 1.75rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.tag-tally-random-tables-result-btn:hover:not(:disabled) {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}
.tag-tally-random-tables-result-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.tag-tally-random-tables-remove-btn:hover {
  color: var(--text-error, #c00);
}
.tag-tally-random-tables-result-body {
  font-size: 0.9em;
  word-break: break-word;
  white-space: pre-wrap;
}
.tag-tally-random-tables-result-placeholder {
  font-size: 0.85em;
  color: var(--text-muted);
  font-style: italic;
}
</style>
