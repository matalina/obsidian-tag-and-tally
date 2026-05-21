/**
 * Card data definitions for playing cards and tarot cards
 */

import { Card, PlayingSuit, TarotSuit } from "./types";

// Unicode suit symbols
export const SUIT_SYMBOLS: Record<PlayingSuit | TarotSuit, string> = {
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
    spades: "♠",
    wands: "🪄",
    cups: "🏆",
    swords: "⚔️",
    pentacles: "⭐",
};

// Playing card ranks
const PLAYING_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const NUMBERED_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10"];
const FACE_RANKS = ["A", "J", "Q", "K"];

// Playing card suits
const PLAYING_SUITS: PlayingSuit[] = ["hearts", "diamonds", "clubs", "spades"];

// Tarot suits
const TAROT_SUITS: TarotSuit[] = ["wands", "cups", "swords", "pentacles"];

// Tarot minor arcana ranks
const TAROT_MINOR_RANKS = ["Ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Page", "Knight", "Queen", "King"];

// Major Arcana cards
const MAJOR_ARCANA_NAMES = [
    "The Fool",
    "The Magician",
    "The High Priestess",
    "The Empress",
    "The Emperor",
    "The Hierophant",
    "The Lovers",
    "The Chariot",
    "Strength",
    "The Hermit",
    "Wheel of Fortune",
    "Justice",
    "The Hanged Man",
    "Death",
    "Temperance",
    "The Devil",
    "The Tower",
    "The Star",
    "The Moon",
    "The Sun",
    "Judgement",
    "The World",
];

/**
 * Generate all standard playing cards (52 cards)
 */
function generatePlayingCards(): Card[] {
    const cards: Card[] = [];

    for (const suit of PLAYING_SUITS) {
        for (const rank of PLAYING_RANKS) {
            const suitName = suit.charAt(0).toUpperCase() + suit.slice(1);
            cards.push({
                id: `playing-${suit}-${rank}`,
                name: `${rank} of ${suitName}`,
                shortName: `${rank}${SUIT_SYMBOLS[suit]}`,
                suit,
                rank,
                type: "playing",
                symbol: SUIT_SYMBOLS[suit],
            });
        }
    }

    return cards;
}

/**
 * Generate joker cards
 */
function generateJokers(): Card[] {
    return [
        {
            id: "joker-red",
            name: "Red Joker",
            shortName: "🃏R",
            type: "joker",
            symbol: "🃏",
        },
        {
            id: "joker-black",
            name: "Black Joker",
            shortName: "🃏B",
            type: "joker",
            symbol: "🃏",
        },
    ];
}

/**
 * Generate numbered playing cards only (2-10)
 */
function generateNumberedCards(): Card[] {
    const cards: Card[] = [];

    for (const suit of PLAYING_SUITS) {
        for (const rank of NUMBERED_RANKS) {
            const suitName = suit.charAt(0).toUpperCase() + suit.slice(1);
            cards.push({
                id: `playing-${suit}-${rank}`,
                name: `${rank} of ${suitName}`,
                shortName: `${rank}${SUIT_SYMBOLS[suit]}`,
                suit,
                rank,
                type: "playing",
                symbol: SUIT_SYMBOLS[suit],
            });
        }
    }

    return cards;
}

/**
 * Generate face cards only (A, J, Q, K)
 */
function generateFaceCards(): Card[] {
    const cards: Card[] = [];

    for (const suit of PLAYING_SUITS) {
        for (const rank of FACE_RANKS) {
            const suitName = suit.charAt(0).toUpperCase() + suit.slice(1);
            cards.push({
                id: `playing-${suit}-${rank}`,
                name: `${rank} of ${suitName}`,
                shortName: `${rank}${SUIT_SYMBOLS[suit]}`,
                suit,
                rank,
                type: "playing",
                symbol: SUIT_SYMBOLS[suit],
            });
        }
    }

    return cards;
}

/**
 * Generate playing cards for a specific suit
 */
function generateSuitCards(suit: PlayingSuit): Card[] {
    const cards: Card[] = [];
    const suitName = suit.charAt(0).toUpperCase() + suit.slice(1);

    for (const rank of PLAYING_RANKS) {
        cards.push({
            id: `playing-${suit}-${rank}`,
            name: `${rank} of ${suitName}`,
            shortName: `${rank}${SUIT_SYMBOLS[suit]}`,
            suit,
            rank,
            type: "playing",
            symbol: SUIT_SYMBOLS[suit],
        });
    }

    return cards;
}

/**
 * Generate Major Arcana cards
 */
function generateMajorArcana(): Card[] {
    return MAJOR_ARCANA_NAMES.map((name, index) => ({
        id: `tarot-major-${index}`,
        name: `${index}. ${name}`,
        shortName: `${index}-${name.replace(/^The\s+/, "")}`,
        rank: index,
        type: "tarot-major" as const,
        symbol: "✨",
    }));
}

/**
 * Generate Minor Arcana cards
 */
function generateMinorArcana(): Card[] {
    const cards: Card[] = [];

    for (const suit of TAROT_SUITS) {
        for (const rank of TAROT_MINOR_RANKS) {
            const suitName = suit.charAt(0).toUpperCase() + suit.slice(1);
            cards.push({
                id: `tarot-minor-${suit}-${rank.toLowerCase()}`,
                name: `${rank} of ${suitName}`,
                shortName: `${rank} ${SUIT_SYMBOLS[suit]}`,
                suit,
                rank,
                type: "tarot-minor",
                symbol: SUIT_SYMBOLS[suit],
            });
        }
    }

    return cards;
}

/**
 * Generate Minor Arcana cards for a specific suit
 */
function generateMinorArcanaSuit(suit: TarotSuit): Card[] {
    const cards: Card[] = [];
    const suitName = suit.charAt(0).toUpperCase() + suit.slice(1);

    for (const rank of TAROT_MINOR_RANKS) {
        cards.push({
            id: `tarot-minor-${suit}-${rank.toLowerCase()}`,
            name: `${rank} of ${suitName}`,
            shortName: `${rank} ${SUIT_SYMBOLS[suit]}`,
            suit,
            rank,
            type: "tarot-minor",
            symbol: SUIT_SYMBOLS[suit],
        });
    }

    return cards;
}

// Pre-generated card collections
export const PLAYING_CARDS = generatePlayingCards();
export const JOKERS = generateJokers();
export const NUMBERED_CARDS = generateNumberedCards();
export const FACE_CARDS = generateFaceCards();
export const MAJOR_ARCANA = generateMajorArcana();
export const MINOR_ARCANA = generateMinorArcana();

// Full deck combinations
export const FULL_DECK_WITH_JOKERS = [...PLAYING_CARDS, ...JOKERS];
export const FULL_DECK = PLAYING_CARDS;
export const FULL_TAROT = [...MAJOR_ARCANA, ...MINOR_ARCANA];

// Suit-specific card getters
export const HEARTS = generateSuitCards("hearts");
export const DIAMONDS = generateSuitCards("diamonds");
export const CLUBS = generateSuitCards("clubs");
export const SPADES = generateSuitCards("spades");

export const WANDS = generateMinorArcanaSuit("wands");
export const CUPS = generateMinorArcanaSuit("cups");
export const SWORDS = generateMinorArcanaSuit("swords");
export const PENTACLES = generateMinorArcanaSuit("pentacles");

// Export suit arrays for iteration
export { PLAYING_SUITS, TAROT_SUITS };
