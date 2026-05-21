<script setup lang="ts">
import { ref, inject, onMounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useSidebarStore } from "@tag-and-tally/shared-ui";
import { createTravelTab } from "@/views/tabs/TravelTab";

const store = useSidebarStore();
const { activeTab } = storeToRefs(store);
const containerRef = ref<HTMLElement | null>(null);
const obsidianApp = inject<import("obsidian").App>("obsidianApp");

async function mountTravel() {
    if (!containerRef.value || !obsidianApp) return;
    await createTravelTab(
        containerRef.value,
        obsidianApp,
        store.selectedMapPath,
        store.hexInputValue,
        store.theme,
        async (path) => {
            store.selectedMapPath = path;
        },
        async (hex) => {
            store.hexInputValue = hex;
        },
        async (t) => {
            store.theme = t;
        },
        false
    );
}

onMounted(() => {
    mountTravel();
});
</script>

<template>
    <div
        ref="containerRef"
        class="tag-tally-travel-vue-wrapper"
    />
</template>
