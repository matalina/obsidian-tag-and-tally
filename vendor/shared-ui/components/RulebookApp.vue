<script setup lang="ts">
import { provide } from 'vue'
import { RouterView } from 'vue-router'
import type { RulebookPayload } from '../rulebook/rulebook-markdown'
import type { SearchEntry } from '../logic/search'

const props = defineProps<{
  initialPayload?: RulebookPayload
  searchIndex?: SearchEntry[]
}>()

provide('rulebookInitialPayload', props.initialPayload ?? { nav: [], pages: [] })
provide('rulebookSearchIndex', props.searchIndex ?? [])
</script>

<template>
  <div class="tag-tally-documentation-rulebook">
    <RouterView />
  </div>
</template>

<style scoped>
.tag-tally-documentation-rulebook {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  flex: 1;
}
.tag-tally-documentation-rulebook > * {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>
