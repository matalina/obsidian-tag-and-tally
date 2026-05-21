/**
 * Function implementations for function-based random tables.
 * These functions are referenced from JSON table definitions.
 * Generated for plugin package.
 */

import { DiceRoll } from '@dice-roller/rpg-dice-roller';
import { getTableStore } from './store';

// Store access - uses plugin package store
function getStore() {
  return getTableStore();
}

// Scene functions
export function rollNaturalDisaster(): string {
  const store = getStore();
  return store.random('natural-disaster').result;
}

export function rollArtificialDisaster(): string {
  const store = getStore();
  return store.random('artificial-disaster').result;
}

export function rollDayOfWeekAgain(): string {
  const store = getStore();
  return store.random('day-of-week').result;
}

// Fantasy functions
export function generateFantasyDungeonNamePattern1(): string {
  const store = getStore();
  const descriptor = store.random('fantasy-dungeon-name-descriptor').result;
  const type = store.random('fantasy-dungeon-name-type').result;
  return `The ${descriptor} ${type}`;
}

export function generateFantasyDungeonNamePattern2(): string {
  const store = getStore();
  const type = store.random('fantasy-dungeon-name-type').result;
  const threat = store.random('fantasy-dungeon-name-threat').result;
  return `The ${type} of ${threat}`;
}

export function generateFantasyDungeonNamePattern3(): string {
  const store = getStore();
  const adjective = store.random('fantasy-dungeon-name-adjective').result;
  const type = store.random('fantasy-dungeon-name-type').result;
  return `${adjective} ${type}`;
}

export function fantasyFindSomething(): string {
  const store = getStore();
  const artifact = store.random('fantasy-objective-artifact').result;
  return `Find ${artifact}`;
}

export function fantasyCollectThings(): string {
  const store = getStore();
  const diceRoll = new DiceRoll('2d4');
  const count = diceRoll.total;
  const thing = store.random('fantasy-objective-things').result;
  return `Collect ${count} ${thing}`;
}

export function fantasyKillCreatures(): string {
  const store = getStore();
  const creatures = store.random('fantasy-objective-creatures').result;
  return `Kill the ${creatures}`;
}

export function fantasyRescueSomeone(): string {
  const store = getStore();
  const someone = store.random('fantasy-objective-someone').result;
  return `Rescue ${someone}`;
}

export function fantasyClearDungeon(): string {
  const store = getStore();
  const dungeonName = store.random('fantasy-dungeon-name-pattern').result;
  return `Clear the ${dungeonName} (Dungeon)`;
}

export function fantasyKillBoss(): string {
  const store = getStore();
  const boss = store.random('fantasy-objective-boss').result;
  return `Kill the ${boss}`;
}

// Modern/Urban functions
export function rollUrbanDistrictAgain(): string {
  const store = getStore();
  return store.random('urban-district').result;
}
