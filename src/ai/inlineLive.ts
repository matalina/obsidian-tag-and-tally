import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginSpec,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { editorLivePreviewField, TFile } from "obsidian";
import type TextMapperPlugin from "../main";
import {
  AI_REGEX,
  AiCommand,
  buildInflightKey,
  isBacktickInflight,
  kickOffAi,
  spliceMarker,
} from "./inline";

class GeneratingPillWidget extends WidgetType {
  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "tag-tally-ai-pending";
    el.textContent = "AI generating…";
    return el;
  }

  eq(): boolean {
    return true;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class AiInlinePlugin implements PluginValue {
  decorations: DecorationSet = Decoration.none;
  private readonly plugin: TextMapperPlugin;
  /** Tracks (path::pos::text) tuples already kicked off so re-renders don't refire. */
  private readonly fired: Set<string> = new Set();

  constructor(view: EditorView, plugin: TextMapperPlugin) {
    this.plugin = plugin;
    this.scan(view);
  }

  update(update: ViewUpdate): void {
    if (!update.state.field(editorLivePreviewField)) {
      this.decorations = Decoration.none;
      return;
    }
    if (update.docChanged || update.viewportChanged) {
      this.scan(update.view);
    }
  }

  destroy(): void {
    this.fired.clear();
  }

  private scan(view: EditorView): void {
    const file = this.plugin.app.workspace.getActiveFile();
    if (!(file instanceof TFile)) {
      this.decorations = Decoration.none;
      return;
    }
    this.fireDetections(view, file);
    this.decorations = this.buildDecorations(view, file);
  }

  /** Walks visible inline-code nodes and kicks off `ai:` commands not yet in flight. */
  private fireDetections(view: EditorView, file: TFile): void {
    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from,
        to,
        enter: (node) => {
          if (!node.type.name.startsWith("inline-code")) return;
          const fullFrom = node.from - 1;
          const fullTo = node.to + 1;
          if (fullFrom < 0 || fullTo > view.state.doc.length) return;
          const text = view.state.doc.sliceString(fullFrom, fullTo);
          const m = text.match(AI_REGEX);
          if (!m) return;

          const key = buildInflightKey(file.path, fullFrom, text);
          if (this.fired.has(key)) return;
          if (this.plugin.inflightAi.has(key)) return;
          this.fired.add(key);

          const rawCommand = m[1].toLowerCase();
          if (rawCommand !== "summary" && rawCommand !== "eval") return;
          const command = rawCommand as AiCommand;

          const docText = view.state.doc.toString();
          const snapshot = spliceMarker(docText, fullFrom, text.length, command);

          // kickOffAi adds to inflight synchronously before its first await,
          // so the decoration pass below will see it.
          void kickOffAi({
            plugin: this.plugin,
            file,
            originalBacktick: text,
            position: fullFrom,
            documentSnapshot: snapshot,
          });
        },
      });
    }
  }

  /** Builds Decoration.replace over every `ai:` inline-code currently in flight for this file. */
  private buildDecorations(view: EditorView, file: TFile): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from,
        to,
        enter: (node) => {
          if (!node.type.name.startsWith("inline-code")) return;
          const fullFrom = node.from - 1;
          const fullTo = node.to + 1;
          if (fullFrom < 0 || fullTo > view.state.doc.length) return;
          const text = view.state.doc.sliceString(fullFrom, fullTo);
          if (!AI_REGEX.test(text)) return;
          if (!isBacktickInflight(this.plugin, file.path, fullFrom, text)) return;

          builder.add(
            fullFrom,
            fullTo,
            Decoration.replace({ widget: new GeneratingPillWidget() }),
          );
        },
      });
    }
    return builder.finish();
  }
}

const pluginSpec: PluginSpec<AiInlinePlugin> = {
  decorations: (value) => value.decorations,
};

export const aiInlineExtension = (plugin: TextMapperPlugin) =>
  ViewPlugin.define((view) => new AiInlinePlugin(view, plugin), pluginSpec);
