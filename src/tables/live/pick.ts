import { SyntaxNode } from "@lezer/common";
import { EditorView, WidgetType } from "@codemirror/view";
import { PICK_REGEX } from "../pick";
import { getTableStore } from "../store";

// Track which nodes have been replaced to prevent multiple replacements
const replacedPickNodes = new Set<string>();

export class PickWidget extends WidgetType {
    tableName: string;
    node: SyntaxNode;
    nodeKey: string;

    constructor(opts: { originalNode: SyntaxNode; originalText: string }) {
        super();
        this.node = opts.originalNode;
        this.parseTableName(opts.originalText);
        // Create a unique key for this node
        this.nodeKey = `${opts.originalNode.from}-${opts.originalNode.to}`;
    }

    private parseTableName(text: string) {
        const match = text.match(PICK_REGEX);
        if (!match) {
            this.tableName = "";
            return;
        }
        this.tableName = match[1].trim();
    }

    private rollTable(): string {
        const store = getTableStore();
        const result = store.random(this.tableName);
        return result.result;
    }

    toDOM(view: EditorView): HTMLElement {
        // Check if this node has already been replaced
        if (replacedPickNodes.has(this.nodeKey)) {
            // Already replaced, read the current content
            const currentText = view.state.doc.sliceString(
                this.node.from - 1,
                this.node.to + 1
            );
            // If it doesn't match the pick regex, it's already been replaced
            if (!PICK_REGEX.test(currentText)) {
                // Return a plain text element with the current content
                const el = document.createElement("span");
                el.textContent = currentText;
                return el;
            }
        }

        const result = this.rollTable();

        // Mark as replaced immediately to prevent multiple replacements
        replacedPickNodes.add(this.nodeKey);

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
            replacedPickNodes.delete(this.nodeKey);
            console.error("Error replacing pick in editor:", error);
        }

        // Create a plain text element (not a code element)
        // This is what will be displayed - just plain text, no code styling
        const el = document.createElement("span");
        el.textContent = result;
        // Ensure it's treated as plain text, not code
        el.style.all = "unset";
        el.style.display = "inline";
        el.style.cursor = "text";
        
        return el;
    }

    eq(other: PickWidget): boolean {
        // Consider widgets equal if they have the same node key
        // This prevents recreation on every update
        return this.nodeKey === other.nodeKey;
    }
}
