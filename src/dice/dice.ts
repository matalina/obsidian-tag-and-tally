import { App, TFile } from "obsidian";
import { DiceRoll } from "@dice-roller/rpg-dice-roller";

export const DICE_REGEX = /`dice\s*:\s*(.+?)`/;
export const DICE_REGEX_G = /`dice\s*:\s*(.+?)`/g;

interface DiceOptions {
    app: App;
    file: TFile;
    lineStart: number;
    lineEnd: number;
    index: number;
    originalText: string;
}

export class DiceWidget {
    formula: string;
    el: HTMLElement;
    resultEl: HTMLElement;
    rerollBtn: HTMLElement;
    app: App;
    file: TFile;
    lineStart: number;
    lineEnd: number;
    index: number;
    originalText: string;
    currentRoll: DiceRoll | null = null;

    constructor(opts: DiceOptions) {
        this.app = opts.app;
        this.file = opts.file;
        this.lineStart = opts.lineStart;
        this.lineEnd = opts.lineEnd;
        this.index = opts.index;
        this.originalText = opts.originalText;
        this.parseFormula(opts.originalText);
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
            const roll = new DiceRoll(this.formula);
            this.currentRoll = roll;
            return roll;
        } catch (error) {
            console.error("Error rolling dice:", error);
            // Fallback to 1d6 on error
            const roll = new DiceRoll("1d6");
            this.currentRoll = roll;
            return roll;
        }
    }

    private updateDisplay() {
        const roll = this.rollDice();
        if (this.resultEl) {
            this.resultEl.textContent = roll.output;
        }
    }

    private handleReroll = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        this.updateDisplay();
    };

    toDOM(): HTMLElement {
        this.el = activeDocument.createElement("span");
        this.el.classList.add("tag-tally-dice");

        // Initial roll
        const roll = this.rollDice();

        // Result display
        this.resultEl = this.el.createEl("span", {
            cls: "tag-tally-dice-result",
            text: roll.output,
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
}
