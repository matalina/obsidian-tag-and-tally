<script setup lang="ts">
import { ref, computed } from "vue";
import TagTallyIcon from "./TagTallyIcon.vue";

const props = withDefaults(
  defineProps<{
    copyValue: string;
    content?: string;
    contentMode?: "text" | "html";
    error?: boolean;
  }>(),
  { contentMode: "text", error: false }
);

const copyFeedback = ref(false);

async function copy() {
  if (!props.copyValue) return;
  try {
    const escaped = props.copyValue.replace(/\[/g, "\\[");
    await navigator.clipboard.writeText(escaped);
    copyFeedback.value = true;
    setTimeout(() => (copyFeedback.value = false), 1000);
  } catch (err) {
    console.error("Failed to copy:", err);
  }
}

const escapedContent = computed(() => {
  if (props.contentMode !== "text" || props.content == null) return "";
  const div = document.createElement("div");
  div.textContent = props.content;
  return div.innerHTML;
});
</script>

<template>
  <div
    class="tag-tally-result-box"
    :class="{ 'tag-tally-result-box--error': error }"
  >
    <button
      type="button"
      class="tag-tally-result-box__copy"
      :aria-label="copyFeedback ? 'Copied' : 'Copy result'"
      @click="copy"
    >
      <TagTallyIcon :name="copyFeedback ? 'check' : 'copy'" />
    </button>
    <div class="tag-tally-result-box__body">
      <template v-if="content != null && content !== ''">
        <div v-if="contentMode === 'html'" class="tag-tally-result-box__content" v-html="content" />
        <div v-else class="tag-tally-result-box__content" v-html="escapedContent" />
      </template>
      <slot v-else />
    </div>
  </div>
</template>

<style>
/* Unscoped so styles apply in both app (dev/build) and plugin regardless of Vue scope IDs */
.tag-tally-result-box {
  display: block;
  position: relative;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  padding: 1.25rem;
  padding-right: 2.75rem;
  margin-bottom: 1rem;
  min-height: 3.75rem;
  background: var(--result-box-bg, #f5f5f5);
  border: 1px solid var(--result-box-border, #e5e5e5);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  flex-shrink: 0;
}
.tag-tally-result-box--error {
  color: var(--text-error);
  background: var(--background-modifier-error);
  border-color: var(--text-error);
}
.tag-tally-result-box__copy {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem;
  min-width: 2rem;
  min-height: 2rem;
  border: none;
  border-radius: 6px;
  background: #fff;
  color: var(--gray-7, #555);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  cursor: pointer;
}
.tag-tally-result-box__copy:hover {
  color: var(--text-normal);
  background: var(--gray-2, #f0f0f0);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.tag-tally-result-box__body {
  display: block;
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
}
.tag-tally-result-box__content {
  display: block;
  width: 100%;
  box-sizing: border-box;
  word-break: break-word;
  overflow-wrap: break-word;
  min-width: 0;
}
</style>
