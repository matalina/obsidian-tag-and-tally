import { App, TFile } from "obsidian";

export const CLOCK_REGEX = /^`clocks?\s*:\s*(\d+)\s*\/\s*(\d+)`$/;
export const CLOCK_REGEX_G = /`clocks?\s*:\s*(\d+)\s*\/\s*(\d+)`/g;

const MIN_VALUE = 0;
const MIN_MAX = 1;
const MAX_MAX = 16;
const RAD = Math.PI / 180;

const SIZE_DEFAULT = 50;

interface ClockOptions {
    app: App;
    file: TFile;
    lineStart: number;
    lineEnd: number;
    index: number;
    originalText: string;
}

export class ClockWidget {
    value: number;
    max: number;
    size: number;
    el: HTMLElement;
    btnEl: HTMLElement;
    svgEl: SVGElement;
    app: App;
    file: TFile;
    lineStart: number;
    lineEnd: number;
    index: number;
    originalText: string;

    constructor(opts: ClockOptions) {
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
        this.value = MIN_VALUE;
        this.max = MIN_MAX;

        // Match the regex (which includes backticks)
        const match = text.match(CLOCK_REGEX);
        if (!match) {
            this.value = 0;
            this.max = 1;
            return;
        }

        this.value = parseInt(match[1]) || 0;
        this.max = parseInt(match[2]) || 0;
    }

    getText(): string {
        return `\`clocks:${this.value}/${this.max}\``;
    }

    private setValue(newValue: number) {
        this.value = newValue;
        if (this.value <= MIN_VALUE) this.value = MIN_VALUE;
        if (this.value > this.max) this.value = this.max;
        this.generateSvg();
        this.updateDoc();
    }

    private addValue(add: number) {
        this.value = this.value + add;
        if (this.value <= MIN_VALUE) this.value = MIN_VALUE;
        if (this.value > this.max) this.value = this.max;
        this.generateSvg();
        this.updateDoc();
    }

    private calculatePath(
        centerX: number,
        centerY: number,
        size: number,
        index: number,
        step: number
    ): string {
        const angleA = -index * step + 90;
        const angleB = (-index - 1) * step + 90;
        const x = centerX;
        const y = centerY;
        const cr = size;
        const cx1 = Math.cos(angleB * RAD) * cr + x;
        const cy1 = -Math.sin(angleB * RAD) * cr + y;
        const cx2 = Math.cos(angleA * RAD) * cr + x;
        const cy2 = -Math.sin(angleA * RAD) * cr + y;

        return `M${x} ${y} ${cx1} ${cy1} A${cr} ${cr} 0 0 0 ${cx2} ${cy2}Z`;
    }

    private generateSvg() {
        if (!this.svgEl) return;
        
        this.svgEl.empty();

        const center = this.size / 2;
        const radius = center - 2;

        if (this.max <= 1) {
            const circleEl = activeDocument.createElementNS("http://www.w3.org/2000/svg", "circle");
            circleEl.setAttribute("cx", center.toString());
            circleEl.setAttribute("cy", center.toString());
            circleEl.setAttribute("r", radius.toString());
            circleEl.setAttribute("fill", this.value > 0 ? "currentColor" : "none");
            circleEl.setAttribute("stroke", "currentColor");
            circleEl.setAttribute("stroke-width", "1.25");
            this.svgEl.appendChild(circleEl);
        } else {
            const step = 360 / this.max;
            for (let i = 0; i < this.max; i++) {
                const pathEl = activeDocument.createElementNS("http://www.w3.org/2000/svg", "path");
                pathEl.setAttribute(
                    "d",
                    this.calculatePath(center, center, radius, i, step)
                );
                pathEl.setAttribute("fill", this.value > i ? "currentColor" : "none");
                pathEl.setAttribute("stroke", "currentColor");
                this.svgEl.appendChild(pathEl);
            }
            const circleEl = activeDocument.createElementNS("http://www.w3.org/2000/svg", "circle");
            circleEl.setAttribute("cx", center.toString());
            circleEl.setAttribute("cy", center.toString());
            circleEl.setAttribute("r", radius.toString());
            circleEl.setAttribute("fill", "none");
            circleEl.setAttribute("stroke", "currentColor");
            circleEl.setAttribute("stroke-width", "1.25");
            this.svgEl.appendChild(circleEl);
        }
    }

    private async updateDoc() {
        try {
            const text = await this.app.vault.read(this.file);
            const lines = text.split("\n");
            const regex = new RegExp(CLOCK_REGEX_G);
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
            console.error("Error updating clock widget:", error);
        }
    }

    toDOM(): HTMLElement {
        this.el = activeDocument.createElement("span");
        this.el.classList.add("tag-tally-clock");

        this.btnEl = this.el.createEl("button");
        this.btnEl.classList.add("clickable-icon", "tag-tally-clock-btn");

        this.svgEl = activeDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svgEl.setAttribute("width", this.size.toString());
        this.svgEl.setAttribute("height", this.size.toString());
        this.svgEl.classList.add("tag-tally-clock-svg");
        this.btnEl.appendChild(this.svgEl);

        this.generateSvg();

        this.btnEl.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!event.shiftKey) {
                this.addValue(1);
            } else {
                this.addValue(-1);
            }
        };

        return this.el;
    }
}
