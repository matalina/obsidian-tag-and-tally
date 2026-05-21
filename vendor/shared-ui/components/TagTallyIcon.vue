<script setup lang="ts">
import { computed } from "vue";
import { Copy, Check, Plus, Trash2, Dices, Shuffle, ArrowUpFromLine, RotateCcw } from "lucide-vue-next";

const props = defineProps<{
  name: "copy" | "check" | "plus" | "trash-2" | "dices" | "shuffle" | "arrow-up-from-line" | "rotate-ccw";
}>();

const iconComponent = computed(() => {
  switch (props.name) {
    case "copy": return Copy;
    case "check": return Check;
    case "plus": return Plus;
    case "trash-2": return Trash2;
    case "dices": return Dices;
    case "shuffle": return Shuffle;
    case "arrow-up-from-line": return ArrowUpFromLine;
    case "rotate-ccw": return RotateCcw;
    default: return Copy;
  }
});
</script>

<template>
  <component :is="iconComponent" :size="16" class="tag-tally-icon" />
</template>

<style scoped>
.tag-tally-icon {
  display: inline-flex;
  flex-shrink: 0;
}
</style>
