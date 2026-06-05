import { App, TFile } from "obsidian";
import { getTableStore } from "./store";

export const RANDOM_REGEX = /`random\s*:\s*(.+?)`/;
export const RANDOM_REGEX_G = /`random\s*:\s*(.+?)`/g;

interface RandomOptions {
    app: App;
    file: TFile;
    lineStart: number;
    lineEnd: number;
    index: number;
    originalText: string;
}

export class RandomWidget {
    tableName: string;
    el: HTMLElement;
    resultEl: HTMLElement;
    rerollBtn: HTMLElement;
    app: App;
    file: TFile;
    lineStart: number;
    lineEnd: number;
    index: number;
    originalText: string;

    constructor(opts: RandomOptions) {
        this.app = opts.app;
        this.file = opts.file;
        this.lineStart = opts.lineStart;
        this.lineEnd = opts.lineEnd;
        this.index = opts.index;
        this.originalText = opts.originalText;
        this.parseTableName(opts.originalText);
    }

    private parseTableName(text: string) {
        const match = text.match(RANDOM_REGEX);
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

    private updateDisplay() {
        const roll = this.rollTable();
        if (this.resultEl) {
            this.renderOutput(this.resultEl, roll.result, roll.output);
        }
    }

    private handleReroll = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        this.updateDisplay();
    };

    toDOM(): HTMLElement {
        this.el = activeDocument.createElement("span");
        this.el.classList.add("tag-tally-random");

        // Initial roll
        const roll = this.rollTable();

        // Result display
        this.resultEl = this.el.createEl("span", {
            cls: "tag-tally-random-result",
        });
        this.renderOutput(this.resultEl, roll.result, roll.output);

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
}
