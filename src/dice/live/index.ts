import { syntaxTree } from "@codemirror/language";
import {
    RangeSetBuilder,
    EditorSelection,
    SelectionRange,
} from "@codemirror/state";
import {
    Decoration,
    DecorationSet,
    ViewUpdate,
    PluginValue,
    PluginSpec,
    EditorView,
    ViewPlugin,
} from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";
import { DiceWidget } from "./dice";
import { DICE_REGEX } from "../dice";
import { ROLL_REGEX } from "../roll";
import { DiceRoll } from "@dice-roller/rpg-dice-roller";
import Plugin from "../../main";

// Track which roll blocks have been replaced to prevent multiple replacements
const replacedRollBlocks = new Set<string>();

// Live preview mode inline elements for dice and roll
class DiceRollPlugin implements PluginValue {
    decorations: DecorationSet;

    constructor(view: EditorView) {
        this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
        const isLivePreview = update.state.field(editorLivePreviewField);
        const shouldDisable = !isLivePreview;
        const shouldUpdate =
            update.docChanged || update.viewportChanged || update.selectionSet;

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
                    if (!node.type.name.startsWith("inline-code")) return;

                    const from = node.from - 1;
                    const to = node.to + 1;

                    if (this.isRangeSelected(from, to, selection)) {
                        return;
                    }

                    const text = view.state.doc.sliceString(from, to).trim();

                    // `roll:1d6` or `roll: 1d6`
                    // Handle roll blocks FIRST - replace immediately without creating a widget
                    // Following the pattern from dice-roller plugin's dice-mod handling
                    if (ROLL_REGEX.test(text)) {
                        // Extract the formula from the match
                        const match = text.match(ROLL_REGEX);
                        if (match) {
                            const formula = match[1].trim();
                            try {
                                const roll = new DiceRoll(formula);
                                const result = roll.output;
                                
                                // Replace the code block with the result
                                // Use setTimeout to ensure it happens after decoration building
                                setTimeout(() => {
                                    try {
                                        const mod = {
                                            from: from,
                                            to: to,
                                            insert: result,
                                        };
                                        const transaction = view.state.update({ changes: mod });
                                        view.dispatch(transaction);
                                    } catch (error) {
                                        console.error("Error replacing roll in editor:", error);
                                    }
                                }, 0);
                                
                                // Return early - don't create a widget decoration
                                return;
                            } catch (error) {
                                console.error("Error rolling dice:", error);
                            }
                        }
                        // Return early even if match fails
                        return;
                    }

                    // `dice:1d6` or `dice: 1d6`
                    // Only create widget for dice blocks (not roll blocks)
                    if (DICE_REGEX.test(text)) {
                        builder.add(
                            from,
                            to,
                            Decoration.replace({
                                widget: new DiceWidget({
                                    originalNode: node.node,
                                    originalText: text,
                                }),
                            })
                        );
                    }
                },
            });
        }

        this.decorations = builder.finish();
    }

    isRangeSelected(
        from: number,
        to: number,
        selection: EditorSelection
    ): boolean {
        return !!selection.ranges.find(
            (range: SelectionRange) => range.from <= to && range.to >= from
        );
    }
}

const pluginSpec: PluginSpec<DiceRollPlugin> = {
    decorations: (value: DiceRollPlugin) => value.decorations,
};

export const diceRollExtension = (plugin: Plugin) => {
    return ViewPlugin.fromClass(DiceRollPlugin, pluginSpec);
};
