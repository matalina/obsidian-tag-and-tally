<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useTextMapper, type SaveBlobFn } from "@shared-ui/composables/useTextMapper";
import { LocateFixed, Download, Eye, EyeOff } from "lucide-vue-next";

const props = defineProps<{
    mapSource?: string;
    saveFn?: SaveBlobFn;
    factionOverlaysVisible?: boolean;
    links?: Record<string, string>;
    populatedHexes?: string[];
}>();

const emit = defineEmits<{
    save: [];
    "save-as": [];
    "update:factionOverlaysVisible": [value: boolean];
    "hex-click": [coordString: string];
    "hex-note-click": [coordString: string];
    "label-link": [href: string];
}>();

const mapper = useTextMapper();

const mapContainer = ref<HTMLElement | null>(null);

let renderTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRender() {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
        doRender();
    }, 400);
}

function doRender() {
    const src = props.mapSource;
    if (!mapContainer.value) return;
    if (!src?.trim()) {
        mapContainer.value.replaceChildren();
        return;
    }
    mapper.render(mapContainer.value, src);
    mapper.attachHexLinkHandlers(
        mapContainer.value,
        props.links ?? {},
        (coord) => emit("hex-click", coord),
    );
    mapper.attachHexNoteIndicators(
        mapContainer.value,
        props.populatedHexes ?? [],
        (coord) => emit("hex-note-click", coord),
    );
    attachLabelLinkHandlers(mapContainer.value);
}

function attachLabelLinkHandlers(container: HTMLElement) {
    const links = container.querySelectorAll("a[data-link-type]");
    for (const el of links) {
        el.addEventListener("click", (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            const type = (el as HTMLElement).getAttribute("data-link-type");
            const target = (el as HTMLElement).getAttribute("data-link-target");
            if (type && target) {
                emit("label-link", `${type}://${target}`);
            }
        });
    }
}

watch(() => props.mapSource, () => {
    scheduleRender();
});

watch(
    () => props.links,
    (links) => {
        if (mapContainer.value && links) {
            mapper.updateLinkStyles(mapContainer.value, links);
        }
    },
    { deep: true },
);

watch(() => props.populatedHexes, () => {
    if (mapContainer.value && mapper.parser.value) {
        mapper.attachHexNoteIndicators(
            mapContainer.value,
            props.populatedHexes ?? [],
            (coord) => emit("hex-note-click", coord),
        );
    }
}, { deep: true });

watch(
    () => props.factionOverlaysVisible,
    (val) => {
        if (val !== undefined && val !== mapper.factionOverlaysVisible.value) {
            mapper.toggleFactionOverlays();
        }
    },
);

onMounted(async () => {
    if (props.factionOverlaysVisible !== undefined) {
        if (props.factionOverlaysVisible !== mapper.factionOverlaysVisible.value) {
            mapper.toggleFactionOverlays();
        }
    }
    await nextTick();
    doRender();
});

onUnmounted(() => {
    if (renderTimer) clearTimeout(renderTimer);
    mapper.cleanup();
});

function handleRecenter() {
    mapper.recenter();
}

async function handleExport() {
    if (!props.saveFn) {
        console.warn("No saveFn provided to MapTab");
        return;
    }
    await mapper.exportPng(props.saveFn);
}

function handleToggleFactions() {
    mapper.toggleFactionOverlays();
    emit("update:factionOverlaysVisible", mapper.factionOverlaysVisible.value);
}

defineExpose({
    centerOnHex: mapper.centerOnHex,
    parser: mapper.parser,
    recenter: mapper.recenter,
});
</script>

<template>
    <div class="map-tab">
        <div class="map-tab__toolbar">
            <button
                type="button"
                class="map-tab__btn"
                title="Re-center map"
                @click="handleRecenter"
            >
                <LocateFixed :size="16" />
            </button>
            <button
                type="button"
                class="map-tab__btn"
                title="Export as PNG"
                @click="handleExport"
            >
                <Download :size="16" />
            </button>
            <button
                type="button"
                class="map-tab__btn"
                title="Toggle faction overlays"
                @click="handleToggleFactions"
            >
                <Eye v-if="mapper.factionOverlaysVisible.value" :size="16" />
                <EyeOff v-else :size="16" />
                Factions
            </button>
        </div>

        <div ref="mapContainer" class="map-tab__map" />
    </div>
</template>

<style scoped>
.map-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    gap: 0;
}

.map-tab__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.25rem;
    flex-shrink: 0;
    border-bottom: 1px solid var(--background-modifier-border);
}

.map-tab__btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
}

.map-tab__btn :deep(svg) {
    pointer-events: none;
    flex-shrink: 0;
}

.map-tab__btn:hover {
    background: var(--background-modifier-hover);
    color: var(--interactive-accent);
}

.map-tab__map {
    flex: 1;
    min-height: 200px;
    overflow: hidden;
    background: white;
}

.map-tab__map :deep(.textmapper) {
    width: 100%;
    height: 100%;
}

.map-tab__map :deep(svg) {
    width: 100%;
    height: 100%;
    display: block;
}
</style>
