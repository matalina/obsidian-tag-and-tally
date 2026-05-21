/**
 * Card Store - Singleton for managing card decks
 */

import { Card, Deck, DeckConfigType, DeckState } from "./types";
import {
    FULL_DECK_WITH_JOKERS,
    FULL_DECK,
    NUMBERED_CARDS,
    FACE_CARDS,
    FULL_TAROT,
    MINOR_ARCANA,
    MAJOR_ARCANA,
    HEARTS,
    DIAMONDS,
    CLUBS,
    SPADES,
    WANDS,
    CUPS,
    SWORDS,
    PENTACLES,
} from "./data";

export class CardStore {
    /**
     * Fisher-Yates shuffle algorithm for proper randomization
     */
    shuffle(deck: Deck): void {
        const cards = deck.cards;
        for (let i = cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cards[i], cards[j]] = [cards[j], cards[i]];
        }
    }

    /**
     * Draw the top card from a deck
     */
    draw(deck: Deck): Card | null {
        if (deck.cards.length === 0) {
            return null;
        }
        const card = deck.cards.pop()!;
        deck.drawn.push(card);
        deck.lastDrawn = card;
        return card;
    }

    /**
     * Reset a deck - return all drawn cards and shuffle
     */
    reset(deck: Deck): void {
        deck.cards = [...deck.cards, ...deck.drawn];
        deck.drawn = [];
        deck.lastDrawn = undefined;
        this.shuffle(deck);
    }

    /**
     * Get count information for a deck
     */
    getCount(deck: Deck): { remaining: number; drawn: number; total: number } {
        return {
            remaining: deck.cards.length,
            drawn: deck.drawn.length,
            total: deck.cards.length + deck.drawn.length,
        };
    }

    /**
     * Create a new deck with a copy of the given cards
     */
    private createDeck(id: string, name: string, cards: Card[]): Deck {
        const deck: Deck = {
            id,
            name,
            cards: [...cards],
            drawn: [],
        };
        this.shuffle(deck);
        return deck;
    }

    /**
     * Create deck(s) based on the configuration type
     */
    createDecks(configType: DeckConfigType): Deck[] {
        switch (configType) {
            case "full-52-jokers":
                return [this.createDeck("full-52-jokers", "Full Deck (54)", FULL_DECK_WITH_JOKERS)];

            case "full-52":
                return [this.createDeck("full-52", "Full Deck (52)", FULL_DECK)];

            case "by-suit-playing":
                return [
                    this.createDeck("hearts", "Hearts", HEARTS),
                    this.createDeck("diamonds", "Diamonds", DIAMONDS),
                    this.createDeck("clubs", "Clubs", CLUBS),
                    this.createDeck("spades", "Spades", SPADES),
                ];

            case "numbered-only":
                return [this.createDeck("numbered", "Numbered Cards (2-10)", NUMBERED_CARDS)];

            case "face-only":
                return [this.createDeck("face", "Face Cards (A,J,Q,K)", FACE_CARDS)];

            case "numbered-vs-face":
                return [
                    this.createDeck("numbered", "Numbered Cards (2-10)", NUMBERED_CARDS),
                    this.createDeck("face", "Face Cards (A,J,Q,K)", FACE_CARDS),
                ];

            case "full-tarot":
                return [this.createDeck("full-tarot", "Full Tarot (78)", FULL_TAROT)];

            case "minor-arcana":
                return [this.createDeck("minor-arcana", "Minor Arcana (56)", MINOR_ARCANA)];

            case "major-arcana":
                return [this.createDeck("major-arcana", "Major Arcana (22)", MAJOR_ARCANA)];

            case "by-arcana-type":
                return [
                    this.createDeck("major-arcana", "Major Arcana (22)", MAJOR_ARCANA),
                    this.createDeck("minor-arcana", "Minor Arcana (56)", MINOR_ARCANA),
                ];

            case "by-suit-major":
                return [
                    this.createDeck("wands", "Wands", WANDS),
                    this.createDeck("cups", "Cups", CUPS),
                    this.createDeck("swords", "Swords", SWORDS),
                    this.createDeck("pentacles", "Pentacles", PENTACLES),
                    this.createDeck("major-arcana", "Major Arcana", MAJOR_ARCANA),
                ];

            default:
                return [this.createDeck("full-52", "Full Deck (52)", FULL_DECK)];
        }
    }

    /**
     * Restore deck state from saved state
     */
    restoreDeckState(deck: Deck, state: DeckState): void {
        // Get all cards (both remaining and drawn)
        const allCards = [...deck.cards, ...deck.drawn];

        // Create card lookup map
        const cardMap = new Map<string, Card>();
        for (const card of allCards) {
            cardMap.set(card.id, card);
        }

        // Restore remaining cards in order
        deck.cards = state.remaining
            .map((id) => cardMap.get(id))
            .filter((card): card is Card => card !== undefined);

        // Restore drawn cards in order
        deck.drawn = state.drawn
            .map((id) => cardMap.get(id))
            .filter((card): card is Card => card !== undefined);

        // Restore last drawn card
        if (state.lastDrawn) {
            deck.lastDrawn = cardMap.get(state.lastDrawn);
        }
    }

    /**
     * Get deck state for saving
     */
    getDeckState(deck: Deck): DeckState {
        return {
            remaining: deck.cards.map((card) => card.id),
            drawn: deck.drawn.map((card) => card.id),
            lastDrawn: deck.lastDrawn?.id,
        };
    }

    /**
     * Find a card by ID across all cards in a deck
     */
    findCard(deck: Deck, cardId: string): Card | undefined {
        return (
            deck.cards.find((card) => card.id === cardId) ||
            deck.drawn.find((card) => card.id === cardId)
        );
    }
}

// Export singleton instance
let cardStoreInstance: CardStore | null = null;

export function getCardStore(): CardStore {
    if (!cardStoreInstance) {
        cardStoreInstance = new CardStore();
    }
    return cardStoreInstance;
}
