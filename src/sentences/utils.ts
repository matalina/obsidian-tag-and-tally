import { getTableStore } from '../tables/store';

// Define the sentences that can be created
export const SENTENCE_TEMPLATES: Record<string, string> = {
  Scene: 'This scene is a {scene-descriptor} {scene-type} that {scene-[scene-type]}',
  Creature:
    '**{creature-name-prefix} {creature-name-[creature-type]}** ({creature-disposition} {creature-descriptor} {creature-type}): This creature {creature-motivation} and attacks with {creature-attack-choice-[damage-type]} for {damage-type} damage. It features a unique ability to {creature-special-ability-[creature-type]}. It {creature-strength-[creature-type]} and {creature-weakness-[creature-type]}.',
  Quest: '{quest-type} {quest-objective-[quest-type]}',
  'NPC/Character':
    '**Name** is a {(theme)-descriptor} {(theme)-species} {(theme)-type-[option]} who {(theme)-does-something}. They are motivated by {character-motivation} and want to {character-goal}. In combat, they deal {wound-damage} damage with {character-attack-choice}, but they {character-secret}.',
  Species:
    'This species is a {character-species-aged} {character-species-descriptor} people who {character-species-cultural-trait} and {character-species-feature}.',
  Type: 'This type is a {fantasy-descriptor} {fantasy-type} who {fantasy-does-something}.',
  Wounds:
    'This {wound-damage-type} {wound-injury-type} is a {wound-descriptor} {wound-type-of-mark} located on {wound-body-part} that {wound-detriment}.',
  'Blood Magic Trauma':
    'This wound is a {wound-blood-magic-descriptor} {wound-blood-magic-mark} located on {wound-blood-magic-body-part} that {wound-blood-magic-detriment}.',
  Faction:
    '**{(theme)-faction-name-pattern}** is a {(theme)-faction-descriptor} {(theme)-faction-organization-type} that {(theme)-faction-core-function} and {(theme)-faction-goal}. Despite their outward reputation, they {(theme)-faction-secret}.',
  Location: 'This location is a {location-descriptive} {location-type} that {location-distinctive-feature}',
  Dungeon:
    '**{(theme)-dungeon-name-pattern}** is a {(theme)-dungeon-descriptive} {(theme)-dungeon-type} that {(theme)-dungeon-distinctive-feature}',
  Lair: '**{lair-name-pattern}** is a {lair-descriptive} {lair-type} that {lair-distinctive-feature}',
  Room: 'This room is a {room-descriptive} {room-type} that {room-distinctive-feature}',
  Armor: 'This armor is a {armor-descriptor} {material-armor} {armor-type} that {armor-special}.',
  Item: 'This item is a {item-descriptor} {item-type} that {item-special}.',
  Weapon:
    'This weapon is a {weapon-descriptor} {material-weapon} {weapon-type} that does {damage-type} damage and {weapon-special}.',
  Trap: 'This trap is a {trap-descriptor} {trap-type} that {trigger-type} and {trap-effect}.',
  Consumable:
    'This consumable is a {consumable-descriptor} {consumable-type} that {consumable-effect} and {consumable-special}.',
};

/** For inline `` `sentence:type` `` insert only: avoid Markdown/Obsidian treating `[text]` as link syntax. */
export function escapeMarkdownOpeningBrackets(text: string): string {
  return text.replace(/(?<!\\)\[/g, '\\[');
}

// Format theme name for display (human readable, capitalized, no dashes)
export function formatThemeName(theme: string): string {
  return theme
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Resolve table reference with theme/location/option context
export function resolveTableReference(
  tableRef: string,
  theme: string,
  locationType?: string,
  npcOption?: string,
  resolvedValues?: Map<string, string>,
  useFantasySpecies?: boolean,
): string {
  const store = getTableStore();

  // ULTRA-CRITICAL: Check for type-[option] pattern FIRST, before ANY other processing
  // This must be the very first check to prevent it from being processed as anything else
  if (tableRef.includes('[option]') && tableRef.includes('type')) {
    // Check if it matches the pattern: anything-type-[option]
    const typeOptionPattern = /(.+?)-type-\[option\]$/;
    if (typeOptionPattern.test(tableRef)) {
      // If npcOption is not set, return special marker for random selection
      if (!npcOption || npcOption === '') {
        return '__TYPE_FOR_CHARACTER__';
      }
    }
  }

  // Skip special creature refs that have multiple brackets - these are handled in generateSentenceWithTags
  if (
    tableRef.startsWith('creature-attack-choice-') ||
    tableRef.startsWith('creature-special-ability-') ||
    tableRef.startsWith('creature-strength-') ||
    tableRef.startsWith('creature-weakness-')
  ) {
    return `[Special creature ref: ${tableRef}]`;
  }

  // Handle dependent tables like {scene-[scene-type]} or {creature-name-[creature-type]}
  if (tableRef.includes('[') && tableRef.includes(']')) {
    // CRITICAL: Check for [option] FIRST, before any other bracket processing
    // This prevents fantasy-type-[option] from being treated as a dependent table
    // Check if this is a type reference with [option] - matches patterns like:
    // - type-[option]
    // - fantasy-type-[option]
    // - modern-type-[option]
    // - any-theme-type-[option]
    // Use a more explicit check that handles both with and without theme prefix
    if (tableRef.includes('[option]')) {
      // Check if it ends with -type-[option] (with optional theme prefix)
      const typeOptionMatch = tableRef.match(/(.+?)-type-\[option\]$/);
      if (typeOptionMatch) {
        // If npcOption is not set (undefined, null, or empty string), randomly pick
        if (!npcOption || npcOption === '') {
          return '__TYPE_FOR_CHARACTER__';
        }
        // If npcOption is set, continue to normal processing below
      }
    }

    // Check for special creature refs FIRST, before trying to match the regex
    // These have multiple hyphens so the regex won't match, but we need to catch them early
    if (
      tableRef.startsWith('creature-attack-choice-[') ||
      tableRef.startsWith('creature-special-ability-[') ||
      tableRef.startsWith('creature-strength-[') ||
      tableRef.startsWith('creature-weakness-[')
    ) {
      return `[Special creature ref: ${tableRef}]`;
    }

    // Match pattern like "quest-objective-[quest-type]" or "scene-[scene-type]"
    // Capture everything up to the last "-[" as the category, and everything in brackets as the dependent key
    const match = tableRef.match(/^(.+?)-\[([^\]]+)\]$/);
    if (match) {
      const category = match[1];
      const dependentKey = match[2];

      // Skip dependent table resolution if dependentKey is '[option]' and npcOption is not set
      // This will be handled by the type-[option] check above
      if (dependentKey === 'option' && !npcOption && category.includes('type')) {
        return '__TYPE_FOR_CHARACTER__';
      }

      // Special handling for all creature special refs - these are handled in generateSentenceWithTags
      if (
        category === 'creature-attack-choice' ||
        category === 'creature-special-ability' ||
        category === 'creature-strength' ||
        category === 'creature-weakness'
      ) {
        // This is handled specially in generateSentenceWithTags, don't try to resolve here
        return `[Special creature ref: ${tableRef}]`;
      }

      // Look up the resolved value for the dependent key
      if (resolvedValues && resolvedValues.size > 0) {
        // Try to find the dependent value - it might be stored under different keys
        let dependentValue: string | undefined;

        // Try exact match first
        dependentValue = resolvedValues.get(dependentKey);

        // Try with category prefix
        if (!dependentValue) {
          dependentValue = resolvedValues.get(`${category}-${dependentKey}`);
        }

        // Try just the last part (e.g., "type" from "scene-type")
        if (!dependentValue) {
          const keyParts = dependentKey.split('-');
          if (keyParts.length > 1) {
            dependentValue = resolvedValues.get(keyParts[keyParts.length - 1]);
          }
        }

        // Try full category match
        if (!dependentValue) {
          dependentValue = resolvedValues.get(category);
        }

        if (dependentValue) {
          // Normalize the dependent value (lowercase, replace spaces with dashes)
          const normalizedValue = dependentValue.toLowerCase().replace(/\s+/g, '-');
          const dependentTableName = `${category}-${normalizedValue}`;
          if (store.hasTable(dependentTableName)) {
            return dependentTableName;
          }
        }
      }
      return `[Dependent table not found: ${tableRef}]`;
    }
  }

  // Handle theme-based tables like {(theme)-descriptor}
  if (tableRef.startsWith('(theme)-')) {
    const tableName = tableRef.replace('(theme)-', '');
    const themeTableName = `${theme}-${tableName}`;

    // Special handling for species in modern and monster-hunter themes
    if (tableName === 'species' && (theme === 'modern' || theme === 'monster-hunter')) {
      // If useFantasySpecies is true, use fantasy-species
      // Otherwise, return a special marker that will be replaced with [human]
      if (useFantasySpecies) {
        if (store.hasTable('fantasy-species')) {
          return 'fantasy-species';
        }
      } else {
        // Return a special marker that will be handled in generation
        return '__MODERN_HUMAN__';
      }
    }

    // Monster-hunter descriptor always uses modern-descriptor
    if (theme === 'monster-hunter' && tableName === 'descriptor') {
      if (store.hasTable('modern-descriptor')) {
        return 'modern-descriptor';
      }
    }

    // does-something: fantasy and modern roll the shared d100 specialization table.
    // Only monster-hunter uses its own does-something table.
    if (tableName === 'does-something' && (theme === 'fantasy' || theme === 'modern')) {
      return 'does-something';
    }

    // Try theme-specific table
    if (store.hasTable(themeTableName)) {
      return themeTableName;
    }

    // Monster-hunter fallback: try modern first (for other tables, not descriptor)
    if (theme === 'monster-hunter') {
      const modernTableName = `modern-${tableName}`;
      if (store.hasTable(modernTableName)) {
        return modernTableName;
      }
    }

    // Fallback to fantasy
    const fantasyTableName = `fantasy-${tableName}`;
    if (store.hasTable(fantasyTableName)) {
      return fantasyTableName;
    }

    // Try without theme prefix
    if (store.hasTable(tableName)) {
      return tableName;
    }

    return `[Table not found: ${themeTableName}]`;
  }

  // Handle already-resolved theme tables (e.g., modern-species, monster-hunter-species)
  // This happens when the template has been preprocessed and (theme) was replaced
  if (tableRef === `${theme}-species` && (theme === 'modern' || theme === 'monster-hunter')) {
    if (useFantasySpecies) {
      if (store.hasTable('fantasy-species')) {
        return 'fantasy-species';
      }
    } else {
      // Return a special marker that will be handled in generation
      return '__MODERN_HUMAN__';
    }
  }

  // Monster-hunter descriptor always uses modern-descriptor (for already-resolved tables)
  if (tableRef === 'monster-hunter-descriptor') {
    if (store.hasTable('modern-descriptor')) {
      return 'modern-descriptor';
    }
  }

  // Fantasy and modern does-something roll the shared d100 specialization table (for already-resolved tables)
  // Only monster-hunter uses its own does-something table
  if (tableRef === 'fantasy-does-something' || tableRef === 'modern-does-something') {
    return 'does-something';
  }

  // Special handling for fantasy-type: combines class, profession, and criminal tables
  if (tableRef === 'fantasy-type') {
    return '__FANTASY_TYPE_COMBINED__';
  }

  // Special handling for wound-detriment: selects appropriate wound table based on damage type and severity
  if (tableRef === 'wound-detriment') {
    return '__WOUND_DETRIMENT__';
  }

  // Special handling for wound-damage-type: uses the damage type rolled for the detriment
  if (tableRef === 'wound-damage-type') {
    return '__WOUND_DAMAGE_TYPE__';
  }

  // Special handling for wound-injury-type: uses the injury type (severity) rolled for the detriment
  if (tableRef === 'wound-injury-type') {
    return '__WOUND_INJURY_TYPE__';
  }

  // Special handling for character-motivation: combines verb + noun
  if (tableRef === 'character-motivation') {
    return '__CHARACTER_MOTIVATION__';
  }

  // Special handling for character-goal: combines verb + noun
  if (tableRef === 'character-goal') {
    return '__CHARACTER_GOAL__';
  }

  // Special handling for character-secret: combines verb + noun
  if (tableRef === 'character-secret') {
    return '__CHARACTER_SECRET__';
  }

  // Special handling for faction-goal: combines verb + noun
  // Handle both theme-specific and generic versions
  // Check for theme-prefixed versions (e.g., modern-faction-goal) first
  if (tableRef.endsWith('-faction-goal') || tableRef === 'faction-goal' || tableRef === '(theme)-faction-goal') {
    return '__FACTION_GOAL__';
  }

  // Special handling for faction-secret: combines verb + noun
  // Handle both theme-specific and generic versions
  // Check for theme-prefixed versions (e.g., modern-faction-secret) first
  if (tableRef.endsWith('-faction-secret') || tableRef === 'faction-secret' || tableRef === '(theme)-faction-secret') {
    return '__FACTION_SECRET__';
  }

  // Handle location-based tables like {(location)-verb}
  if (tableRef.startsWith('(location)-')) {
    const tableName = tableRef.replace('(location)-', '');
    if (locationType) {
      const locationTableName = `${locationType}-${tableName}`;
      if (store.hasTable(locationTableName)) {
        return locationTableName;
      }
    }
    // Fallback to generic
    if (store.hasTable(tableName)) {
      return tableName;
    }
    return `[Table not found: ${locationType}-${tableName}]`;
  }

  // Handle NPC type options like {(theme)-type-[option]}
  if (tableRef.includes('type-[option]')) {
    // If npcOption is not set, we want to randomly pick class/profession/criminal
    // Return special marker to handle in generateSentenceWithTags
    if (!npcOption) {
      return '__TYPE_FOR_CHARACTER__';
    }

    if (npcOption && theme) {
      const themeLower = theme.toLowerCase();
      const optionTableName = `${themeLower}-type-${npcOption}`;

      // Check if theme-specific option table exists
      if (store.hasTable(optionTableName)) {
        return optionTableName;
      }

      // For modern/monster-hunter, fallback to generic type table
      if (themeLower === 'modern' || themeLower === 'monster-hunter') {
        const genericTypeTable = `${themeLower}-type`;
        if (store.hasTable(genericTypeTable)) {
          return genericTypeTable;
        }
      }

      // Fallback to fantasy option table
      const fantasyOptionTableName = `fantasy-type-${npcOption}`;
      if (store.hasTable(fantasyOptionTableName)) {
        return fantasyOptionTableName;
      }

      // Final fallback to generic fantasy-type
      if (store.hasTable('fantasy-type')) {
        return 'fantasy-type';
      }
    }
    return `[Table not found: ${theme}-type-${npcOption}]`;
  }

  // Special handling for {type} in character/NPC context
  // This will be handled in generateSentenceWithTags where we have access to the template
  // For now, return a special marker that will be handled later
  if (tableRef === 'type') {
    return '__TYPE_FOR_CHARACTER__';
  }

  // Direct table reference
  if (store.hasTable(tableRef)) {
    return tableRef;
  }

  return `[Table not found: ${tableRef}]`;
}

// Generate a character name based on theme
export function generateCharacterName(theme: string): string {
  const store = getTableStore();
  const themeLower = theme.toLowerCase();

  if (themeLower === 'fantasy') {
    // Roll on fantasy-name-patterns table
    try {
      const patternResult = store.random('fantasy-name-patterns');
      let pattern = patternResult.result;

      // Replace {npc-name-part-X} with actual values
      const partRegex = /\{npc-name-part-(\d+)\}/g;
      let match;
      while ((match = partRegex.exec(pattern)) !== null) {
        const partNum = match[1];
        try {
          const partResult = store.random(`npc-name-part-${partNum}`);
          pattern = pattern.replace(match[0], partResult.result);
        } catch (error) {
          console.error(`Error rolling npc-name-part-${partNum}:`, error);
          pattern = pattern.replace(match[0], `[Error: npc-name-part-${partNum}]`);
        }
      }
      // Parts are concatenated, which can leave mid-word capitals (e.g. "KaelDrae").
      // Normalize each name word to lowercase, then capitalize its first letter.
      return pattern
        .toLowerCase()
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    } catch (error) {
      console.error('Error generating fantasy name:', error);
      return 'Name';
    }
  } else if (themeLower === 'modern' || themeLower === 'monster-hunter') {
    // Randomly choose male or female
    const gender = Math.random() < 0.5 ? 'male' : 'female';
    const themePrefix = themeLower === 'monster-hunter' ? 'modern' : themeLower;

    try {
      const firstNameResult = store.random(`${themePrefix}-${gender}-firstname`);
      const middleNameResult = store.random(`${themePrefix}-${gender}-middlename`);
      const lastNameResult = store.random(`${themePrefix}-lastname`);

      const fullName = `${firstNameResult.result} ${middleNameResult.result} ${lastNameResult.result}`;
      return fullName;
    } catch (error) {
      console.error(`Error generating ${themeLower} name:`, error);
      return 'Name';
    }
  }

  return 'Name';
}

// Generate a faction name from pattern table
export function generateFactionName(theme: string = 'fantasy'): string {
  const store = getTableStore();
  const themeLower = theme.toLowerCase();

  try {
    // Try theme-specific pattern table first, fallback to generic
    const patternTable = store.hasTable(`${themeLower}-faction-name-pattern`)
      ? `${themeLower}-faction-name-pattern`
      : 'faction-name-pattern';
    const patternResult = store.random(patternTable);
    let pattern = patternResult.result;

    // Replace {faction-name-adjective-1}, {faction-name-adjective-2}, etc. with actual values
    // Handle both theme-specific (e.g., {modern-faction-name-adjective-1}) and generic references
    const refRegex = /\{(?:modern-|fantasy-|monster-hunter-)?faction-name-([^}]+)\}/g;
    let match;
    while ((match = refRegex.exec(pattern)) !== null) {
      // Check if the reference already has a theme prefix
      const fullMatch = match[0];
      if (fullMatch.includes(`${themeLower}-faction-name-`)) {
        // Already has theme prefix, use as-is
        const tableName = fullMatch.replace('{', '').replace('}', '');
        try {
          const partResult = store.random(tableName);
          pattern = pattern.replace(fullMatch, partResult.result);
        } catch (error) {
          console.error(`Error rolling ${tableName}:`, error);
          pattern = pattern.replace(fullMatch, `[Error: ${tableName}]`);
        }
      } else {
        // No theme prefix, try theme-specific first, then generic
        const themeTableName = `${themeLower}-faction-name-${match[1]}`;
        const genericTableName = `faction-name-${match[1]}`;
        const tableName = store.hasTable(themeTableName) ? themeTableName : genericTableName;
        try {
          const partResult = store.random(tableName);
          pattern = pattern.replace(fullMatch, partResult.result);
        } catch (error) {
          console.error(`Error rolling ${tableName}:`, error);
          pattern = pattern.replace(fullMatch, `[Error: ${tableName}]`);
        }
      }
    }
    return pattern;
  } catch (error) {
    console.error('Error generating faction name:', error);
    return 'Name';
  }
}

