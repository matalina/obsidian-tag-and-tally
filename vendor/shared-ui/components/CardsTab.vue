<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useSidebarStore } from "@shared-ui/stores/sidebar";
import { type Deck, type DeckConfigType, type CardsTabState, DECK_CONFIGS } from "@shared-ui/cards/types";
import { getCardStore } from "@shared-ui/cards/store";
import TagTallyIcon from "./TagTallyIcon.vue";
import ResultBox from "./ResultBox.vue";

const store = useSidebarStore();
const { cardsState } = storeToRefs(store);
const cardStore = getCardStore();
const deckType = ref<DeckConfigType>(cardsState.value?.deckType ?? "full-52-jokers");
const decks = ref<Deck[]>([]);

function buildDecksAndRestore(restoreFromStore = true) {
  const nextDecks = cardStore.createDecks(deckType.value);
  if (restoreFromStore && cardsState.value?.decksState) {
    for (const deck of nextDecks) {
      const s = cardsState.value!.decksState[deck.id];
      if (s) cardStore.restoreDeckState(deck, s);
    }
  }
  decks.value = nextDecks;
}

function saveState() {
  const state: CardsTabState = { deckType: deckType.value, decksState: {} };
  for (const deck of decks.value) state.decksState[deck.id] = cardStore.getDeckState(deck);
  store.cardsState = state;
}

function shuffle(deck: Deck) {
  cardStore.shuffle(deck);
  saveState();
  decks.value = [...decks.value];
}

function draw(deck: Deck) {
  cardStore.draw(deck);
  saveState();
  decks.value = [...decks.value];
}

function reset(deck: Deck) {
  cardStore.reset(deck);
  saveState();
  decks.value = [...decks.value];
}

function suitClass(card: { suit?: string; type: string }) {
  if (card.suit === "hearts" || card.suit === "diamonds") return "tag-tally-cards-red";
  if (card.suit === "clubs" || card.suit === "spades") return "tag-tally-cards-black";
  if (card.suit) return `tag-tally-cards-${card.suit}`;
  if (card.type === "joker") return "tag-tally-cards-joker";
  if (card.type === "tarot-major") return "tag-tally-cards-major";
  return "";
}

function drawnCardCopyText(deck: Deck): string {
  if (!deck.lastDrawn) return "";
  return deck.lastDrawn.symbol ? `${deck.lastDrawn.symbol} ${deck.lastDrawn.name}` : deck.lastDrawn.name;
}

onMounted(() => buildDecksAndRestore());
watch(deckType, () => { buildDecksAndRestore(false); saveState(); });
watch(cardsState, (state) => {
  if (state && state.deckType !== deckType.value) {
    deckType.value = state.deckType;
    buildDecksAndRestore();
  }
}, { immediate: false });
</script>

<template>
  <div class="tag-tally-cards-tab">
    <div class="tag-tally-select-container">
      <label for="cards-deck-type-select">Deck Type</label>
      <select id="cards-deck-type-select" v-model="deckType" class="tag-tally-select">
        <option v-for="config in DECK_CONFIGS" :key="config.type" :value="config.type">{{ config.label }}</option>
      </select>
    </div>
    <div class="tag-tally-cards-decks">
      <div v-for="deck in decks" :key="deck.id" class="tag-tally-cards-deck">
        <div class="tag-tally-cards-deck-header">
          <span class="tag-tally-cards-deck-name">{{ deck.name }}</span>
          <span class="tag-tally-cards-deck-count">({{ cardStore.getCount(deck).remaining }}/{{ cardStore.getCount(deck).total }})</span>
        </div>
        <div class="tag-tally-cards-buttons">
          <button type="button" class="tag-tally-cards-btn tag-tally-cards-btn-draw" aria-label="Draw card" :disabled="cardStore.getCount(deck).remaining === 0" :class="{ 'tag-tally-cards-btn-disabled': cardStore.getCount(deck).remaining === 0 }" @click="draw(deck)">
            <TagTallyIcon name="arrow-up-from-line" />
          </button>
          <span class="tag-tally-cards-buttons-sep" aria-hidden="true">|</span>
          <button type="button" class="tag-tally-cards-btn tag-tally-cards-btn-shuffle" aria-label="Shuffle deck" @click="shuffle(deck)">
            <TagTallyIcon name="shuffle" />
          </button>
          <button type="button" class="tag-tally-cards-btn tag-tally-cards-btn-reset" aria-label="Reset deck" @click="reset(deck)">
            <TagTallyIcon name="rotate-ccw" />
          </button>
        </div>
        <ResultBox :copy-value="drawnCardCopyText(deck)" class="tag-tally-cards-result">
          <template v-if="deck.lastDrawn">
            <div class="tag-tally-cards-label">Last Drawn:</div>
            <div class="tag-tally-cards-value" :class="suitClass(deck.lastDrawn)">
              <span v-if="deck.lastDrawn.symbol" class="tag-tally-cards-symbol">{{ deck.lastDrawn.symbol }}</span>
              <span class="tag-tally-cards-name">{{ deck.lastDrawn.name }}</span>
            </div>
          </template>
          <div v-else class="tag-tally-cards-empty">No cards drawn yet</div>
        </ResultBox>
        <div class="tag-tally-cards-counts">
          <span class="tag-tally-cards-remaining">Remaining: {{ cardStore.getCount(deck).remaining }}</span>
          <span class="tag-tally-cards-drawn">Drawn: {{ cardStore.getCount(deck).drawn }}</span>
        </div>
        <div class="tag-tally-cards-discard">
          <div class="tag-tally-cards-discard-label">Discard pile</div>
          <div class="tag-tally-cards-discard-list">
            <div v-if="deck.drawn.length === 0" class="tag-tally-cards-discard-empty">No cards in discard</div>
            <div
              v-for="(card, i) in [...deck.drawn].reverse()"
              :key="`${deck.id}-${card.id}-${i}`"
              class="tag-tally-cards-discard-entry"
              :class="suitClass(card)"
            >
              <span v-if="card.symbol" class="tag-tally-cards-symbol">{{ card.symbol }}</span>
              <span class="tag-tally-cards-name">{{ card.name }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tag-tally-cards-tab {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  width: 100%;
}
.tag-tally-cards-tab .tag-tally-select-container {
  flex-shrink: 0;
}
.tag-tally-cards-decks {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--size-4, 1.5rem);
}
.tag-tally-cards-deck {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}
.tag-tally-cards-result :deep(.tag-tally-result-box__body) {
  width: 100%;
}
.tag-tally-cards-discard {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  margin-top: var(--size-3, 1rem);
  width: 100%;
}
.tag-tally-cards-discard-label {
  font-size: 0.8em;
  color: var(--text-muted, var(--gray-6));
  margin-bottom: var(--size-1, 0.25rem);
  flex-shrink: 0;
}
.tag-tally-cards-discard-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-2, 5px);
  padding: var(--size-2, 0.5rem);
}
.tag-tally-cards-discard-entry {
  display: flex;
  align-items: center;
  gap: var(--size-2, 0.5rem);
  font-size: 0.9em;
  padding: var(--size-1, 0.25rem) var(--size-2, 0.5rem);
  border-bottom: 1px solid var(--background-modifier-border);
}
.tag-tally-cards-discard-entry:last-child {
  border-bottom: none;
}
.tag-tally-cards-discard-empty {
  color: var(--text-muted, var(--gray-6));
  font-style: italic;
  text-align: center;
  padding: var(--size-2, 0.5rem);
}
</style>
