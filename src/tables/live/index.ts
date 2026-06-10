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
import { RandomWidget } from './random';
import { RANDOM_REGEX } from '../random';
import { PICK_REGEX } from '../pick';
import { CUSTOM_REGEX } from '../custom';
import { CustomRandomWidget, CUSTOM_RANDOM_REGEX } from '../custom-random';
import { getTableStore } from '../store';
import { RESOLVE_REGEX, executeResolveInner } from '../../resolution/resolve';
import Plugin from '../../main';

// Track which pick blocks have been replaced to prevent multiple replacements
const replacedPickBlocks = new Set<string>();

// Live preview mode inline elements for random and pick tables
class RandomPickPlugin implements PluginValue {
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
          // Handle inline-code in different contexts (lists, blockquotes, headers, etc.)
          // CodeMirror uses different node type names like:
          // - 'inline-code' (plain)
          // - 'inline-code_list-1' (in lists)
          // - 'inline-code_quote_quote-1' (in blockquotes)
          // - 'header_header-2_inline-code' (in headers)
          // Check if the node type contains 'inline-code' anywhere in the name
          // Skip formatting nodes (the backticks themselves) - only process the content node
          if (!node.type.name.includes('inline-code') || node.type.name.includes('formatting')) return;

          const from = node.from - 1;
          const to = node.to + 1;

          if (this.isRangeSelected(from, to, selection)) {
            return;
          }

          const rawText = view.state.doc.sliceString(from, to);
          const text = rawText.trim();
          const nodeKey = `${node.from}-${node.to}`;

          // Skip if already replaced
          if (replacedPickBlocks.has(nodeKey)) {
            return;
          }

          // Skip if text doesn't match any command pattern (already been replaced or not a command)
          const matchesCustom = CUSTOM_REGEX.test(text);
          const matchesPick = PICK_REGEX.test(text);
          const matchesRandom = RANDOM_REGEX.test(text);
          const matchesCustomRandom = CUSTOM_RANDOM_REGEX.test(text);
          const matchesResolve = RESOLVE_REGEX.test(text);

          if (!matchesCustom && !matchesPick && !matchesRandom && !matchesCustomRandom && !matchesResolve) {
            return;
          }

          // `custom {table-name}` - Handle custom blocks FIRST (permanent replacement like pick)
          if (matchesCustom) {
            // Extract all table names from the match
            const match = text.match(CUSTOM_REGEX);
            if (match) {
              // Extract all table references from {table-name} format
              // Multiple tables can be specified: custom {table1} {table2} {table3}
              // All tables are rolled on independently and results are combined (like sentence)
              const tableRefs = match[1].trim();
              const tableRefRegex = /\{([^}]+)\}/g;
              const tableNames: string[] = [];
              let refMatch;

              while ((refMatch = tableRefRegex.exec(tableRefs)) !== null) {
                // Normalize table name: lowercase and replace spaces with dashes
                // This matches how tables are stored (see markdown-parser.ts)
                const tableName = refMatch[1].trim().toLowerCase().replace(/\s+/g, '-');
                tableNames.push(tableName);
              }

              if (tableNames.length > 0) {
                try {
                  const store = getTableStore();
                  // Roll on each table independently and combine results
                  const results: string[] = [];
                  const outputs: string[] = [];

                  for (const tableName of tableNames) {
                    const tableResult = store.random(tableName);
                    results.push(tableResult.result);
                    outputs.push(tableResult.roll.output);
                  }

                  const combinedResult = results.join(' ');
                  const combinedOutput = outputs.filter((o) => o).join(', ');
                  const formatted = `${combinedResult} ← _(${combinedOutput})_`;

                  // Mark as replaced immediately
                  replacedPickBlocks.add(nodeKey);

                  // Replace the code block with the formatted result
                  // Use setTimeout to ensure it happens after decoration building
                  window.setTimeout(() => {
                    try {
                      const mod = {
                        from: from,
                        to: to,
                        insert: formatted,
                      };
                      const transaction = view.state.update({ changes: mod });
                      view.dispatch(transaction);
                    } catch (error) {
                      replacedPickBlocks.delete(nodeKey);
                      console.error('[TagTally] Error replacing custom in editor:', error);
                    }
                  }, 0);

                  return;
                } catch (error) {
                  console.error('[TagTally] Error rolling on custom table:', error);
                }
              }
            }
            return;
          }

          // `resolve:type …` — same inline-code contexts as pick (headers, tables, lists)
          if (matchesResolve) {
            const match = text.match(RESOLVE_REGEX);
            if (match) {
              try {
                replacedPickBlocks.add(nodeKey);
                const inner = match[1].trim();
                window.setTimeout(() => {
                  try {
                    const result = executeResolveInner(inner);
                    const mod = {
                      from,
                      to,
                      insert: result,
                    };
                    const transaction = view.state.update({ changes: mod });
                    view.dispatch(transaction);
                  } catch (error) {
                    replacedPickBlocks.delete(nodeKey);
                    console.error('[TagTally] Error replacing resolve in editor:', error);
                  }
                }, 0);
                return;
              } catch (error) {
                console.error('[TagTally] Error in resolve live preview:', error);
              }
            }
            return;
          }

          // `pick:table-name` or `pick: table-name`
          // Handle pick blocks - replace immediately without creating a widget
          // Following the pattern from dice-roller plugin's dice-mod handling
          if (matchesPick) {
            // Extract the table name from the match
            const match = text.match(PICK_REGEX);
            if (match) {
              const tableName = match[1].trim();
              try {
                const store = getTableStore();
                const tableResult = store.random(tableName);
                const formatted = `${tableResult.result} ← _(${tableResult.roll.output})_`;

                // Mark as replaced immediately
                replacedPickBlocks.add(nodeKey);

                // Replace the code block with the formatted result
                // Use setTimeout to ensure it happens after decoration building
                window.setTimeout(() => {
                  try {
                    const mod = {
                      from: from,
                      to: to,
                      insert: formatted,
                    };
                    const transaction = view.state.update({ changes: mod });
                    view.dispatch(transaction);
                  } catch (error) {
                    // If replacement fails, remove from set so it can be retried
                    replacedPickBlocks.delete(nodeKey);
                    console.error('Error replacing pick in editor:', error);
                  }
                }, 0);

                // Return early - don't create a widget decoration, don't check for random
                return;
              } catch (error) {
                console.error('Error rolling on table:', error);
              }
            }
            // Return early even if match fails
            return;
          }

          // `custom-random:table-name` or `custom-random: table-name`
          // Create interactive widget for custom-random blocks
          if (CUSTOM_RANDOM_REGEX.test(text)) {
            builder.add(
              from,
              to,
              Decoration.replace({
                widget: new CustomRandomWidget({
                  originalNode: node.node,
                  originalText: text,
                }),
              }),
            );
            return;
          }

          // `random:table-name` or `random: table-name`
          // Only create widget for random blocks (not pick blocks)
          if (RANDOM_REGEX.test(text)) {
            builder.add(
              from,
              to,
              Decoration.replace({
                widget: new RandomWidget({
                  originalNode: node.node,
                  originalText: text,
                }),
              }),
            );
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

const pluginSpec: PluginSpec<RandomPickPlugin> = {
  decorations: (value: RandomPickPlugin) => value.decorations,
};

export const randomPickExtension = (plugin: Plugin) => {
  return ViewPlugin.fromClass(RandomPickPlugin, pluginSpec);
};