// Generate a lair name from pattern table
export function generateLairName(): string {
  const store = getTableStore();

  try {
    const patternResult = store.random('lair-name-pattern');
    let pattern = patternResult.result;

    // Replace {lair-name-descriptor}, {lair-name-type}, {lair-name-adjective} with actual values
    const refRegex = /\{lair-name-([^}]+)\}/g;
    let match;
    while ((match = refRegex.exec(pattern)) !== null) {
      const tableName = `lair-name-${match[1]}`;
      try {
        const partResult = store.random(tableName);
        pattern = pattern.replace(match[0], partResult.result);
      } catch (error) {
        console.error(`Error rolling ${tableName}:`, error);
        pattern = pattern.replace(match[0], `[Error: ${tableName}]`);
      }
    }
    return pattern;
  } catch (error) {
    console.error('Error generating lair name:', error);
    return 'Name';
  }
}

// Generate a sentence from a template
export function generateSentence(
  template: string,
  theme: string,
  locationType?: string,
  npcOption?: string,
  useFantasySpecies?: boolean,
  creatureType?: string,
  itemType?: string,
  injuryType?: string,
  damageType?: string,
): string {
  const store = getTableStore();
  const resolvedValues = new Map<string, string>();

  // Pre-populate resolvedValues with provided types if available
  if (creatureType) {
    resolvedValues.set('creature-type', creatureType);
    resolvedValues.set('type', creatureType); // Also store as 'type' for broader lookup
  }
  if (itemType) {
    resolvedValues.set('item-type', itemType);
  }
  if (injuryType) {
    // Store injury type in the format expected by wound generation
    resolvedValues.set('__wound_injury_type__', injuryType);
  }
  if (damageType) {
    // Validate that damageType is not actually an injury type
    const injuryTypes = ['Strain', 'Lingering Trauma', 'Debilitating Injury', 'Lasting Scar'];
    if (damageType.includes(' ') || injuryTypes.includes(damageType)) {
      // This is an injury type, not a damage type - don't store it
      console.warn(`Invalid damage type parameter (looks like injury type): ${damageType}. Ignoring.`);
    } else {
      // Store damage type in the format expected by wound generation
      resolvedValues.set('__wound_damage_type__', damageType);
    }
  }

  // Replace (theme) placeholder with actual theme (lowercase, kebab-case)
  const themeLower = theme.toLowerCase();
  template = template.replace(/\(theme\)/g, themeLower);

  // Replace [option] placeholder with actual option value
  if (npcOption) {
    template = template.replace(/\[option\]/g, npcOption);
  }

  // Generate character name for NPC/Character sentences (the only template containing **Name**)
  if (template.includes('**Name**')) {
    const characterName = generateCharacterName(theme);
    // Add ** markers around the name since template has **Name**
    template = template.replace(/\*\*Name\*\*/g, `**${characterName}**`);
  }

  // Note: faction-name-pattern will be handled as a special case during table resolution

  // Find all table references
  const tableRefRegex = /\{([^}]+)\}/g;
  const refs: Array<{ match: string; ref: string; index: number }> = [];
  let match;

  // Collect all references with their positions
  while ((match = tableRefRegex.exec(template)) !== null) {
    refs.push({
      match: match[0],
      ref: match[1],
      index: match.index,
    });
  }

  // Separate independent and dependent references
  const independentRefs: Array<{ match: string; ref: string; index: number }> = [];
  const dependentRefs: Array<{ match: string; ref: string; index: number }> = [];

  for (const ref of refs) {
    if (ref.ref.includes('[') && ref.ref.includes(']')) {
      dependentRefs.push(ref);
    } else {
      independentRefs.push(ref);
    }
  }

  // Build result by processing template character by character
  let result = '';
  let currentIndex = 0;
  const replacements = new Map<number, string>();

  // First pass: resolve independent tables
  for (const ref of independentRefs) {
    const tableName = resolveTableReference(ref.ref, theme, locationType, npcOption, resolvedValues, useFantasySpecies);

    // Check for __TYPE_FOR_CHARACTER__ BEFORE any other processing
    // This must be checked before the error handling below
    const isCharacterSentence = template.includes('**Name**') || npcOption !== undefined;
    const npcOptionNotSet = !npcOption || npcOption === '';
    if (
      tableName === '__TYPE_FOR_CHARACTER__' ||
      tableName.toLowerCase() === '__type_for_character__' ||
      (ref.ref.match(/-type-\[option\]$/) && isCharacterSentence && npcOptionNotSet)
    ) {
      try {
        // Randomly choose between class, profession, or criminal
        const typeOptions = ['class', 'profession', 'criminal'];
        const randomOption = typeOptions[Math.floor(Math.random() * typeOptions.length)];
        const typeTableName = `${themeLower}-type-${randomOption}`;

        // Try theme-specific table first
        let tableToUse: string | null = null;
        if (store.hasTable(typeTableName)) {
          tableToUse = typeTableName;
        } else {
          // Fallback to fantasy tables
          const fantasyTypeTableName = `fantasy-type-${randomOption}`;
          if (store.hasTable(fantasyTypeTableName)) {
            tableToUse = fantasyTypeTableName;
          }
        }

        if (tableToUse) {
          const tableResult = store.random(tableToUse);
          let value = tableResult.result.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, tableResult.result);
          continue;
        } else {
          // No table found, generate error tag
          replacements.set(ref.index, `[Error: type]`);
          continue;
        }
      } catch (error) {
        console.error('Error rolling type table for character:', error);
        replacements.set(ref.index, `[Error: type]`);
        continue;
      }
    }

    try {
      // Special handling for faction-name-pattern: generate full name with pattern resolution
      if (ref.ref === 'faction-name-pattern') {
        const factionName = generateFactionName();
        // Check if template has ** around this reference
        const beforeRef = template.substring(Math.max(0, ref.index - 2), ref.index);
        const afterRef = template.substring(ref.index + ref.match.length, ref.index + ref.match.length + 2);
        if (beforeRef === '**' && afterRef === '**') {
          // Template has ** around it, so just use the name (template's ** will wrap it)
          replacements.set(ref.index, factionName);
        } else {
          // Template doesn't have **, so don't add it
          replacements.set(ref.index, factionName);
        }
        resolvedValues.set(ref.ref, factionName);
        continue;
      }

      // Special handling for lair-name-pattern: generate full name with pattern resolution
      if (ref.ref === 'lair-name-pattern') {
        const lairName = generateLairName();
        // Check if template has ** around this reference
        const beforeRef = template.substring(Math.max(0, ref.index - 2), ref.index);
        const afterRef = template.substring(ref.index + ref.match.length, ref.index + ref.match.length + 2);
        if (beforeRef === '**' && afterRef === '**') {
          // Template has ** around it, so just use the name (template's ** will wrap it)
          replacements.set(ref.index, lairName);
        } else {
          // Template doesn't have **, so don't add it
          replacements.set(ref.index, lairName);
        }
        resolvedValues.set(ref.ref, lairName);
        continue;
      }

      // Special handling for modern human species
      if (tableName === '__MODERN_HUMAN__') {
        let value = 'human';
        value = value.toLowerCase();
        value = `[${value}]`;
        replacements.set(ref.index, value);
        resolvedValues.set(ref.ref, 'human');
        continue;
      }

      // Special handling for fantasy-type: randomly select one of class, profession, or criminal
      if (tableName === '__FANTASY_TYPE_COMBINED__') {
        try {
          const typeTables = ['fantasy-type-class', 'fantasy-type-profession', 'fantasy-type-criminal'];
          const randomTable = typeTables[Math.floor(Math.random() * typeTables.length)];
          const tableResult = store.random(randomTable);
          let value = tableResult.result.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, tableResult.result);
          continue;
        } catch (error) {
          console.error('Error rolling fantasy type:', error);
          replacements.set(ref.index, `[Error: fantasy-type]`);
          continue;
        }
      }

      // Special handling for wound-detriment: roll damage type, severity, then appropriate mechanical detriment table
      // Uses stored damage type and injury type if already rolled, otherwise rolls and stores them
      if (tableName === '__WOUND_DETRIMENT__') {
        try {
          // Get or roll damage type
          let damageType = resolvedValues.get('__wound_damage_type__');
          let normalizedDamageType: string;

          // Valid damage types (single words, not injury types)
          const validDamageTypes = [
            'Physical',
            'Psychic',
            'Elemental',
            'Necrotic',
            'Radiant',
            'Shadow',
            'Chaos',
            'Toxic',
          ];
          const injuryTypes = ['Strain', 'Lingering Trauma', 'Debilitating Injury', 'Lasting Scar'];

          // Check if damageType is actually an injury type (has spaces or matches injury type names)
          if (damageType && (damageType.includes(' ') || injuryTypes.includes(damageType))) {
            // This is an injury type, not a damage type - clear it and roll a new one
            console.warn(
              `Invalid damage type detected (looks like injury type): ${damageType}. Rolling new damage type.`,
            );
            damageType = undefined;
            resolvedValues.delete('__wound_damage_type__');
          }

          if (!damageType) {
            // Roll on wound-damage to get damage type
            const damageResult = store.random('wound-damage');
            damageType = damageResult.result;

            // Extract first word before parentheses (e.g., "Physical (piercing...)" -> "Physical")
            const damageMatch = damageType.match(/^([^(]+)/);
            if (damageMatch) {
              damageType = damageMatch[1].trim();
            }

            // Store damage type for use by wound-damage-type placeholder
            resolvedValues.set('__wound_damage_type__', damageType);
          } else {
            // If pre-populated, extract first word before parentheses if present
            const damageMatch = damageType.match(/^([^(]+)/);
            if (damageMatch) {
              damageType = damageMatch[1].trim();
            }
            // Validate it's a valid damage type
            if (!validDamageTypes.includes(damageType)) {
              console.warn(`Invalid damage type: ${damageType}. Rolling new damage type.`);
              const damageResult = store.random('wound-damage');
              damageType = damageResult.result;
              const damageMatch = damageType.match(/^([^(]+)/);
              if (damageMatch) {
                damageType = damageMatch[1].trim();
              }
              resolvedValues.set('__wound_damage_type__', damageType);
            }
          }

          // Normalize damage type to lowercase
          normalizedDamageType = damageType.toLowerCase();

          // Get or roll severity
          let severity: string;
          let injuryTypeDisplay = resolvedValues.get('__wound_injury_type__');
          if (!injuryTypeDisplay) {
            // Roll 1d4 for severity: 1=strain, 2=lingering-trauma, 3=debilitating-injury, 4=lasting-scar
            const severityRoll = Math.floor(Math.random() * 4) + 1;
            const severityLevels = ['strain', 'lingering-trauma', 'debilitating-injury', 'lasting-scar'];
            severity = severityLevels[severityRoll - 1];

            // Format injury type for display (convert kebab-case to title case)
            injuryTypeDisplay = severity
              .split('-')
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');

            // Store injury type for use by wound-injury-type placeholder
            resolvedValues.set('__wound_injury_type__', injuryTypeDisplay);
          } else {
            // Convert injury type display back to severity format
            severity = injuryTypeDisplay.toLowerCase().replace(/\s+/g, '-');
          }

          // Construct table name: wound-detriment-{damage-type}-{severity}
          const woundTableName = `wound-detriment-${normalizedDamageType}-${severity}`;

          // Roll on the appropriate mechanical detriment table
          const woundResult = store.random(woundTableName);
          let value = woundResult.result.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, woundResult.result);
          continue;
        } catch (error) {
          console.error('Error rolling wound detriment:', error);
          replacements.set(ref.index, `[Error: wound-detriment]`);
          continue;
        }
      }

      // Special handling for wound-damage-type: use the damage type rolled for the detriment
      // If not already stored, roll it now and store for later use
      if (tableName === '__WOUND_DAMAGE_TYPE__') {
        let storedDamageType = resolvedValues.get('__wound_damage_type__');

        const injuryTypes = ['Strain', 'Lingering Trauma', 'Debilitating Injury', 'Lasting Scar'];

        // Check if storedDamageType is actually an injury type (has spaces or matches injury type names)
        if (storedDamageType && (storedDamageType.includes(' ') || injuryTypes.includes(storedDamageType))) {
          // This is an injury type, not a damage type - clear it and roll a new one
          console.warn(
            `Invalid damage type detected (looks like injury type): ${storedDamageType}. Rolling new damage type.`,
          );
          storedDamageType = undefined;
          resolvedValues.delete('__wound_damage_type__');
        }

        if (!storedDamageType) {
          // Roll damage type if not already stored (may be processed before wound-detriment)
          try {
            const damageResult = store.random('wound-damage');
            let damageType = damageResult.result;
            const damageMatch = damageType.match(/^([^(]+)/);
            if (damageMatch) {
              damageType = damageMatch[1].trim();
            }
            resolvedValues.set('__wound_damage_type__', damageType);
            storedDamageType = damageType;
          } catch (error) {
            console.error('Error rolling wound damage type:', error);
            replacements.set(ref.index, `[Error: wound-damage-type]`);
            continue;
          }
        }

        let value = storedDamageType.toLowerCase();
        value = `[${value}]`;
        replacements.set(ref.index, value);
        resolvedValues.set(ref.ref, storedDamageType);
        continue;
      }

      // Special handling for character-motivation: combines verb + noun into single tag
      if (tableName === '__CHARACTER_MOTIVATION__') {
        try {
          const verbResult = store.random('character-motivation-verb');
          const nounResult = store.random('character-motivation-noun');
          const combined = `${verbResult.result} ${nounResult.result}`;
          let value = combined.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, combined);
          continue;
        } catch (error) {
          console.error('Error rolling character motivation:', error);
          replacements.set(ref.index, `[Error: character-motivation]`);
          continue;
        }
      }

      // Special handling for character-goal: generates a quest (quest-type + matching objective)
      if (tableName === '__CHARACTER_GOAL__') {
        try {
          const typeResult = store.random('quest-type');
          const objectiveTable = `quest-objective-${typeResult.result.toLowerCase().replace(/\s+/g, '-')}`;
          const objectiveResult = store.random(objectiveTable);
          const combined = `${typeResult.result} ${objectiveResult.result}`;
          let value = combined.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, combined);
          continue;
        } catch (error) {
          console.error('Error rolling character goal quest:', error);
          replacements.set(ref.index, `[Error: character-goal]`);
          continue;
        }
      }

      // Special handling for character-secret: rolls the single d6 secret-tag table
      if (tableName === '__CHARACTER_SECRET__') {
        try {
          const secretResult = store.random('character-secret');
          const combined = secretResult.result;
          let value = combined.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, combined);
          continue;
        } catch (error) {
          console.error('Error rolling character secret:', error);
          replacements.set(ref.index, `[Error: character-secret]`);
          continue;
        }
      }

      // Special handling for faction-goal: combines verb + noun into single tag
      if (tableName === '__FACTION_GOAL__') {
        try {
          // Try theme-specific tables first, fallback to generic
          const themeLower = theme.toLowerCase();
          const verbTable = store.hasTable(`${themeLower}-faction-goal-verb`)
            ? `${themeLower}-faction-goal-verb`
            : 'faction-goal-verb';
          const nounTable = store.hasTable(`${themeLower}-faction-goal-noun`)
            ? `${themeLower}-faction-goal-noun`
            : 'faction-goal-noun';

          const verbResult = store.random(verbTable);
          let nounResult;
          try {
            nounResult = store.random(nounTable);
          } catch (nounError) {
            console.error(`Error rolling noun table ${nounTable}:`, nounError);
            // Fallback to generic noun table if theme-specific fails
            nounResult = store.random('faction-goal-noun');
          }
          const combined = `${verbResult.result} ${nounResult.result}`;
          let value = combined.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, combined);
          continue;
        } catch (error) {
          console.error('Error rolling faction goal:', error);
          replacements.set(ref.index, `[Error: faction-goal]`);
          continue;
        }
      }

      // Special handling for faction-secret: combines verb + noun into single tag
      if (tableName === '__FACTION_SECRET__') {
        try {
          // Try theme-specific tables first, fallback to generic
          const themeLower = theme.toLowerCase();
          const verbTable = store.hasTable(`${themeLower}-faction-secret-verb`)
            ? `${themeLower}-faction-secret-verb`
            : 'faction-secret-verb';
          const nounTable = store.hasTable(`${themeLower}-faction-secret-noun`)
            ? `${themeLower}-faction-secret-noun`
            : 'faction-secret-noun';

          const verbResult = store.random(verbTable);
          let nounResult;
          try {
            nounResult = store.random(nounTable);
          } catch (nounError) {
            console.error(`Error rolling noun table ${nounTable}:`, nounError);
            // Fallback to generic noun table if theme-specific fails
            nounResult = store.random('faction-secret-noun');
          }
          const combined = `${verbResult.result} ${nounResult.result}`;
          let value = combined.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, combined);
          continue;
        } catch (error) {
          console.error('Error rolling faction secret:', error);
          replacements.set(ref.index, `[Error: faction-secret]`);
          continue;
        }
      }

      // Special handling for wound-injury-type: use the injury type (severity) rolled for the detriment
      // If not already stored, roll it now and store for later use
      if (tableName === '__WOUND_INJURY_TYPE__') {
        let storedInjuryType = resolvedValues.get('__wound_injury_type__');
        if (!storedInjuryType) {
          // Roll severity if not already stored (may be processed before wound-detriment)
          try {
            const severityRoll = Math.floor(Math.random() * 4) + 1;
            const severityLevels = ['strain', 'lingering-trauma', 'debilitating-injury', 'lasting-scar'];
            const severity = severityLevels[severityRoll - 1];
            const injuryTypeDisplay = severity
              .split('-')
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
            resolvedValues.set('__wound_injury_type__', injuryTypeDisplay);
            storedInjuryType = injuryTypeDisplay;
          } catch (error) {
            console.error('Error rolling wound injury type:', error);
            replacements.set(ref.index, `[Error: wound-injury-type]`);
            continue;
          }
        }
        let value = storedInjuryType.toLowerCase();
        value = `[${value}]`;
        replacements.set(ref.index, value);
        resolvedValues.set(ref.ref, storedInjuryType);
        continue;
      }

      // Check if this is creature-type and we have a pre-selected type
      if (ref.ref === 'creature-type' && resolvedValues.has('creature-type')) {
        const preSelectedType = resolvedValues.get('creature-type')!;
        let value = preSelectedType.toLowerCase();
        value = `[${value}]`;
        replacements.set(ref.index, value);
        // Store with ref.ref key for consistency (already stored with 'creature-type' and 'type')
        resolvedValues.set(ref.ref, preSelectedType);
        continue;
      }

      // Check if this is item-type and we have a pre-selected type
      if (ref.ref === 'item-type' && resolvedValues.has('item-type')) {
        const preSelectedType = resolvedValues.get('item-type')!;
        let value = preSelectedType.toLowerCase();
        value = `[${value}]`;
        replacements.set(ref.index, value);
        // Store with ref.ref key for consistency
        resolvedValues.set(ref.ref, preSelectedType);
        continue;
      }

      let tableResult = store.random(tableName);
      let value = tableResult.result;

      // Check if the result is an error message about __type_for_character__
      // This happens when __TYPE_FOR_CHARACTER__ was used as a table name
      // Reuse isCharacterSentence and npcOptionNotSet from the loop scope above
      if (
        value.includes('__type_for_character__') ||
        value.includes('__TYPE_FOR_CHARACTER__') ||
        value.includes('[table not found: __type_for_character__]') ||
        value.includes('[Table not found: __TYPE_FOR_CHARACTER__]')
      ) {
        // This is a character sentence and we need to randomly pick type
        if (isCharacterSentence && npcOptionNotSet) {
          try {
            const typeOptions = ['class', 'profession', 'criminal'];
            const randomOption = typeOptions[Math.floor(Math.random() * typeOptions.length)];
            const typeTableName = `${themeLower}-type-${randomOption}`;

            // Try theme-specific table first
            let tableToUse: string | null = null;
            if (store.hasTable(typeTableName)) {
              tableToUse = typeTableName;
            } else {
              // Fallback to fantasy tables
              const fantasyTypeTableName = `fantasy-type-${randomOption}`;
              if (store.hasTable(fantasyTypeTableName)) {
                tableToUse = fantasyTypeTableName;
              }
            }

            if (tableToUse) {
              const newTableResult = store.random(tableToUse);
              value = newTableResult.result.toLowerCase();
              value = `[${value}]`;
              replacements.set(ref.index, value);
              resolvedValues.set(ref.ref, newTableResult.result);
              continue;
            } else {
              // No table found, generate error tag
              replacements.set(ref.index, `[Error: type]`);
              continue;
            }
          } catch (error) {
            console.error('Error rolling type table for character (result check):', error);
            replacements.set(ref.index, `[Error: type]`);
            continue;
          }
        }
      }

      // Handle recursive references - if result contains recursive error, re-roll once
      if (value.includes(`[Recursive table call detected: ${tableName}]`)) {
        // Re-roll the table to get a different result
        tableResult = store.random(tableName);
        value = tableResult.result;
        // If it still has the recursive error, use a fallback
        if (value.includes(`[Recursive table call detected: ${tableName}]`)) {
          value = '[type]'; // Fallback value
        }
      }

      // Also handle if result contains a reference to the same table (before processing)
      if (value.includes(`{${tableName}}`)) {
        // Re-roll the table to get a different result
        tableResult = store.random(tableName);
        value = tableResult.result;
        // If it still has the recursive reference, remove it
        if (value.includes(`{${tableName}}`)) {
          value = value.replace(`{${tableName}}`, '').trim();
          if (!value) {
            value = '[type]'; // Fallback value
          }
        }
      }

      // Check if this is creature name parts (should be bold, not in brackets)
      const isCreatureName = ref.ref === 'creature-name-prefix' || ref.ref.startsWith('creature-name-');
      // Check if this is faction name parts (should be bold, not in brackets)
      const isFactionName =
        ref.ref === 'faction-name-pattern' ||
        ref.ref.endsWith('-faction-name-pattern') ||
        ref.ref.startsWith('faction-name-') ||
        ref.ref.includes('-faction-name-');

      if (isCreatureName || isFactionName) {
        // do nothing
      } else {
        // Convert to lowercase for all other generated values
        value = value.toLowerCase();
        // Wrap in square brackets
        value = `[${value}]`;
      }

      replacements.set(ref.index, value);

      // Store resolved value for dependent tables (without brackets/bold for lookup)
      const valueForLookup = isCreatureName || isFactionName ? tableResult.result : tableResult.result.toLowerCase();
      resolvedValues.set(ref.ref, valueForLookup);

      // Extract key parts for flexible lookup
      const keyParts = ref.ref.split('-');
      if (keyParts.length >= 2) {
        // Store just the last part (e.g., "type" from "scene-type")
        resolvedValues.set(keyParts[keyParts.length - 1], valueForLookup);
        // Store the full ref as well
        resolvedValues.set(ref.ref, valueForLookup);
      } else {
        // Single part key
        resolvedValues.set(ref.ref, valueForLookup);
      }
    } catch (error) {
      console.error(`Error rolling table ${tableName}:`, error);
      replacements.set(ref.index, `[Error: ${tableName}]`);
    }
  }

  // Second pass: resolve dependent tables
  for (const ref of dependentRefs) {
    // CRITICAL: Check for type-[option] FIRST, before any other dependent table processing
    // This handles cases like fantasy-type-[option] when npcOption is not set
    // Check if ref ends with -type-[option] pattern (e.g., fantasy-type-[option])
    const hasTypeOptionPattern =
      ref.ref.includes('type') && ref.ref.includes('[option]') && ref.ref.endsWith('[option]');
    const isCharacterSentence = template.includes('**Name**') || npcOption !== undefined;
    const npcOptionNotSet = !npcOption || npcOption === '';

    if (hasTypeOptionPattern && isCharacterSentence && npcOptionNotSet) {
      try {
        // Randomly choose between class, profession, or criminal
        const typeOptions = ['class', 'profession', 'criminal'];
        const randomOption = typeOptions[Math.floor(Math.random() * typeOptions.length)];
        const typeTableName = `${themeLower}-type-${randomOption}`;

        // Try theme-specific table first
        let tableToUse: string | null = null;
        if (store.hasTable(typeTableName)) {
          tableToUse = typeTableName;
        } else {
          // Fallback to fantasy tables
          const fantasyTypeTableName = `fantasy-type-${randomOption}`;
          if (store.hasTable(fantasyTypeTableName)) {
            tableToUse = fantasyTypeTableName;
          }
        }

        if (tableToUse) {
          const tableResult = store.random(tableToUse);
          let value = tableResult.result.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, tableResult.result);
          continue;
        } else {
          // No table found, generate error tag
          replacements.set(ref.index, `[Error: type]`);
          continue;
        }
      } catch (error) {
        console.error('Error rolling type table for character (dependent refs):', error);
        replacements.set(ref.index, `[Error: type]`);
        continue;
      }
    }

    // Special handling for creature-attack-choice-[damage-type]
    if (ref.ref.startsWith('creature-attack-choice-')) {
      try {
        let damageType = resolvedValues.get('damage-type') || resolvedValues.get('damage');

        if (!damageType) {
          const damageTypeResult = store.random('damage-type');
          damageType = damageTypeResult.result;
          resolvedValues.set('damage-type', damageType);
          resolvedValues.set('damage', damageType);
        }

        let normalizedDamageType = damageType;
        const damageMatch = damageType.match(/^([^(]+)/);
        if (damageMatch) {
          normalizedDamageType = damageMatch[1].trim().toLowerCase();
        } else {
          normalizedDamageType = damageType.toLowerCase().split(' ')[0];
        }

        const attackChoiceTableName = `creature-attack-choice-${normalizedDamageType}`;

        const tableResult = store.random(attackChoiceTableName);
        let value = tableResult.result.toLowerCase();
        value = `[${value}]`;
        replacements.set(ref.index, value);
        continue;
      } catch (error) {
        console.error(`Error rolling creature-attack-choice:`, error);
        replacements.set(ref.index, `[Error: creature-attack-choice]`);
        continue;
      }
    }

    // Special handling for creature-special-ability-[creature-type]
    if (ref.ref.startsWith('creature-special-ability-')) {
      try {
        let creatureType = resolvedValues.get('creature-type') || resolvedValues.get('type');
        if (!creatureType) {
          const creatureTypeResult = store.random('creature-type');
          creatureType = creatureTypeResult.result;
          resolvedValues.set('creature-type', creatureType);
          resolvedValues.set('type', creatureType);
        }

        const normalizedCreatureType = creatureType.toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
        const specialAbilityTableName = `creature-special-ability-${normalizedCreatureType}`;

        const tableResult = store.random(specialAbilityTableName);
        let value = tableResult.result.toLowerCase();
        value = `[${value}]`;
        replacements.set(ref.index, value);
        continue;
      } catch (error) {
        console.error(`Error rolling creature-special-ability:`, error);
        replacements.set(ref.index, `[Error: creature-special-ability]`);
        continue;
      }
    }

    // Special handling for creature-strength-[creature-type]
    if (ref.ref.startsWith('creature-strength-')) {
      try {
        let creatureType = resolvedValues.get('creature-type') || resolvedValues.get('type');
        if (!creatureType) {
          const creatureTypeResult = store.random('creature-type');
          creatureType = creatureTypeResult.result;
          resolvedValues.set('creature-type', creatureType);
          resolvedValues.set('type', creatureType);
        }

        const normalizedCreatureType = creatureType.toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
        const strengthTableName = `creature-strength-${normalizedCreatureType}`;

        const tableResult = store.random(strengthTableName);
        let value = tableResult.result.toLowerCase();
        value = `[${value}]`;
        replacements.set(ref.index, value);
        continue;
      } catch (error) {
        console.error(`Error rolling creature-strength:`, error);
        replacements.set(ref.index, `[Error: creature-strength]`);
        continue;
      }
    }

    // Special handling for creature-weakness-[creature-type]
    if (ref.ref.startsWith('creature-weakness-')) {
      try {
        let creatureType = resolvedValues.get('creature-type') || resolvedValues.get('type');
        if (!creatureType) {
          const creatureTypeResult = store.random('creature-type');
          creatureType = creatureTypeResult.result;
          resolvedValues.set('creature-type', creatureType);
          resolvedValues.set('type', creatureType);
        }

        const normalizedCreatureType = creatureType.toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
        const weaknessTableName = `creature-weakness-${normalizedCreatureType}`;

        const tableResult = store.random(weaknessTableName);
        let value = tableResult.result.toLowerCase();
        value = `[${value}]`;
        replacements.set(ref.index, value);
        continue;
      } catch (error) {
        console.error(`Error rolling creature-weakness:`, error);
        replacements.set(ref.index, `[Error: creature-weakness]`);
        continue;
      }
    }

    // Special handling for creature-name-[creature-type]
    if (ref.ref.startsWith('creature-name-') && ref.ref.includes('[')) {
      try {
        let creatureType = resolvedValues.get('creature-type') || resolvedValues.get('type');
        if (!creatureType) {
          const creatureTypeResult = store.random('creature-type');
          creatureType = creatureTypeResult.result;
          resolvedValues.set('creature-type', creatureType);
          resolvedValues.set('type', creatureType);
        }

        const normalizedCreatureType = creatureType.toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
        const creatureNameTableName = `creature-name-${normalizedCreatureType}`;

        // Check if the specific creature-name table exists
        if (store.hasTable(creatureNameTableName)) {
          const tableResult = store.random(creatureNameTableName);
          let value = tableResult.result;
          // Don't wrap in brackets or lowercase for creature names (they should be bold)
          replacements.set(ref.index, value);
          continue;
        } else {
          // Fallback: if the specific table doesn't exist, use just the prefix
          // This handles cases like "Humanoid" or "Chimera" which don't have name tables
          if (store.hasTable('creature-name-prefix')) {
            const tableResult = store.random('creature-name-prefix');
            let value = tableResult.result;
            replacements.set(ref.index, value);
            continue;
          } else {
            // Last resort: use the creature type as the name
            replacements.set(ref.index, creatureType);
            continue;
          }
        }
      } catch (error) {
        console.error(`Error rolling creature-name:`, error);
        // Fallback to prefix if available
        try {
          if (store.hasTable('creature-name-prefix')) {
            const tableResult = store.random('creature-name-prefix');
            replacements.set(ref.index, tableResult.result);
            continue;
          }
        } catch {
          // Ignore fallback error
        }
        replacements.set(ref.index, `[Error: creature-name]`);
        continue;
      }
    }

    // Skip resolveTableReference for special creature refs
    if (
      ref.ref.startsWith('creature-attack-choice-') ||
      ref.ref.startsWith('creature-special-ability-') ||
      ref.ref.startsWith('creature-strength-') ||
      ref.ref.startsWith('creature-weakness-')
    ) {
      console.warn(`Special creature ref not handled: ${ref.ref}`);
      replacements.set(ref.index, `[Error: ${ref.ref}]`);
      continue;
    }

    const tableName = resolveTableReference(ref.ref, theme, locationType, npcOption, resolvedValues, useFantasySpecies);

    // Check for __TYPE_FOR_CHARACTER__ BEFORE error checking
    // Reuse isCharacterSentence and npcOptionNotSet from the loop scope above
    if (
      tableName === '__TYPE_FOR_CHARACTER__' ||
      tableName.toLowerCase() === '__type_for_character__' ||
      (ref.ref.match(/-type-\[option\]$/) && isCharacterSentence && npcOptionNotSet)
    ) {
      try {
        // Randomly choose between class, profession, or criminal
        const typeOptions = ['class', 'profession', 'criminal'];
        const randomOption = typeOptions[Math.floor(Math.random() * typeOptions.length)];
        const typeTableName = `${themeLower}-type-${randomOption}`;

        // Try theme-specific table first
        let tableToUse: string | null = null;
        if (store.hasTable(typeTableName)) {
          tableToUse = typeTableName;
        } else {
          // Fallback to fantasy tables
          const fantasyTypeTableName = `fantasy-type-${randomOption}`;
          if (store.hasTable(fantasyTypeTableName)) {
            tableToUse = fantasyTypeTableName;
          }
        }

        if (tableToUse) {
          const tableResult = store.random(tableToUse);
          let value = tableResult.result.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, tableResult.result);
          continue;
        } else {
          // No table found, generate error tag
          replacements.set(ref.index, `[Error: type]`);
          continue;
        }
      } catch (error) {
        console.error('Error rolling type table for character (dependent refs fallback):', error);
        replacements.set(ref.index, `[Error: type]`);
        continue;
      }
    }

    // Skip if resolveTableReference returned a special creature ref marker
    if (tableName.startsWith('[Special creature ref:') || tableName.startsWith('[Dependent table not found:')) {
      console.warn(`Cannot resolve table reference: ${ref.ref} -> ${tableName}`);
      replacements.set(ref.index, `[Error: ${ref.ref}]`);
      continue;
    }

    try {
      const tableResult = store.random(tableName);
      let value = tableResult.result;

      // Check if this is creature name part (should be bold, not in brackets)
      const isCreatureName = ref.ref.startsWith('creature-name-');
      // Check if this is faction name part (should be bold, not in brackets)
      const isFactionName = ref.ref.startsWith('faction-name-');

      if (isCreatureName || isFactionName) {
        // do nothing
      } else {
        // Convert to lowercase and wrap in square brackets
        value = value.toLowerCase();
        value = `[${value}]`;
      }

      replacements.set(ref.index, value);
    } catch (error) {
      // Final safety check: if tableName is __TYPE_FOR_CHARACTER__ (case-insensitive), handle it
      // Also check if ref.ref matches the pattern (in case resolveTableReference didn't catch it)
      // Reuse isCharacterSentence and npcOptionNotSet from above scope
      const isTypeForCharacter =
        tableName === '__TYPE_FOR_CHARACTER__' ||
        tableName.toLowerCase() === '__type_for_character__' ||
        tableName.includes('__type_for_character__') ||
        (ref.ref.endsWith('-type-[option]') && isCharacterSentence && npcOptionNotSet);

      if (isTypeForCharacter && isCharacterSentence && npcOptionNotSet) {
        try {
          // Randomly choose between class, profession, or criminal
          const typeOptions = ['class', 'profession', 'criminal'];
          const randomOption = typeOptions[Math.floor(Math.random() * typeOptions.length)];
          const typeTableName = `${themeLower}-type-${randomOption}`;

          // Try theme-specific table first
          let tableToUse: string | null = null;
          if (store.hasTable(typeTableName)) {
            tableToUse = typeTableName;
          } else {
            // Fallback to fantasy tables
            const fantasyTypeTableName = `fantasy-type-${randomOption}`;
            if (store.hasTable(fantasyTypeTableName)) {
              tableToUse = fantasyTypeTableName;
            }
          }

          if (tableToUse) {
            const tableResult = store.random(tableToUse);
            let value = tableResult.result.toLowerCase();
            value = `[${value}]`;
            replacements.set(ref.index, value);
            resolvedValues.set(ref.ref, tableResult.result);
            continue;
          } else {
            // No table found, generate error tag
            replacements.set(ref.index, `[Error: type]`);
            continue;
          }
        } catch (innerError) {
          console.error('Error rolling type table for character (error handler):', innerError);
          replacements.set(ref.index, `[Error: type]`);
          continue;
        }
      }

      console.error(`Error rolling dependent table ${tableName}:`, error);
      replacements.set(ref.index, `[Error: ${tableName}]`);
    }
  }

  // Build final result string
  const allRefs = [...independentRefs, ...dependentRefs].sort((a, b) => a.index - b.index);

  for (let i = 0; i < allRefs.length; i++) {
    const ref = allRefs[i];

    // Add text before this reference
    result += template.substring(currentIndex, ref.index);

    // Add replacement value
    const replacement = replacements.get(ref.index) || ref.match;
    result += replacement;

    // Update current index
    currentIndex = ref.index + ref.match.length;
  }

  // Add remaining text after last reference
  result += template.substring(currentIndex);

  // Capitalize first letter of sentence (after markdown processing)
  // This handles sentence starts
  result = result.replace(/^([a-z])/, (match) => match.toUpperCase());
  // Also capitalize after sentence-ending punctuation
  result = result.replace(/([.!?]\s+)([a-z])/g, (match, punc, letter) => punc + letter.toUpperCase());

  // Convert markdown to HTML for display
  // Convert **bold** to <strong>bold</strong> (non-greedy to handle multiple bold sections)
  result = result.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  // Convert _italic_ to <em>italic</em>
  result = result.replace(/_([^_]+?)_/g, '<em>$1</em>');

  return result;
}

