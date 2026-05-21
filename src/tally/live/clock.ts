import { SyntaxNode } from "@lezer/common";
import { EditorView, WidgetType } from "@codemirror/view";
import { CLOCK_REGEX } from "../clocks";

export class ClockWidget extends WidgetType {
    value: number;
    max: number;
    size: number;
    el: HTMLElement;
    btnEl: HTMLElement;
    svgEl: SVGElement;
    node: SyntaxNode;

    private readonly SIZE_DEFAULT = 50;
    private readonly MIN_VALUE = 0;
    private readonly MIN_MAX = 1;
    private readonly MAX_MAX = 16;
    private readonly RAD = Math.PI / 180;

    constructor(opts: { originalNode: SyntaxNode; originalText: string }) {
        super();
        this.node = opts.originalNode;
        this.parseValue(opts.originalText);
        this.size = this.SIZE_DEFAULT;

        if (this.max < this.MIN_MAX) this.max = this.MIN_MAX;
        if (this.max > this.MAX_MAX) this.max = this.MAX_MAX;
        if (this.value <= this.MIN_VALUE) this.value = this.MIN_VALUE;
        if (this.value > this.max) this.value = this.max;
    }

    private parseValue(text: string) {
        this.value = this.MIN_VALUE;
        this.max = this.MIN_MAX;

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
        return `clocks:${this.value}/${this.max}`;
    }

    private setValue(newValue: number, view: EditorView) {
        this.value = newValue;
        if (this.value <= this.MIN_VALUE) this.value = this.MIN_VALUE;
        if (this.value > this.max) this.value = this.max;
        this.generateSvg();
        this.updateDoc(view);
    }

    private addValue(add: number, view: EditorView) {
        this.value = this.value + add;
        if (this.value <= this.MIN_VALUE) this.value = this.MIN_VALUE;
        if (this.value > this.max) this.value = this.max;
        this.generateSvg();
        this.updateDoc(view);
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
        const cx1 = Math.cos(angleB * this.RAD) * cr + x;
        const cy1 = -Math.sin(angleB * this.RAD) * cr + y;
        const cx2 = Math.cos(angleA * this.RAD) * cr + x;
        const cy2 = -Math.sin(angleA * this.RAD) * cr + y;

        return `M${x} ${y} ${cx1} ${cy1} A${cr} ${cr} 0 0 0 ${cx2} ${cy2}Z`;
    }

    private generateSvg() {
        if (!this.svgEl) return;

        this.svgEl.empty();

        const center = this.size / 2;
        const radius = center - 2;

        if (this.max <= 1) {
            const circleEl = document.createElementNS("http://www.w3.org/2000/svg", "circle");
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
                const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
                pathEl.setAttribute(
                    "d",
                    this.calculatePath(center, center, radius, i, step)
                );
                pathEl.setAttribute("fill", this.value > i ? "currentColor" : "none");
                pathEl.setAttribute("stroke", "currentColor");
                this.svgEl.appendChild(pathEl);
            }
            const circleEl = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circleEl.setAttribute("cx", center.toString());
            circleEl.setAttribute("cy", center.toString());
            circleEl.setAttribute("r", radius.toString());
            circleEl.setAttribute("fill", "none");
            circleEl.setAttribute("stroke", "currentColor");
            circleEl.setAttribute("stroke-width", "1.25");
            this.svgEl.appendChild(circleEl);
        }
    }

    private updateDoc(view: EditorView) {
        view.dispatch({
            changes: [
                {
                    from: this.node.from,
                    to: this.node.to,
                    insert: this.getText(),
                },
            ],
        });
    }

    toDOM(view: EditorView): HTMLElement {
        this.el = document.createElement("span");
        this.el.classList.add("tag-tally-clock");

        this.btnEl = this.el.createEl("button");
        this.btnEl.classList.add("clickable-icon", "tag-tally-clock-btn");

        this.svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svgEl.setAttribute("width", this.size.toString());
        this.svgEl.setAttribute("height", this.size.toString());
        this.svgEl.classList.add("tag-tally-clock-svg");
        this.btnEl.appendChild(this.svgEl);

        this.generateSvg();

        this.btnEl.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!event.shiftKey) {
                this.addValue(1, view);
            } else {
                this.addValue(-1, view);
            }
        };

        return this.el;
    }
}
