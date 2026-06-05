import { App, TFile } from "obsidian";

export const TRACK_REGEX = /^`(boxes|circles)\s*:\s*(\d+)\s*\/\s*(\d+)`$/;
export const TRACK_REGEX_G = /`(boxes|circles)\s*:\s*(\d+)\s*\/\s*(\d+)`/g;

const MIN_VALUE = 0;
const MIN_MAX = 1;
const MAX_MAX = 200;

const SIZE_DEFAULT = 22;

interface TrackOptions {
    app: App;
    file: TFile;
    lineStart: number;
    lineEnd: number;
    index: number;
    originalText: string;
}

export class TrackWidget {
    shape: "boxes" | "circles";
    value: number;
    max: number;
    size: number;
    el: HTMLElement;
    btnEls: HTMLElement[];
    app: App;
    file: TFile;
    lineStart: number;
    lineEnd: number;
    index: number;
    originalText: string;

    constructor(opts: TrackOptions) {
        this.app = opts.app;
        this.file = opts.file;
        this.lineStart = opts.lineStart;
        this.lineEnd = opts.lineEnd;
        this.index = opts.index;
        this.originalText = opts.originalText;
        this.parseValue(opts.originalText);
        this.size = SIZE_DEFAULT;

        if (this.max < MIN_MAX) this.max = MIN_MAX;
        if (this.max > MAX_MAX) this.max = MAX_MAX;
        if (this.value <= MIN_VALUE) this.value = MIN_VALUE;
        if (this.value > this.max) this.value = this.max;
    }

    private parseValue(text: string) {
        this.value = 0;
        this.max = 0;

        // Match the regex (which includes backticks)
        const match = text.match(TRACK_REGEX);
        if (!match) {
            this.shape = "boxes";
            this.value = 0;
            this.max = 1;
            return;
        }

        this.shape = match[1] === "circles" ? "circles" : "boxes";
        this.value = parseInt(match[2]) || 0;
        this.max = parseInt(match[3]) || 0;
    }

    getText(): string {
        return `\`${this.shape}:${this.value}/${this.max}\``;
    }

    private setValue(newValue: number) {
        if (this.value > newValue + 1) {
            this.value = newValue + 1;
        } else if (this.value === newValue + 1) {
            this.value = newValue;
        } else {
            this.value = newValue + 1;
        }
        if (this.value <= MIN_VALUE) this.value = MIN_VALUE;
        if (this.value > this.max) this.value = this.max;
        this.updateButtons();
        this.updateDoc();
    }

    private addValue(add: number) {
        this.value += add;
        if (this.value <= MIN_VALUE) this.value = MIN_VALUE;
        if (this.value > this.max) this.value = this.max;
        this.updateButtons();
        this.updateDoc();
    }

    private updateButtons() {
        for (const i in this.btnEls) {
            const btnEl = this.btnEls[i];
            if (parseInt(i) < this.value) {
                btnEl.classList.add("active");
            } else {
                btnEl.classList.remove("active");
            }
        }
    }

    private async updateDoc() {
        try {
            const text = await this.app.vault.read(this.file);
            const lines = text.split("\n");
            const regex = new RegExp(TRACK_REGEX_G);
            let matchIndex = 0;

            lookup: {
                for (let i = this.lineStart; i <= this.lineEnd; i++) {
                    for (
                        let match = regex.exec(lines[i]);
                        match !== null;
                        match = regex.exec(lines[i])
                    ) {
                        if (matchIndex < this.index) {
                            matchIndex++;
                        } else if (matchIndex === this.index) {
                            lines[i] =
                                lines[i].substring(0, match.index) +
                                this.getText() +
                                lines[i].substring(match.index + match[0].length);
                            break lookup;
                        }
                    }
                }
            }

            const newContent = lines.join("\n");
            await this.app.vault.modify(this.file, newContent);
        } catch (error) {
            console.error("Error updating track widget:", error);
        }
    }

    toDOM(): HTMLElement {
        this.el = activeDocument.createElement("span");
        this.el.classList.add("tag-tally-track");

        this.btnEls = [];
        for (let i = 0; i < this.max; i++) {
            const btnEl = this.el.createEl("button");
            btnEl.style.width = `${this.size}px`;
            btnEl.style.height = `${this.size}px`;
            btnEl.classList.add(
                "clickable-icon",
                "tag-tally-track-btn",
                `tag-tally-track-${this.shape}`
            );
            btnEl.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.setValue(i);
            };
            this.btnEls.push(btnEl);
        }

        this.updateButtons();
        return this.el;
    }
}
