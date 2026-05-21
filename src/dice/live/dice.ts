import { SyntaxNode } from "@lezer/common";
import { EditorView, WidgetType } from "@codemirror/view";
import { DICE_REGEX } from "../dice";
import { DiceRoll } from "@dice-roller/rpg-dice-roller";

// Store initial roll results keyed by formula and text context to persist across widget recreations
const diceRollCache = new Map<string, string>();

export class DiceWidget extends WidgetType {
    formula: string;
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
        this.parseFormula(opts.originalText);
        // Create a stable cache key based on the original text (which includes the formula)
        // This ensures the same dice block always uses the same roll until manually rerolled
        this.cacheKey = `dice-${opts.originalText}`;
    }

    private parseFormula(text: string) {
        const match = text.match(DICE_REGEX);
        if (!match) {
            this.formula = "1d6";
            return;
        }
        this.formula = match[1].trim();
    }

    private rollDice(): DiceRoll {
        try {
            return new DiceRoll(this.formula);
        } catch (error) {
            console.error("Error rolling dice:", error);
            // Fallback to 1d6 on error
            return new DiceRoll("1d6");
        }
    }

    private getInitialRoll(): string {
        // Check if we already have a roll for this widget
        if (diceRollCache.has(this.cacheKey)) {
            return diceRollCache.get(this.cacheKey)!;
        }
        // Roll and cache the result
        const roll = this.rollDice();
        const result = roll.output;
        diceRollCache.set(this.cacheKey, result);
        return result;
    }

    private updateDisplay() {
        const roll = this.rollDice();
        if (this.resultEl) {
            this.resultEl.textContent = roll.output;
        }
        // Update cache when manually rerolled
        diceRollCache.set(this.cacheKey, roll.output);
    }

    private handleReroll = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        this.updateDisplay();
    };

    toDOM(view: EditorView): HTMLElement {
        this.view = view;
        this.el = document.createElement("span");
        this.el.classList.add("tag-tally-dice");

        // Get initial roll (cached if widget was recreated)
        const initialResult = this.getInitialRoll();

        // Result display
        this.resultEl = this.el.createEl("span", {
            cls: "tag-tally-dice-result",
            text: initialResult,
        });

        // Reroll button
        this.rerollBtn = this.el.createEl("button", {
            cls: "clickable-icon",
            attr: {
                "aria-label": "Reroll dice",
            },
        });
        this.rerollBtn.setText("↻");
        this.rerollBtn.classList.add("tag-tally-dice-reroll");
        this.rerollBtn.onclick = this.handleReroll;

        return this.el;
    }

    eq(other: DiceWidget): boolean {
        // Consider widgets equal if they have the same cache key
        // This prevents recreation on every update
        return this.cacheKey === other.cacheKey;
    }
}
