<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { X } from "lucide-vue-next";

const props = defineProps<{
    modelValue: string;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: string];
}>();

const sourceText = ref(props.modelValue);
const searchQuery = ref("");
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const overlayRef = ref<HTMLDivElement | null>(null);

watch(
    () => props.modelValue,
    (val) => {
        if (val !== sourceText.value) {
            sourceText.value = val;
        }
    },
);

watch(sourceText, (val) => {
    emit("update:modelValue", val);
});

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

const overlayHtml = computed(() => {
    const text = sourceText.value;
    const q = searchQuery.value.trim();
    const escaped = escapeHtml(text);
    if (!q) return escaped;
    const qEscaped = escapeHtml(q);
    const re = new RegExp(regexEscape(qEscaped), "g");
    return escaped.replace(re, "<mark class=\"map-source-editor__highlight\">$&</mark>");
});

function regexEscape(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function onTextareaScroll() {
    const ta = textareaRef.value;
    const ov = overlayRef.value;
    if (ta && ov) {
        ov.scrollTop = ta.scrollTop;
        ov.scrollLeft = ta.scrollLeft;
    }
}
</script>

<template>
    <div class="map-source-editor">
        <div class="map-source-editor__search-row">
            <input
                v-model="searchQuery"
                type="text"
                class="map-source-editor__search"
                placeholder="Search in source (e.g. hex coord, icon, faction)..."
                spellcheck="false"
            />
            <button
                v-show="searchQuery.length > 0"
                type="button"
                class="map-source-editor__search-clear"
                title="Clear search"
                aria-label="Clear search"
                @click="searchQuery = ''"
            >
                <X :size="14" />
            </button>
        </div>
        <div class="map-source-editor__editor-wrap">
            <div
                ref="overlayRef"
                class="map-source-editor__overlay"
                :class="{ 'map-source-editor__overlay--active': searchQuery.trim() }"
                aria-hidden="true"
                v-html="overlayHtml"
            />
            <textarea
                ref="textareaRef"
                v-model="sourceText"
                class="map-source-editor__textarea"
                :class="{ 'map-source-editor__textarea--overlay': searchQuery.trim() }"
                spellcheck="false"
                placeholder="Enter text-mapper source..."
                @scroll="onTextareaScroll"
            />
        </div>
    </div>
</template>

<style scoped>
.map-source-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
}

.map-source-editor__search-row {
    flex-shrink: 0;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
}

.map-source-editor__search {
    flex: 1;
    min-width: 0;
    padding: 0.35rem 0.5rem;
    font-family: monospace;
    font-size: 0.8rem;
    border: 1px solid var(--background-modifier-border, #333);
    border-radius: 4px;
    color: var(--text-normal);
    background: var(--background-secondary, #222);
}

.map-source-editor__search::placeholder {
    color: var(--text-muted, #888);
}

.map-source-editor__search:focus {
    outline: none;
    border-color: var(--interactive-accent, #666);
}

.map-source-editor__search-clear {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: none;
    border-radius: 4px;
    color: var(--text-muted, #888);
    background: transparent;
    cursor: pointer;
}

.map-source-editor__search-clear:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover, rgba(255, 255, 255, 0.05));
}

.map-source-editor__editor-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
}

.map-source-editor__overlay {
    position: absolute;
    inset: 0;
    padding: 0.5rem;
    box-sizing: border-box;
    font-family: monospace;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--text-normal);
    background: var(--background-primary);
    overflow: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
    pointer-events: none;
}

.map-source-editor__overlay--active :deep(.map-source-editor__highlight) {
    background: var(--interactive-accent-hover, rgba(100, 150, 255, 0.35));
    border-radius: 2px;
}

.map-source-editor__textarea {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 0.5rem;
    box-sizing: border-box;
    border: none;
    resize: none;
    font-family: monospace;
    font-size: 0.8rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
    color: var(--text-normal);
    background: transparent;
}

.map-source-editor__textarea--overlay {
    color: transparent;
    caret-color: var(--text-normal);
}

.map-source-editor__textarea:focus {
    outline: none;
}
</style>
