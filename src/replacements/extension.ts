import { syntaxTree } from "@codemirror/language";
import {
  Annotation,
  EditorState,
  Extension,
  StateField,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import type TextMapperPlugin from "../main";

interface LastReplacement {
  from: number;
  original: string;
  replacement: string;
}

const replacementAnnotation = Annotation.define<LastReplacement>();

const CODE_NODE_NAMES = new Set([
  "InlineCode",
  "FencedCode",
  "CodeBlock",
  "CodeText",
  "CodeMark",
  "HyperMD-codeblock",
  "HyperMD-codeblock-begin",
  "HyperMD-codeblock-end",
]);

function isInsideCode(state: EditorState, pos: number): boolean {
  let node = syntaxTree(state).resolveInner(pos, -1) as
    | { name: string; parent: unknown }
    | null;
  while (node) {
    for (const name of CODE_NODE_NAMES) {
      if (node.name === name || node.name.startsWith(name)) return true;
    }
    node = node.parent as typeof node;
  }
  return false;
}

const lastReplacementField = StateField.define<LastReplacement | null>({
  create: () => null,
  update(value, tr) {
    const ann = tr.annotation(replacementAnnotation);
    if (ann) return ann;
    if (tr.docChanged || tr.selection) return null;
    return value;
  },
});

export function runTextReplacement(
  view: EditorView,
  plugin: TextMapperPlugin,
): boolean {
  if (!plugin.settings.textReplacementsEnabled) return false;
  const state = view.state;
  const range = state.selection.main;

  if (!range.empty) {
    if (isInsideCode(state, range.from)) return false;
    const selected = state.doc.sliceString(range.from, range.to);
    for (const { trigger, replacement } of plugin.settings.textReplacements) {
      if (!trigger || !replacement) continue;
      if (selected !== trigger) continue;
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: replacement },
        selection: { anchor: range.from + replacement.length },
        annotations: replacementAnnotation.of({
          from: range.from,
          original: trigger,
          replacement,
        }),
        userEvent: "input.replace",
      });
      return true;
    }
    return false;
  }

  const head = range.head;
  if (isInsideCode(state, head)) return false;

  let best: { trigger: string; replacement: string } | null = null;
  for (const { trigger, replacement } of plugin.settings.textReplacements) {
    if (!trigger || !replacement) continue;
    if (head < trigger.length) continue;
    if (best && trigger.length <= best.trigger.length) continue;
    const before = state.doc.sliceString(head - trigger.length, head);
    if (before !== trigger) continue;
    best = { trigger, replacement };
  }
  if (!best) return false;

  const from = head - best.trigger.length;
  view.dispatch({
    changes: { from, to: head, insert: best.replacement },
    selection: { anchor: from + best.replacement.length },
    annotations: replacementAnnotation.of({
      from,
      original: best.trigger,
      replacement: best.replacement,
    }),
    userEvent: "input.replace",
  });
  return true;
}

export const textReplacementExtension = (
  _plugin: TextMapperPlugin,
): Extension => [
  lastReplacementField,
  keymap.of([
    {
      key: "Backspace",
      run: (view) => {
        const last = view.state.field(lastReplacementField);
        if (!last) return false;
        const cursor = view.state.selection.main;
        if (!cursor.empty) return false;
        const expectedEnd = last.from + last.replacement.length;
        if (cursor.head !== expectedEnd) return false;
        const actual = view.state.doc.sliceString(last.from, expectedEnd);
        if (actual !== last.replacement) return false;
        view.dispatch({
          changes: { from: last.from, to: expectedEnd, insert: last.original },
          selection: { anchor: last.from + last.original.length },
          userEvent: "input.replace.undo",
        });
        return true;
      },
    },
  ]),
];
