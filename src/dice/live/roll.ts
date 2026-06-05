import { SyntaxNode } from "@lezer/common";
import { EditorView, WidgetType } from "@codemirror/view";
import { ROLL_REGEX } from "../roll";
import { DiceRoll } from "@dice-roller/rpg-dice-roller";

// Track which nodes have been replaced to prevent multiple replacements
const replacedNodes = new Set<string>();

export class RollWidget extends WidgetType {
    formula: string;
    node: SyntaxNode;
    nodeKey: string;

    constructor(opts: { originalNode: SyntaxNode; originalText: string }) {
        super();
        this.node = opts.originalNode;
        this.parseFormula(opts.originalText);
        // Create a unique key for this node
        this.nodeKey = `${opts.originalNode.from}-${opts.originalNode.to}`;
    }

    private parseFormula(text: string) {
        const match = text.match(ROLL_REGEX);
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

    toDOM(view: EditorView): HTMLElement {
        // Check if this node has already been replaced
        if (replacedNodes.has(this.nodeKey)) {
            // Already replaced, read the current content
            const currentText = view.state.doc.sliceString(
                this.node.from - 1,
                this.node.to + 1
            );
            // If it doesn't match the roll regex, it's already been replaced
            if (!ROLL_REGEX.test(currentText)) {
                // Return a plain text element with the current content
                const el = activeDocument.createElement("span");
                el.textContent = currentText;
                return el;
            }
        }

        const roll = this.rollDice();
        const result = roll.output;

        // Mark as replaced immediately to prevent multiple replacements
        replacedNodes.add(this.nodeKey);

        // Replace the code block in the editor IMMEDIATELY and SYNCHRONOUSLY
        // This must happen before the widget is displayed
        try {
            // Replace including backticks: node.from-1 to node.to+1
            view.dispatch({
                changes: [
                    {
                        from: this.node.from - 1,
                        to: this.node.to + 1,
                        insert: result,
                    },
                ],
            });
        } catch (error) {
            // If replacement fails, remove from set so it can be retried
            replacedNodes.delete(this.nodeKey);
            console.error("Error replacing roll in editor:", error);
        }

        // Create a plain text element (not a code element)
        // This is what will be displayed - just plain text, no code styling
        const el = activeDocument.createElement("span");
        el.textContent = result;
        
        // Ensure it's treated as plain text, not code
        // Remove any code-related classes or attributes
        el.className = "";
        el.removeAttribute("class");
        
        // Set styles to ensure it looks like plain text
        el.setCssStyles({ display: "inline" });
        el.setCssStyles({ fontFamily: "inherit" });
        el.setCssStyles({ fontSize: "inherit" });
        el.setCssStyles({ color: "inherit" });
        el.setCssStyles({ backgroundColor: "transparent" });
        el.setCssStyles({ padding: "0" });
        el.setCssStyles({ margin: "0" });
        el.setCssStyles({ border: "none" });
        el.setCssStyles({ cursor: "text" });
        
        // Prevent any code block interactions
        el.setAttribute("data-roll-result", "true");
        el.setAttribute("contenteditable", "false");
        
        // Prevent click events from opening code blocks
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
        }, true);
        
        // Prevent any code-related behavior
        el.addEventListener("mousedown", (e) => {
            e.stopPropagation();
        }, true);
        
        return el;
    }

    eq(other: RollWidget): boolean {
        // Consider widgets equal if they have the same node key
        // This prevents recreation on every update
        return this.nodeKey === other.nodeKey;
    }
}
