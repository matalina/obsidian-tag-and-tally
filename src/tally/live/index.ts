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
import { TrackWidget } from "./track";
import { ClockWidget } from "./clock";
import { TRACK_REGEX } from "../track";
import { CLOCK_REGEX } from "../clocks";
import Plugin from "../../main";

// Live preview mode inline elements
class TallyPlugin implements PluginValue {
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

                    // `boxes:1/5` or `circles:1/5`
                    if (TRACK_REGEX.test(text)) {
                        builder.add(
                            from,
                            to,
                            Decoration.replace({
                                widget: new TrackWidget({
                                    originalNode: node.node,
                                    originalText: text,
                                }),
                            })
                        );
                    }

                    // `clocks:1/5` or `clock:1/5`
                    if (CLOCK_REGEX.test(text)) {
                        builder.add(
                            from,
                            to,
                            Decoration.replace({
                                widget: new ClockWidget({
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

const pluginSpec: PluginSpec<TallyPlugin> = {
    decorations: (value: TallyPlugin) => value.decorations,
};

export const tallyExtension = (plugin: Plugin) => {
    return ViewPlugin.fromClass(TallyPlugin, pluginSpec);
};
