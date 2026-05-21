<script setup lang="ts">
import { onMounted, ref } from "vue";
import { setIcon } from "obsidian";

const props = defineProps<{
    icon: string;
    label: string;
    active: boolean;
}>();

const buttonEl = ref<HTMLButtonElement | null>(null);

onMounted(() => {
    if (buttonEl.value) setIcon(buttonEl.value, props.icon);
});
</script>

<template>
    <button
        ref="buttonEl"
        type="button"
        class="tag-tally-tab-button"
        :class="{ active }"
        :aria-label="label"
        @click="$emit('click')"
    />
</template>