// Generate a sentence from a template with bracket notation
// Returns plain text (not HTML) for code block replacement
export function generateSentenceWithTags(
  template: string,
  theme: string,
  locationType?: string,
  npcOption?: string,
  useFantasySpecies?: boolean,
  creatureType?: string,
  itemType?: string,
  injuryType?: string,
  damageType?: string,
): string {
  const store = getTableStore();
  const resolvedValues = new Map<string, string>();

  // Pre-populate resolvedValues with provided types if available
  if (creatureType) {
    resolvedValues.set('creature-type', creatureType);
    resolvedValues.set('type', creatureType);
  }
  if (itemType) {
    resolvedValues.set('item-type', itemType);
  }
  if (injuryType) {
    // Store injury type in the format expected by wound generation
    resolvedValues.set('__wound_injury_type__', injuryType);
  }
  if (damageType) {
    // Validate that damageType is not actually an injury type
    const injuryTypes = ['Strain', 'Lingering Trauma', 'Debilitating Injury', 'Lasting Scar'];
    if (damageType.includes(' ') || injuryTypes.includes(damageType)) {
      // This is an injury type, not a damage type - don't store it
      console.warn(`Invalid damage type parameter (looks like injury type): ${damageType}. Ignoring.`);
    } else {
      // Store damage type in the format expected by wound generation
      resolvedValues.set('__wound_damage_type__', damageType);
    }
  }

  // Replace (theme) placeholder with actual theme (lowercase, kebab-case)
  const themeLower = theme.toLowerCase();
  template = template.replace(/\(theme\)/g, themeLower);

  // Replace [option] placeholder with actual option value
  if (npcOption) {
    template = template.replace(/\[option\]/g, npcOption);
  }

  // Generate character name for NPC/Character sentences (the only template containing **Name**)
  if (template.includes('**Name**')) {
    const characterName = generateCharacterName(theme);
    // Add ** markers around the name since template has **Name**
    template = template.replace(/\*\*Name\*\*/g, `**${characterName}**`);
  }

  // Find all table references
  const tableRefRegex = /\{([^}]+)\}/g;
  const refs: Array<{ match: string; ref: string; index: number }> = [];
  let match;

  // Collect all references with their positions
  while ((match = tableRefRegex.exec(template)) !== null) {
    refs.push({
      match: match[0],
      ref: match[1],
      index: match.index,
    });
  }

  // Separate independent and dependent references
  const independentRefs: Array<{ match: string; ref: string; index: number }> = [];
  const dependentRefs: Array<{ match: string; ref: string; index: number }> = [];

  for (const ref of refs) {
    if (ref.ref.includes('[') && ref.ref.includes(']')) {
      dependentRefs.push(ref);
    } else {
      independentRefs.push(ref);
    }
  }

  // Build result by processing template character by character
  let result = '';
  let currentIndex = 0;
  const replacements = new Map<number, string>();

  // First pass: resolve independent tables
  for (const ref of independentRefs) {
    const tableName = resolveTableReference(ref.ref, theme, locationType, npcOption, resolvedValues, useFantasySpecies);

    // Check for __TYPE_FOR_CHARACTER__ BEFORE any other processing
    // This must be checked before the error handling below
    const isCharacterSentence = template.includes('**Name**') || npcOption !== undefined;
    if (
      tableName === '__TYPE_FOR_CHARACTER__' ||
      tableName.toLowerCase() === '__type_for_character__' ||
      (ref.ref.match(/-type-\[option\]$/) && isCharacterSentence && (!npcOption || npcOption === ''))
    ) {
      try {
        // Randomly choose between class, profession, or criminal
        const typeOptions = ['class', 'profession', 'criminal'];
        const randomOption = typeOptions[Math.floor(Math.random() * typeOptions.length)];
        const typeTableName = `${themeLower}-type-${randomOption}`;

        // Try theme-specific table first
        let tableToUse: string | null = null;
        if (store.hasTable(typeTableName)) {
          tableToUse = typeTableName;
        } else {
          // Fallback to fantasy tables
          const fantasyTypeTableName = `fantasy-type-${randomOption}`;
          if (store.hasTable(fantasyTypeTableName)) {
            tableToUse = fantasyTypeTableName;
          }
        }

        if (tableToUse) {
          const tableResult = store.random(tableToUse);
          let value = tableResult.result.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, tableResult.result);
          continue;
        } else {
          // No table found, generate error tag
          replacements.set(ref.index, `[error]`);
          continue;
        }
      } catch (error) {
        console.error('Error rolling type table for character:', error);
        replacements.set(ref.index, `[error]`);
        continue;
      }
    }

    try {
      // Special handling for faction-name-pattern: generate full name with pattern resolution
      // Handle both theme-specific (e.g., modern-faction-name-pattern) and generic versions
      if (ref.ref === 'faction-name-pattern' || ref.ref.endsWith('-faction-name-pattern')) {
        // Extract theme from reference if present, otherwise use function parameter
        let nameTheme = theme;
        if (ref.ref.endsWith('-faction-name-pattern')) {
          const themeMatch = ref.ref.match(/^(.+?)-faction-name-pattern$/);
          if (themeMatch) {
            nameTheme = themeMatch[1];
          }
        }
        const factionName = generateFactionName(nameTheme);
        // Check if template has ** around this reference
        const beforeRef = template.substring(Math.max(0, ref.index - 2), ref.index);
        const afterRef = template.substring(ref.index + ref.match.length, ref.index + ref.match.length + 2);
        if (beforeRef === '**' && afterRef === '**') {
          // Template has ** around it, so just use the name (template's ** will wrap it)
          replacements.set(ref.index, factionName);
        } else {
          // Template doesn't have **, so don't add it
          replacements.set(ref.index, factionName);
        }
        resolvedValues.set(ref.ref, factionName);
        continue;
      }

      // Special handling for lair-name-pattern: generate full name with pattern resolution
      if (ref.ref === 'lair-name-pattern') {
        const lairName = generateLairName();
        // Check if template has ** around this reference
        const beforeRef = template.substring(Math.max(0, ref.index - 2), ref.index);
        const afterRef = template.substring(ref.index + ref.match.length, ref.index + ref.match.length + 2);
        if (beforeRef === '**' && afterRef === '**') {
          // Template has ** around it, so just use the name (template's ** will wrap it)
          replacements.set(ref.index, lairName);
        } else {
          // Template doesn't have **, so don't add it
          replacements.set(ref.index, lairName);
        }
        resolvedValues.set(ref.ref, lairName);
        continue;
      }

      // Special handling for modern human species
      if (tableName === '__MODERN_HUMAN__') {
        let value = 'human';
        replacements.set(ref.index, value);
        resolvedValues.set(ref.ref, 'human');
        continue;
      }

      // Special handling for fantasy-type: randomly select one of class, profession, or criminal
      if (tableName === '__FANTASY_TYPE_COMBINED__') {
        try {
          const typeTables = ['fantasy-type-class', 'fantasy-type-profession', 'fantasy-type-criminal'];
          const randomTable = typeTables[Math.floor(Math.random() * typeTables.length)];
          const tableResult = store.random(randomTable);
          let value = tableResult.result.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, tableResult.result);
          continue;
        } catch (error) {
          console.error('Error rolling fantasy type:', error);
          replacements.set(ref.index, `[error]`);
          continue;
        }
      }

      // Special handling for wound-detriment: roll damage type, severity, then appropriate mechanical detriment table
      if (tableName === '__WOUND_DETRIMENT__') {
        try {
          let damageType = resolvedValues.get('__wound_damage_type__');
          let normalizedDamageType: string;

          // Valid damage types (single words, not injury types)
          const validDamageTypes = [
            'Physical',
            'Psychic',
            'Elemental',
            'Necrotic',
            'Radiant',
            'Shadow',
            'Chaos',
            'Toxic',
          ];
          const injuryTypes = ['Strain', 'Lingering Trauma', 'Debilitating Injury', 'Lasting Scar'];

          // Check if damageType is actually an injury type (has spaces or matches injury type names)
          if (damageType && (damageType.includes(' ') || injuryTypes.includes(damageType))) {
            // This is an injury type, not a damage type - clear it and roll a new one
            console.warn(
              `Invalid damage type detected (looks like injury type): ${damageType}. Rolling new damage type.`,
            );
            damageType = undefined;
            resolvedValues.delete('__wound_damage_type__');
          }

          if (!damageType) {
            const damageResult = store.random('wound-damage');
            damageType = damageResult.result;
            const damageMatch = damageType.match(/^([^(]+)/);
            if (damageMatch) {
              damageType = damageMatch[1].trim();
            }
            resolvedValues.set('__wound_damage_type__', damageType);
          } else {
            // If pre-populated, extract first word before parentheses if present
            const damageMatch = damageType.match(/^([^(]+)/);
            if (damageMatch) {
              damageType = damageMatch[1].trim();
            }
            // Validate it's a valid damage type
            if (!validDamageTypes.includes(damageType)) {
              console.warn(`Invalid damage type: ${damageType}. Rolling new damage type.`);
              const damageResult = store.random('wound-damage');
              damageType = damageResult.result;
              const damageMatch = damageType.match(/^([^(]+)/);
              if (damageMatch) {
                damageType = damageMatch[1].trim();
              }
              resolvedValues.set('__wound_damage_type__', damageType);
            }
          }
          normalizedDamageType = damageType.toLowerCase();

          let severity: string;
          let injuryTypeDisplay = resolvedValues.get('__wound_injury_type__');
          if (!injuryTypeDisplay) {
            const severityRoll = Math.floor(Math.random() * 4) + 1;
            const severityLevels = ['strain', 'lingering-trauma', 'debilitating-injury', 'lasting-scar'];
            severity = severityLevels[severityRoll - 1];
            injuryTypeDisplay = severity
              .split('-')
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
            resolvedValues.set('__wound_injury_type__', injuryTypeDisplay);
          } else {
            severity = injuryTypeDisplay.toLowerCase().replace(/\s+/g, '-');
          }

          const woundTableName = `wound-detriment-${normalizedDamageType}-${severity}`;
          const woundResult = store.random(woundTableName);
          let value = woundResult.result.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, woundResult.result);
          continue;
        } catch (error) {
          console.error('Error rolling wound detriment:', error);
          replacements.set(ref.index, `[error]`);
          continue;
        }
      }

      // Special handling for character-motivation: combines verb + noun into single tag
      if (tableName === '__CHARACTER_MOTIVATION__') {
        try {
          const verbResult = store.random('character-motivation-verb');
          const nounResult = store.random('character-motivation-noun');
          const combined = `${verbResult.result} ${nounResult.result}`;
          let value = combined.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, combined);
          continue;
        } catch (error) {
          console.error('Error rolling character motivation:', error);
          replacements.set(ref.index, `[error]`);
          continue;
        }
      }

      // Special handling for character-goal: generates a quest (quest-type + matching objective)
      if (tableName === '__CHARACTER_GOAL__') {
        try {
          const typeResult = store.random('quest-type');
          const objectiveTable = `quest-objective-${typeResult.result.toLowerCase().replace(/\s+/g, '-')}`;
          const objectiveResult = store.random(objectiveTable);
          const combined = `${typeResult.result} ${objectiveResult.result}`;
          let value = combined.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, combined);
          continue;
        } catch (error) {
          console.error('Error rolling character goal quest:', error);
          replacements.set(ref.index, `[error]`);
          continue;
        }
      }

      // Special handling for character-secret: rolls the single d6 secret-tag table
      if (tableName === '__CHARACTER_SECRET__') {
        try {
          const secretResult = store.random('character-secret');
          const combined = secretResult.result;
          let value = combined.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, combined);
          continue;
        } catch (error) {
          console.error('Error rolling character secret:', error);
          replacements.set(ref.index, `[error]`);
          continue;
        }
      }

      // Special handling for faction-goal: combines verb + noun into single tag
      if (tableName === '__FACTION_GOAL__') {
        try {
          // Try theme-specific tables first, fallback to generic
          const themeLower = theme.toLowerCase();
          const verbTable = store.hasTable(`${themeLower}-faction-goal-verb`)
            ? `${themeLower}-faction-goal-verb`
            : 'faction-goal-verb';
          const nounTable = store.hasTable(`${themeLower}-faction-goal-noun`)
            ? `${themeLower}-faction-goal-noun`
            : 'faction-goal-noun';

          const verbResult = store.random(verbTable);
          let nounResult;
          try {
            nounResult = store.random(nounTable);
          } catch (nounError) {
            console.error(`Error rolling noun table ${nounTable}:`, nounError);
            // Fallback to generic noun table if theme-specific fails
            nounResult = store.random('faction-goal-noun');
          }
          const combined = `${verbResult.result} ${nounResult.result}`;
          let value = combined.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, combined);
          continue;
        } catch (error) {
          console.error('Error rolling faction goal:', error);
          replacements.set(ref.index, `[error]`);
          continue;
        }
      }

      // Special handling for faction-secret: combines verb + noun into single tag
      if (tableName === '__FACTION_SECRET__') {
        try {
          // Try theme-specific tables first, fallback to generic
          const themeLower = theme.toLowerCase();
          const verbTable = store.hasTable(`${themeLower}-faction-secret-verb`)
            ? `${themeLower}-faction-secret-verb`
            : 'faction-secret-verb';
          const nounTable = store.hasTable(`${themeLower}-faction-secret-noun`)
            ? `${themeLower}-faction-secret-noun`
            : 'faction-secret-noun';

          const verbResult = store.random(verbTable);
          let nounResult;
          try {
            nounResult = store.random(nounTable);
          } catch (nounError) {
            console.error(`Error rolling noun table ${nounTable}:`, nounError);
            // Fallback to generic noun table if theme-specific fails
            nounResult = store.random('faction-secret-noun');
          }
          const combined = `${verbResult.result} ${nounResult.result}`;
          let value = combined.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, combined);
          continue;
        } catch (error) {
          console.error('Error rolling faction secret:', error);
          replacements.set(ref.index, `[error]`);
          continue;
        }
      }

      // Special handling for wound-damage-type
      if (tableName === '__WOUND_DAMAGE_TYPE__') {
        let storedDamageType = resolvedValues.get('__wound_damage_type__');

        const injuryTypes = ['Strain', 'Lingering Trauma', 'Debilitating Injury', 'Lasting Scar'];

        // Check if storedDamageType is actually an injury type (has spaces or matches injury type names)
        if (storedDamageType && (storedDamageType.includes(' ') || injuryTypes.includes(storedDamageType))) {
          // This is an injury type, not a damage type - clear it and roll a new one
          console.warn(
            `Invalid damage type detected (looks like injury type): ${storedDamageType}. Rolling new damage type.`,
          );
          storedDamageType = undefined;
          resolvedValues.delete('__wound_damage_type__');
        }

        if (!storedDamageType) {
          try {
            const damageResult = store.random('wound-damage');
            let damageType = damageResult.result;
            const damageMatch = damageType.match(/^([^(]+)/);
            if (damageMatch) {
              damageType = damageMatch[1].trim();
            }
            resolvedValues.set('__wound_damage_type__', damageType);
            storedDamageType = damageType;
          } catch (error) {
            console.error('Error rolling wound damage type:', error);
            replacements.set(ref.index, `[error]`);
            continue;
          }
        }
        let value = storedDamageType.toLowerCase();
        value = `[${value}]`;
        replacements.set(ref.index, value);
        resolvedValues.set(ref.ref, storedDamageType);
        continue;
      }

      // Special handling for wound-injury-type
      if (tableName === '__WOUND_INJURY_TYPE__') {
        let storedInjuryType = resolvedValues.get('__wound_injury_type__');
        if (!storedInjuryType) {
          try {
            const severityRoll = Math.floor(Math.random() * 4) + 1;
            const severityLevels = ['strain', 'lingering-trauma', 'debilitating-injury', 'lasting-scar'];
            const severity = severityLevels[severityRoll - 1];
            const injuryTypeDisplay = severity
              .split('-')
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
            resolvedValues.set('__wound_injury_type__', injuryTypeDisplay);
            storedInjuryType = injuryTypeDisplay;
          } catch (error) {
            console.error('Error rolling wound injury type:', error);
            replacements.set(ref.index, `[error]`);
            continue;
          }
        }
        let value = storedInjuryType.toLowerCase();
        value = `[${value}]`;
        replacements.set(ref.index, value);
        resolvedValues.set(ref.ref, storedInjuryType);
        continue;
      }

      // Check if this is creature-type and we have a pre-selected type (for generateSentenceWithTags)
      if (ref.ref === 'creature-type' && resolvedValues.has('creature-type')) {
        const preSelectedType = resolvedValues.get('creature-type')!;
        let value = preSelectedType.toLowerCase();
        value = `[${value}]`;
        replacements.set(ref.index, value);
        // Already stored in resolvedValues, so continue
        continue;
      }

      // Check if this is item-type and we have a pre-selected type (for generateSentenceWithTags)
      if (ref.ref === 'item-type' && resolvedValues.has('item-type')) {
        const preSelectedType = resolvedValues.get('item-type')!;
        let value = preSelectedType.toLowerCase();
        value = `[${value}]`;
        replacements.set(ref.index, value);
        // Store for dependent tables
        resolvedValues.set(ref.ref, preSelectedType);
        continue;
      }

      // Special handling for {type} in character/NPC context
      // Check if this is a character sentence (template contains "**Name**" or npcOption is set)
      const isCharacterSentence = template.includes('**Name**') || npcOption !== undefined;

      // Check if this is a type reference that should randomly pick class/profession/criminal
      // This happens when:
      // 1. tableName is __TYPE_FOR_CHARACTER__ (from resolveTableReference) - check case-insensitive
      // 2. ref.ref is just 'type' and we're in a character sentence
      // 3. ref.ref contains '-type-[option]' (meaning [option] wasn't replaced) and we're in a character sentence
      // 4. tableName indicates table not found but ref contains type-[option]
      const isTypeForCharacter =
        tableName === '__TYPE_FOR_CHARACTER__' ||
        tableName.toLowerCase() === '__type_for_character__' ||
        (ref.ref === 'type' && isCharacterSentence) ||
        (ref.ref.includes('type-[option]') && isCharacterSentence) ||
        (tableName.startsWith('[Table not found:') && ref.ref.match(/-type-\[option\]$/));

      if (isTypeForCharacter) {
        try {
          // Randomly choose between class, profession, or criminal
          const typeOptions = ['class', 'profession', 'criminal'];
          const randomOption = typeOptions[Math.floor(Math.random() * typeOptions.length)];
          const typeTableName = `${themeLower}-type-${randomOption}`;

          // Try theme-specific table first
          let tableToUse: string | null = null;
          if (store.hasTable(typeTableName)) {
            tableToUse = typeTableName;
          } else {
            // Fallback to fantasy tables
            const fantasyTypeTableName = `fantasy-type-${randomOption}`;
            if (store.hasTable(fantasyTypeTableName)) {
              tableToUse = fantasyTypeTableName;
            }
          }

          if (tableToUse) {
            const tableResult = store.random(tableToUse);
            let value = tableResult.result.toLowerCase();
            value = `[${value}]`;
            replacements.set(ref.index, value);
            resolvedValues.set(ref.ref, tableResult.result);
            continue;
          } else {
            // No table found, generate error tag
            replacements.set(ref.index, `[error]`);
            continue;
          }
        } catch (error) {
          console.error('Error rolling type table for character:', error);
          replacements.set(ref.index, `[error]`);
          continue;
        }
      }

      // Check if tableName indicates a table was not found and if ref.ref is a valid tag type
      if (tableName.startsWith('[Table not found:') || tableName.startsWith('[Dependent table not found:')) {
        // Extract the original reference from the error message
        const originalRef = ref.ref.toLowerCase();

        // List of valid tag types
        const validTagTypes = [
          'umbrella',
          'special',
          'species',
          'type',
          'aged',
          'skill',
          'ability',
          'attack',
          'condition',
          'reputation',
          'background',
          'experience',
          'language',
          'goal',
          'secret',
          'location',
          'spell',
          'item',
          'use',
          'flaw',
          'weakness',
          'damage',
          'wound',
          'scene',
          'trait',
          'strong',
          'descriptor',
          'drive',
        ];

        // If the reference is a valid tag type, generate a tag with that type
        if (validTagTypes.includes(originalRef)) {
          // Special handling for 'type' in character context
          const isCharacterSentence = template.includes('**Name**') || npcOption !== undefined;
          if (originalRef === 'type' && isCharacterSentence) {
            try {
              const typeOptions = ['class', 'profession', 'criminal'];
              const randomOption = typeOptions[Math.floor(Math.random() * typeOptions.length)];
              const typeTableName = `${themeLower}-type-${randomOption}`;

              let tableToUse: string | null = null;
              if (store.hasTable(typeTableName)) {
                tableToUse = typeTableName;
              } else {
                const fantasyTypeTableName = `fantasy-type-${randomOption}`;
                if (store.hasTable(fantasyTypeTableName)) {
                  tableToUse = fantasyTypeTableName;
                }
              }

              if (tableToUse) {
                const tableResult = store.random(tableToUse);
                let value = tableResult.result.toLowerCase();
                value = `[${value}]`;
                replacements.set(ref.index, value);
                resolvedValues.set(ref.ref, tableResult.result);
                continue;
              }
            } catch (error) {
              console.error('Error rolling type table for character:', error);
            }
          }

          // Try to find a related table (e.g., fantasy-type, modern-type, etc.)
          let fallbackTable: string | null = null;
          const themeTypeTable = `${themeLower}-${originalRef}`;
          if (store.hasTable(themeTypeTable)) {
            fallbackTable = themeTypeTable;
          } else if (store.hasTable(originalRef)) {
            fallbackTable = originalRef;
          }

          if (fallbackTable) {
            // Roll on the fallback table and use the result as the tag value
            const tableResult = store.random(fallbackTable);
            let value = tableResult.result.toLowerCase();
            value = `[${value}]`;
            replacements.set(ref.index, value);
            resolvedValues.set(ref.ref, tableResult.result);
            continue;
          } else {
            // No table found, but it's a valid tag type - use the type name as the value
            let value = `[${originalRef}]`;
            replacements.set(ref.index, value);
            resolvedValues.set(ref.ref, originalRef);
            continue;
          }
        }
      }

      let tableResult = store.random(tableName);
      let value = tableResult.result;

      // Handle recursive references
      if (value.includes(`[Recursive table call detected: ${tableName}]`)) {
        tableResult = store.random(tableName);
        value = tableResult.result;
        if (value.includes(`[Recursive table call detected: ${tableName}]`)) {
          value = 'type';
        }
      }

      if (value.includes(`{${tableName}}`)) {
        tableResult = store.random(tableName);
        value = tableResult.result;
        if (value.includes(`{${tableName}}`)) {
          value = value.replace(`{${tableName}}`, '').trim();
          if (!value) {
            value = 'type';
          }
        }
      }

      const isCreatureName = ref.ref === 'creature-name-prefix' || ref.ref.startsWith('creature-name-');
      const isFactionName =
        ref.ref === 'faction-name-pattern' ||
        ref.ref.endsWith('-faction-name-pattern') ||
        ref.ref.startsWith('faction-name-') ||
        ref.ref.includes('-faction-name-');

      if (isCreatureName || isFactionName) {
        // Keep as is (already includes ** markers)
      } else {
        value = value.toLowerCase();
        value = `[${value}]`;
      }

      replacements.set(ref.index, value);

      // Store resolved value for dependent tables
      const valueForLookup = isCreatureName || isFactionName ? tableResult.result : tableResult.result.toLowerCase();
      resolvedValues.set(ref.ref, valueForLookup);

      // Extract key parts for flexible lookup
      const keyParts = ref.ref.split('-');
      if (keyParts.length >= 2) {
        resolvedValues.set(keyParts[keyParts.length - 1], valueForLookup);
        resolvedValues.set(ref.ref, valueForLookup);
      } else {
        resolvedValues.set(ref.ref, valueForLookup);
      }
    } catch (error) {
      console.error(`Error rolling table ${tableName}:`, error);
      replacements.set(ref.index, `[error]`);
    }
  }

  // Second pass: resolve dependent tables
  for (const ref of dependentRefs) {
    // CRITICAL: Check for type-[option] FIRST, before any other dependent table processing
    // This handles cases like fantasy-type-[option] when npcOption is not set
    // Check if ref ends with -type-[option] pattern (e.g., fantasy-type-[option])
    const hasTypeOptionPattern =
      ref.ref.includes('type') && ref.ref.includes('[option]') && ref.ref.endsWith('[option]');
    const isCharacterSentence = template.includes('**Name**');
    const npcOptionNotSet = !npcOption || npcOption === '';

    if (hasTypeOptionPattern && isCharacterSentence && npcOptionNotSet) {
      try {
        // Randomly choose between class, profession, or criminal
        const typeOptions = ['class', 'profession', 'criminal'];
        const randomOption = typeOptions[Math.floor(Math.random() * typeOptions.length)];
        const typeTableName = `${themeLower}-type-${randomOption}`;

        // Try theme-specific table first
        let tableToUse: string | null = null;
        if (store.hasTable(typeTableName)) {
          tableToUse = typeTableName;
        } else {
          // Fallback to fantasy tables
          const fantasyTypeTableName = `fantasy-type-${randomOption}`;
          if (store.hasTable(fantasyTypeTableName)) {
            tableToUse = fantasyTypeTableName;
          }
        }

        if (tableToUse) {
          const tableResult = store.random(tableToUse);
          let value = tableResult.result.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, tableResult.result);
          continue;
        } else {
          console.error(`No table found for type option: ${randomOption}`);
          // No table found, generate error tag
          replacements.set(ref.index, `[error]`);
          continue;
        }
      } catch (error) {
        console.error('Error rolling type table for character (dependent refs):', error);
        replacements.set(ref.index, `[error]`);
        continue;
      }
    }

    // Special handling for creature-attack-choice-[damage-type]
    // Simplified: now only based on damage type, not creature type
    if (ref.ref.startsWith('creature-attack-choice-')) {
      try {
        // Extract damage-type from resolved values
        let damageType = resolvedValues.get('damage-type') || resolvedValues.get('damage');

        if (!damageType) {
          // Resolve damage-type
          const damageTypeResult = store.random('damage-type');
          damageType = damageTypeResult.result;
          resolvedValues.set('damage-type', damageType);
          resolvedValues.set('damage', damageType);
        }

        // Extract base damage type (before parentheses) for normalization
        let normalizedDamageType = damageType;
        const damageMatch = damageType.match(/^([^(]+)/);
        if (damageMatch) {
          normalizedDamageType = damageMatch[1].trim().toLowerCase();
        } else {
          normalizedDamageType = damageType.toLowerCase().split(' ')[0];
        }

        // Build simplified table name (damage type only)
        const attackChoiceTableName = `creature-attack-choice-${normalizedDamageType}`;

        const tableResult = store.random(attackChoiceTableName);
        let value = tableResult.result.toLowerCase();
        value = `[${value}]`;
        replacements.set(ref.index, value);
        continue;
      } catch (error) {
        console.error(`Error rolling creature-attack-choice:`, error);
        replacements.set(ref.index, `[error]`);
        continue;
      }
    }

    // Special handling for creature-special-ability-[creature-type]
    if (ref.ref.startsWith('creature-special-ability-')) {
      try {
        // Try multiple possible keys for creature-type
        let creatureType = resolvedValues.get('creature-type') || resolvedValues.get('type');
        if (!creatureType) {
          const creatureTypeResult = store.random('creature-type');
          creatureType = creatureTypeResult.result;
          resolvedValues.set('creature-type', creatureType);
          resolvedValues.set('type', creatureType);
        }

        const normalizedCreatureType = creatureType.toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
        const specialAbilityTableName = `creature-special-ability-${normalizedCreatureType}`;

        const tableResult = store.random(specialAbilityTableName);
        let value = tableResult.result;

        // Safety check: ensure we're not using the creature type value
        if (value.toLowerCase() === creatureType.toLowerCase() || value.toLowerCase() === normalizedCreatureType) {
          console.error(`Table ${specialAbilityTableName} returned creature type value instead of table result!`);
          replacements.set(ref.index, `[error]`);
          continue;
        }

        value = value.toLowerCase();
        // Don't lowercase if it's placeholder text (contains brackets)
        if (value.includes('[') && value.includes(']')) {
          value = tableResult.result; // Keep original case for placeholders
        }
        value = `[${value}]`;
        replacements.set(ref.index, value);
        continue;
      } catch (error) {
        console.error(`Error rolling creature-special-ability:`, error);
        replacements.set(ref.index, `[error]`);
        continue;
      }
    }

    // Special handling for creature-strength-[creature-type]
    if (ref.ref.startsWith('creature-strength-')) {
      try {
        // Try multiple possible keys for creature-type
        let creatureType = resolvedValues.get('creature-type') || resolvedValues.get('type');
        if (!creatureType) {
          const creatureTypeResult = store.random('creature-type');
          creatureType = creatureTypeResult.result;
          resolvedValues.set('creature-type', creatureType);
          resolvedValues.set('type', creatureType);
        }

        const normalizedCreatureType = creatureType.toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
        const strengthTableName = `creature-strength-${normalizedCreatureType}`;

        const tableResult = store.random(strengthTableName);
        let value = tableResult.result;

        // Safety check: ensure we're not using the creature type value
        if (value.toLowerCase() === creatureType.toLowerCase() || value.toLowerCase() === normalizedCreatureType) {
          console.error(`Table ${strengthTableName} returned creature type value instead of table result!`);
          replacements.set(ref.index, `[error]`);
          continue;
        }

        value = value.toLowerCase();
        // Don't lowercase if it's placeholder text (contains brackets)
        if (value.includes('[') && value.includes(']')) {
          value = tableResult.result; // Keep original case for placeholders
        }
        value = `[${value}]`;
        replacements.set(ref.index, value);
        continue;
      } catch (error) {
        console.error(`Error rolling creature-strength:`, error);
        replacements.set(ref.index, `[error]`);
        continue;
      }
    }

    // Special handling for creature-weakness-[creature-type]
    if (ref.ref.startsWith('creature-weakness-')) {
      try {
        // Try multiple possible keys for creature-type
        let creatureType = resolvedValues.get('creature-type') || resolvedValues.get('type');
        if (!creatureType) {
          const creatureTypeResult = store.random('creature-type');
          creatureType = creatureTypeResult.result;
          resolvedValues.set('creature-type', creatureType);
          resolvedValues.set('type', creatureType);
        }

        const normalizedCreatureType = creatureType.toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
        const weaknessTableName = `creature-weakness-${normalizedCreatureType}`;

        const tableResult = store.random(weaknessTableName);
        let value = tableResult.result;

        // Safety check: ensure we're not using the creature type value
        if (value.toLowerCase() === creatureType.toLowerCase() || value.toLowerCase() === normalizedCreatureType) {
          console.error(`Table ${weaknessTableName} returned creature type value instead of table result!`);
          replacements.set(ref.index, `[error]`);
          continue;
        }

        value = value.toLowerCase();
        // Don't lowercase if it's placeholder text (contains brackets)
        if (value.includes('[') && value.includes(']')) {
          value = tableResult.result; // Keep original case for placeholders
        }
        value = `[${value}]`;
        replacements.set(ref.index, value);
        continue;
      } catch (error) {
        console.error(`Error rolling creature-weakness:`, error);
        replacements.set(ref.index, `[error]`);
        continue;
      }
    }

    // Special handling for creature-name-[creature-type]
    if (ref.ref.startsWith('creature-name-') && ref.ref.includes('[')) {
      try {
        let creatureType = resolvedValues.get('creature-type') || resolvedValues.get('type');
        if (!creatureType) {
          const creatureTypeResult = store.random('creature-type');
          creatureType = creatureTypeResult.result;
          resolvedValues.set('creature-type', creatureType);
          resolvedValues.set('type', creatureType);
        }

        const normalizedCreatureType = creatureType.toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
        const creatureNameTableName = `creature-name-${normalizedCreatureType}`;

        // Check if the specific creature-name table exists
        if (store.hasTable(creatureNameTableName)) {
          const tableResult = store.random(creatureNameTableName);
          let value = tableResult.result;
          // Creature names should be bold, not bracketed
          replacements.set(ref.index, value);
          continue;
        } else {
          // Fallback: if the specific table doesn't exist, use just the prefix
          // This handles cases like "Humanoid" or "Chimera" which don't have name tables
          if (store.hasTable('creature-name-prefix')) {
            const tableResult = store.random('creature-name-prefix');
            let value = tableResult.result;
            replacements.set(ref.index, value);
            continue;
          } else {
            // Last resort: use the creature type as the name
            replacements.set(ref.index, creatureType);
            continue;
          }
        }
      } catch (error) {
        console.error(`Error rolling creature-name:`, error);
        // Fallback to prefix if available
        try {
          if (store.hasTable('creature-name-prefix')) {
            const tableResult = store.random('creature-name-prefix');
            replacements.set(ref.index, tableResult.result);
            continue;
          }
        } catch {
          // Ignore fallback error
        }
        replacements.set(ref.index, `[error]`);
        continue;
      }
    }

    // Skip resolveTableReference for special creature refs that we handle above
    // These should have been handled in the special cases above, but if they weren't, skip them here
    if (
      ref.ref.startsWith('creature-attack-choice-') ||
      ref.ref.startsWith('creature-special-ability-') ||
      ref.ref.startsWith('creature-strength-') ||
      ref.ref.startsWith('creature-weakness-')
    ) {
      // Should have been handled above, but if we reach here, it means there was an error
      // Don't try to resolve it with resolveTableReference as it will fail
      console.warn(`Special creature ref not handled: ${ref.ref}`);
      replacements.set(ref.index, `[error]`);
      continue;
    }

    const tableName = resolveTableReference(ref.ref, theme, locationType, npcOption, resolvedValues, useFantasySpecies);

    // Check for __TYPE_FOR_CHARACTER__ BEFORE error checking
    // Reuse isCharacterSentence and npcOptionNotSet from the loop scope above
    if (
      tableName === '__TYPE_FOR_CHARACTER__' ||
      tableName.toLowerCase() === '__type_for_character__' ||
      (ref.ref.match(/-type-\[option\]$/) && isCharacterSentence && npcOptionNotSet)
    ) {
      try {
        // Randomly choose between class, profession, or criminal
        const typeOptions = ['class', 'profession', 'criminal'];
        const randomOption = typeOptions[Math.floor(Math.random() * typeOptions.length)];
        const typeTableName = `${themeLower}-type-${randomOption}`;

        // Try theme-specific table first
        let tableToUse: string | null = null;
        if (store.hasTable(typeTableName)) {
          tableToUse = typeTableName;
        } else {
          // Fallback to fantasy tables
          const fantasyTypeTableName = `fantasy-type-${randomOption}`;
          if (store.hasTable(fantasyTypeTableName)) {
            tableToUse = fantasyTypeTableName;
          }
        }

        if (tableToUse) {
          const tableResult = store.random(tableToUse);
          let value = tableResult.result.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, tableResult.result);
          continue;
        } else {
          // No table found, generate error tag
          replacements.set(ref.index, `[error]`);
          continue;
        }
      } catch (error) {
        console.error('Error rolling type table for character (dependent refs fallback):', error);
        replacements.set(ref.index, `[error]`);
        continue;
      }
    }

    // Skip if resolveTableReference returned a special creature ref marker
    if (tableName.startsWith('[Special creature ref:') || tableName.startsWith('[Dependent table not found:')) {
      // Special case: if this is a type-[option] reference in a character sentence, handle it
      // Reuse isCharacterSentence and npcOptionNotSet from the loop scope above
      if (ref.ref.includes('type-[option]') && isCharacterSentence && npcOptionNotSet) {
        // This should have been caught earlier, but handle it here as fallback
        try {
          const typeOptions = ['class', 'profession', 'criminal'];
          const randomOption = typeOptions[Math.floor(Math.random() * typeOptions.length)];
          const typeTableName = `${themeLower}-type-${randomOption}`;

          let tableToUse: string | null = null;
          if (store.hasTable(typeTableName)) {
            tableToUse = typeTableName;
          } else {
            const fantasyTypeTableName = `fantasy-type-${randomOption}`;
            if (store.hasTable(fantasyTypeTableName)) {
              tableToUse = fantasyTypeTableName;
            }
          }

          if (tableToUse) {
            const tableResult = store.random(tableToUse);
            let value = tableResult.result.toLowerCase();
            value = `[${value}]`;
            replacements.set(ref.index, value);
            resolvedValues.set(ref.ref, tableResult.result);
            continue;
          }
        } catch (error) {
          console.error('Error rolling type table for character (fallback):', error);
        }
      }

      console.warn(`Cannot resolve table reference: ${ref.ref} -> ${tableName}`);
      replacements.set(ref.index, `[error]`);
      continue;
    }

    try {
      // Final safety check: if tableName is __TYPE_FOR_CHARACTER__ (case-insensitive), handle it
      // Also check if ref.ref matches the pattern (in case resolveTableReference didn't catch it)
      // Reuse isCharacterSentence and npcOptionNotSet from above scope
      const isTypeForCharacter =
        tableName === '__TYPE_FOR_CHARACTER__' ||
        tableName.toLowerCase() === '__type_for_character__' ||
        tableName.includes('__type_for_character__') ||
        (ref.ref.endsWith('-type-[option]') && isCharacterSentence && npcOptionNotSet);

      if (isTypeForCharacter && isCharacterSentence && npcOptionNotSet) {
        // Randomly choose between class, profession, or criminal
        const typeOptions = ['class', 'profession', 'criminal'];
        const randomOption = typeOptions[Math.floor(Math.random() * typeOptions.length)];
        const typeTableName = `${themeLower}-type-${randomOption}`;

        let tableToUse: string | null = null;
        if (store.hasTable(typeTableName)) {
          tableToUse = typeTableName;
        } else {
          const fantasyTypeTableName = `fantasy-type-${randomOption}`;
          if (store.hasTable(fantasyTypeTableName)) {
            tableToUse = fantasyTypeTableName;
          }
        }

        if (tableToUse) {
          const tableResult = store.random(tableToUse);
          let value = tableResult.result.toLowerCase();
          value = `[${value}]`;
          replacements.set(ref.index, value);
          resolvedValues.set(ref.ref, tableResult.result);
          continue;
        } else {
          replacements.set(ref.index, `[error]`);
          continue;
        }
      }

      // Don't try to roll on __TYPE_FOR_CHARACTER__ as a table name
      // Also check if tableName contains the error message format
      if (
        tableName === '__TYPE_FOR_CHARACTER__' ||
        tableName.toLowerCase() === '__type_for_character__' ||
        tableName.includes('__type_for_character__') ||
        tableName.includes('[table not found: __type_for_character__]') ||
        tableName.includes('[Table not found: __TYPE_FOR_CHARACTER__]')
      ) {
        // This should have been handled above, but if we reach here, try to handle it
        if (isCharacterSentence && npcOptionNotSet) {
          const typeOptions = ['class', 'profession', 'criminal'];
          const randomOption = typeOptions[Math.floor(Math.random() * typeOptions.length)];
          const typeTableName = `${themeLower}-type-${randomOption}`;

          let tableToUse: string | null = null;
          if (store.hasTable(typeTableName)) {
            tableToUse = typeTableName;
          } else {
            const fantasyTypeTableName = `fantasy-type-${randomOption}`;
            if (store.hasTable(fantasyTypeTableName)) {
              tableToUse = fantasyTypeTableName;
            }
          }

          if (tableToUse) {
            const tableResult = store.random(tableToUse);
            let value = tableResult.result.toLowerCase();
            value = `[${value}]`;
            replacements.set(ref.index, value);
            resolvedValues.set(ref.ref, tableResult.result);
            continue;
          }
        }
        // If we can't handle it, generate error
        replacements.set(ref.index, `[error]`);
        continue;
      }

      const tableResult = store.random(tableName);
      let value = tableResult.result;

      // Check if the result is an error message about __type_for_character__
      // This happens when __TYPE_FOR_CHARACTER__ was used as a table name
      // Reuse isCharacterSentence and npcOptionNotSet from the loop scope above
      if (value.includes('__type_for_character__') || value.includes('__TYPE_FOR_CHARACTER__')) {
        // This is a character sentence and we need to randomly pick type
        if (isCharacterSentence && npcOptionNotSet) {
          const typeOptions = ['class', 'profession', 'criminal'];
          const randomOption = typeOptions[Math.floor(Math.random() * typeOptions.length)];
          const typeTableName = `${themeLower}-type-${randomOption}`;

          let tableToUse: string | null = null;
          if (store.hasTable(typeTableName)) {
            tableToUse = typeTableName;
          } else {
            const fantasyTypeTableName = `fantasy-type-${randomOption}`;
            if (store.hasTable(fantasyTypeTableName)) {
              tableToUse = fantasyTypeTableName;
            }
          }

          if (tableToUse) {
            const newTableResult = store.random(tableToUse);
            value = newTableResult.result.toLowerCase();
            value = `[${value}]`;
            replacements.set(ref.index, value);
            resolvedValues.set(ref.ref, newTableResult.result);
            continue;
          }
        }
        // If we can't handle it, generate error
        replacements.set(ref.index, `[error]`);
        continue;
      }

      const isCreatureName = ref.ref.startsWith('creature-name-');
      const isFactionName = ref.ref.startsWith('faction-name-');

      if (isCreatureName || isFactionName) {
        // Keep as is
      } else {
        value = value.toLowerCase();
        value = `[${value}]`;
      }

      replacements.set(ref.index, value);
    } catch (error) {
      console.error(`Error rolling dependent table ${tableName}:`, error);
      replacements.set(ref.index, `[error]`);
    }
  }

  // Build final result string
  const allRefs = [...independentRefs, ...dependentRefs].sort((a, b) => a.index - b.index);

  for (let i = 0; i < allRefs.length; i++) {
    const ref = allRefs[i];

    // Add text before this reference
    result += template.substring(currentIndex, ref.index);

    // Add replacement value
    const replacement = replacements.get(ref.index) || ref.match;
    result += replacement;

    // Update current index
    currentIndex = ref.index + ref.match.length;
  }

  // Add remaining text after last reference
  result += template.substring(currentIndex);

  // Capitalize first letter of sentence
  result = result.replace(/^([a-z])/, (match) => match.toUpperCase());
  // Also capitalize after sentence-ending punctuation
  result = result.replace(/([.!?]\s+)([a-z])/g, (match, punc, letter) => punc + letter.toUpperCase());

  // Return plain text (not HTML) - preserve markdown formatting like **bold**
  return result;
}
