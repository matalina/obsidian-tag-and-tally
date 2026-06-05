import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, EditorSelection, SelectionRange } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  ViewUpdate,
  PluginValue,
  PluginSpec,
  EditorView,
  ViewPlugin,
} from '@codemirror/view';
import { editorLivePreviewField } from 'obsidian';
import { SENTENCE_REGEX } from '../sentence';
import { SENTENCE_TEMPLATES, escapeMarkdownOpeningBrackets, generateSentenceWithTags } from '../utils';
import { generateSentenceByType } from '../generator';
import { generateSpellSentence } from '../spell';
import Plugin from '../../main';

// Track which sentence blocks have been replaced to prevent multiple replacements
const replacedSentenceBlocks = new Set<string>();

function generateSentence(sentenceType: string, theme?: string): string {
  const sentenceTheme = theme || 'fantasy';
  // Hyphenated types (e.g. blood-magic-trauma) → space-separated capitalized words
  // to match SENTENCE_TEMPLATES keys (e.g. "Blood Magic Trauma").
  let normalizedType: string;
  if (sentenceType.includes('-')) {
    normalizedType = sentenceType
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  } else {
    normalizedType = sentenceType.charAt(0).toUpperCase() + sentenceType.slice(1).toLowerCase();
  }
  if (normalizedType === 'Npc') normalizedType = 'NPC';
  if (normalizedType === 'Wound') normalizedType = 'Wounds';

  let result: string;
  if (normalizedType === 'Spell') {
    result = generateSpellSentence();
  } else {
    try {
      const generated = generateSentenceByType(normalizedType, { theme: sentenceTheme });
      if (generated) {
        result = generated;
      } else {
        result = generateSentenceWithTags(SENTENCE_TEMPLATES['Scene'], sentenceTheme);
      }
    } catch (error) {
      console.error(`Error generating ${normalizedType} sentence:`, error);
      result = `[Error generating ${normalizedType} sentence]`;
    }
  }

  return escapeMarkdownOpeningBrackets(result);
}

// Live preview mode inline elements for sentences
class SentencePlugin implements PluginValue {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    const isLivePreview = update.state.field(editorLivePreviewField);
    const shouldDisable = !isLivePreview;
    const shouldUpdate = update.docChanged || update.viewportChanged || update.selectionSet;

    if (shouldDisable) {
      this.decorations = Decoration.none;
    } else if (shouldUpdate) {
      this.buildDecorations(update.view);
    }
  }

  destroy() {}

  buildDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    const selection = view.state.selection;

    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from,
        to,
        enter: (node) => {
          // Handle inline-code in different contexts (lists, blockquotes, etc.)
          if (!node.type.name.startsWith('inline-code')) return;

          const from = node.from - 1;
          const to = node.to + 1;

          if (this.isRangeSelected(from, to, selection)) {
            return;
          }

          const text = view.state.doc.sliceString(from, to).trim();

          // Handle sentence blocks FIRST - replace immediately without creating a widget
          // Following the pattern from roll and pick
          if (SENTENCE_REGEX.test(text)) {
            const nodeKey = `${node.from}-${node.to}`;

            // Skip if already replaced
            if (replacedSentenceBlocks.has(nodeKey)) {
              return;
            }

            // Extract the sentence type and optional theme from the match
            const match = text.match(SENTENCE_REGEX);
            if (match) {
              const sentenceType = match[1].trim();
              const theme = match[2]?.trim();

              try {
                const result = generateSentence(sentenceType, theme);

                // Mark as replaced immediately
                replacedSentenceBlocks.add(nodeKey);

                // Replace the code block with the result
                // Use setTimeout to ensure it happens after decoration building
                window.setTimeout(() => {
                  try {
                    const mod = {
                      from: from,
                      to: to,
                      insert: result,
                    };
                    const transaction = view.state.update({ changes: mod });
                    view.dispatch(transaction);
                  } catch (error) {
                    // If replacement fails, remove from set so it can be retried
                    replacedSentenceBlocks.delete(nodeKey);
                    console.error('Error replacing sentence in editor:', error);
                  }
                }, 0);

                // Return early - don't create a widget decoration
                return;
              } catch (error) {
                console.error('Error generating sentence:', error);
              }
            }
            // Return early even if match fails
            return;
          }
        },
      });
    }

    this.decorations = builder.finish();
  }

  isRangeSelected(from: number, to: number, selection: EditorSelection): boolean {
    return !!selection.ranges.find((range: SelectionRange) => range.from <= to && range.to >= from);
  }
}

const pluginSpec: PluginSpec<SentencePlugin> = {
  decorations: (value: SentencePlugin) => value.decorations,
};

export const sentenceExtension = (plugin: Plugin) => {
  return ViewPlugin.fromClass(SentencePlugin, pluginSpec);
};
