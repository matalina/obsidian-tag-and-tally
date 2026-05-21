import { generateNPCAppearance } from '@tag-and-tally/shared-ui';
import { SENTENCE_TEMPLATES, generateSentenceWithTags } from './utils';
import { generateResourceSentenceWithTags } from './resource';
import { generateInsightSentence } from './insight';
import { getTableStore } from '../tables/store';

export interface GenerateSentenceOptions {
  theme: string;
  locationType?: string;
  npcOption?: string;
  useFantasySpecies?: boolean;
  creatureType?: string;
  itemType?: string;
  injuryType?: string;
  damageType?: string;
}

const WOUND_INJURY_TYPES = ['Strain', 'Lingering Trauma', 'Debilitating Injury', 'Lasting Scar'];

/**
 * Single entry point for sentence generation by type.
 * Does not support Spell (handled by Spell Calculator tab / inline sentence:spell).
 * Appearance uses generateNPCAppearance (same as NPC/Character tab appendix).
 */
export function generateSentenceByType(type: string, options: GenerateSentenceOptions): string {
  const {
    theme,
    locationType,
    npcOption,
    useFantasySpecies = false,
    creatureType,
    itemType,
    injuryType,
    damageType: rawDamageType,
  } = options;

  const themeOrFantasy = theme || 'fantasy';

  // NPC, Character, and "NPC/Character" (dropdown) all use NPC/Character template
  const templateKey = type === 'NPC' || type === 'Character' || type === 'NPC/Character' ? 'NPC/Character' : type;

  if (type === 'Resource') {
    return generateResourceSentenceWithTags(themeOrFantasy, locationType);
  }
  if (type === 'Insight') {
    return generateInsightSentence();
  }
  if (type === 'Appearance') {
    return generateNPCAppearance(getTableStore());
  }

  const template = SENTENCE_TEMPLATES[templateKey];
  if (template) {
    // Wounds: sanitize damageType (must not be an injury type)
    let damageType = rawDamageType;
    if (type === 'Wounds' && damageType && (damageType.includes(' ') || WOUND_INJURY_TYPES.includes(damageType))) {
      damageType = undefined;
    }
    return generateSentenceWithTags(
      template,
      themeOrFantasy,
      locationType,
      npcOption,
      useFantasySpecies,
      creatureType,
      itemType,
      injuryType,
      damageType,
    );
  }

  return '';
}
