/**
 * Card type definitions for the card generator feature
 */

export type CardType = "playing" | "tarot-major" | "tarot-minor" | "joker";

export type PlayingSuit = "hearts" | "diamonds" | "clubs" | "spades";
export type TarotSuit = "wands" | "cups" | "swords" | "pentacles";

export interface Card {
    id: string;
    name: string;
    shortName: string;
    suit?: PlayingSuit | TarotSuit;
    rank?: string | number;
    type: CardType;
    symbol?: string;
}

export interface Deck {
    id: string;
    name: string;
    cards: Card[];
    drawn: Card[];
    lastDrawn?: Card;
}

export type DeckConfigType =
    | "full-52-jokers"
    | "full-52"
    | "by-suit-playing"
    | "numbered-only"
    | "face-only"
    | "numbered-vs-face"
    | "full-tarot"
    | "minor-arcana"
    | "major-arcana"
    | "by-arcana-type"
    | "by-suit-major";

export interface DeckConfig {
    type: DeckConfigType;
    label: string;
    description: string;
    deckCount: number;
}

export interface DeckState {
    remaining: string[];
    drawn: string[];
    lastDrawn?: string;
}

export interface CardsTabState {
    deckType: DeckConfigType;
    decksState: {
        [deckId: string]: DeckState;
    };
}

export const DECK_CONFIGS: DeckConfig[] = [
    { type: "full-52-jokers", label: "Full 52 + Jokers", description: "Standard deck with jokers", deckCount: 1 },
    { type: "full-52", label: "Full 52", description: "Standard deck without jokers", deckCount: 1 },
    { type: "by-suit-playing", label: "By Suit (Playing)", description: "Hearts, Diamonds, Clubs, Spades", deckCount: 4 },
    { type: "numbered-only", label: "Numbered Only", description: "2-10 from all suits", deckCount: 1 },
    { type: "face-only", label: "Face Cards Only", description: "J, Q, K, A from all suits", deckCount: 1 },
    { type: "numbered-vs-face", label: "Numbered vs Face", description: "Numbered (2-10) and Face (J,Q,K,A) as separate decks", deckCount: 2 },
    { type: "full-tarot", label: "Full Tarot", description: "All 78 tarot cards", deckCount: 1 },
    { type: "minor-arcana", label: "Minor Arcana", description: "56 minor arcana cards", deckCount: 1 },
    { type: "major-arcana", label: "Major Arcana", description: "22 major arcana cards", deckCount: 1 },
    { type: "by-arcana-type", label: "By Arcana Type", description: "Major and Minor as separate decks", deckCount: 2 },
    { type: "by-suit-major", label: "By Suit + Major", description: "Wands, Cups, Swords, Pentacles, Major", deckCount: 5 },
];
