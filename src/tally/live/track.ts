import { SyntaxNode } from "@lezer/common";
import { EditorView, WidgetType } from "@codemirror/view";
import { TRACK_REGEX } from "../track";

export class TrackWidget extends WidgetType {
    shape: "boxes" | "circles";
    value: number;
    max: number;
    size: number;
    el: HTMLElement;
    btnEls: HTMLElement[];
    node: SyntaxNode;

    private readonly SIZE_DEFAULT = 22;
    private readonly MIN_VALUE = 0;
    private readonly MIN_MAX = 1;
    private readonly MAX_MAX = 200;

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
        this.value = 0;
        this.max = 0;

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
        return `${this.shape}:${this.value}/${this.max}`;
    }

    private setValue(newValue: number, view: EditorView) {
        if (this.value > newValue + 1) {
            this.value = newValue + 1;
        } else if (this.value === newValue + 1) {
            this.value = newValue;
        } else {
            this.value = newValue + 1;
        }
        if (this.value <= this.MIN_VALUE) this.value = this.MIN_VALUE;
        if (this.value > this.max) this.value = this.max;
        this.updateButtons();
        this.updateDoc(view);
    }

    private updateButtons() {
        this.btnEls.forEach((btnEl, i) => {
            if (i < this.value) {
                btnEl.classList.add("active");
            } else {
                btnEl.classList.remove("active");
            }
        });
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
                this.setValue(i, view);
            };
            this.btnEls.push(btnEl);
        }

        this.updateButtons();
        return this.el;
    }
}
