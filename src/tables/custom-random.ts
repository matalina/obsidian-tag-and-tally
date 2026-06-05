import { SyntaxNode } from "@lezer/common";
import { EditorView, WidgetType } from "@codemirror/view";
import { getTableStore } from "./store";

// Store initial roll results keyed by table name and text context to persist across widget recreations
// Cache format: { result: string, output: string }
const customRandomTableCache = new Map<string, { result: string; output: string }>();

export const CUSTOM_RANDOM_REGEX = /`custom-random\s*:\s*(.+?)`/;

export class CustomRandomWidget extends WidgetType {
    tableName: string;
    el: HTMLElement;
    resultEl: HTMLElement;
    rerollBtn: HTMLElement;
    node: SyntaxNode;
    view: EditorView | null = null;
    cacheKey: string;
    originalText: string;

    constructor(opts: { originalNode: SyntaxNode; originalText: string }) {
        super();
        this.node = opts.originalNode;
        this.originalText = opts.originalText;
        this.parseTableName(opts.originalText);
        // Create a stable cache key based on the original text (which includes the table name)
        // This ensures the same table block always uses the same roll until manually rerolled
        this.cacheKey = `custom-random-${opts.originalText}`;
    }

    private parseTableName(text: string) {
        const match = text.match(CUSTOM_RANDOM_REGEX);
        if (!match) {
            this.tableName = "";
            return;
        }
        this.tableName = match[1].trim();
    }

    private rollTable(): { result: string; output: string } {
        const store = getTableStore();
        const tableResult = store.random(this.tableName);
        return {
            result: tableResult.result,
            output: tableResult.roll.output,
        };
    }

    private renderOutput(el: HTMLElement, result: string, output: string): void {
        el.empty();
        el.appendText(`${result} ← `);
        el.createEl("em", { text: `(${output})` });
    }

    private getInitialRoll(): { result: string; output: string } {
        // Check if we already have a roll for this widget
        if (customRandomTableCache.has(this.cacheKey)) {
            return customRandomTableCache.get(this.cacheKey)!;
        }
        // Roll and cache the result
        const roll = this.rollTable();
        customRandomTableCache.set(this.cacheKey, roll);
        return roll;
    }

    private updateDisplay() {
        const roll = this.rollTable();
        if (this.resultEl) {
            this.renderOutput(this.resultEl, roll.result, roll.output);
        }
        // Update cache when manually rerolled
        customRandomTableCache.set(this.cacheKey, roll);
    }

    private handleReroll = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        this.updateDisplay();
    };

    toDOM(view: EditorView): HTMLElement {
        this.view = view;
        this.el = activeDocument.createElement("span");
        this.el.classList.add("tag-tally-random");

        // Get initial roll (cached if widget was recreated)
        const initialRoll = this.getInitialRoll();

        // Result display
        this.resultEl = this.el.createEl("span", {
            cls: "tag-tally-random-result",
        });
        this.renderOutput(this.resultEl, initialRoll.result, initialRoll.output);

        // Reroll button
        this.rerollBtn = this.el.createEl("button", {
            cls: "clickable-icon",
            attr: {
                "aria-label": "Reroll table",
            },
        });
        this.rerollBtn.setText("↻");
        this.rerollBtn.classList.add("tag-tally-random-reroll");
        this.rerollBtn.onclick = this.handleReroll;

        return this.el;
    }

    eq(other: CustomRandomWidget): boolean {
        // Consider widgets equal if they have the same cache key
        // This prevents recreation on every update
        return this.cacheKey === other.cacheKey;
    }
}
