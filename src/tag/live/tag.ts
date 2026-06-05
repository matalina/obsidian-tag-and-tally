import { SyntaxNode } from "@lezer/common";
import { EditorView, WidgetType } from "@codemirror/view";
import { setIcon } from "obsidian";
import { TAG_REGEX } from "../tag";

export class TagWidget extends WidgetType {
    type: string | null;
    tier: number | null;
    tagText: string;
    tally: number | null;
    flag: 'x' | 's' | 'w' | 'l' | null;
    temporary: boolean;
    el: HTMLElement;
    node: SyntaxNode;
    view: EditorView | null = null;
    originalText: string;

    constructor(opts: { originalNode: SyntaxNode; originalText: string }) {
        super();
        this.node = opts.originalNode;
        this.originalText = opts.originalText;
        this.parseValue(opts.originalText);
    }

    private parseValue(text: string) {
        this.type = null;
        this.tier = null;
        this.tagText = "";
        this.tally = null;
        this.flag = null;
        this.temporary = false;

        const match = text.match(TAG_REGEX);
        if (!match) {
            // Fallback: try to extract just the tag text
            const simpleMatch = text.match(/^`tag\s+(.+?)`$/);
            if (simpleMatch) {
                this.tagText = simpleMatch[1].trim();
            }
            return;
        }

        this.type = match[1] || null;
        this.tier = match[2] ? parseInt(match[2]) : null;
        this.tagText = match[3] ? match[3].trim() : "";
        this.tally = match[4] ? parseInt(match[4]) : null;
        this.flag = (match[5] as 'x' | 's' | 'w' | 'l') || null;
        // Check if ! appears before the closing backtick
        this.temporary = /!\s*`$/.test(text);

        // Clamp tally to 1-5
        if (this.tally !== null) {
            if (this.tally < 1) this.tally = 1;
            if (this.tally > 5) this.tally = 5;
        }
    }

    getText(): string {
        let result = "tag";
        if (this.type) {
            result += `:${this.type}`;
        }
        if (this.tier) {
            result += ` T${this.tier}`;
        }
        result += ` ${this.tagText}`;
        if (this.tally) {
            result += ` %${this.tally}`;
        }
        if (this.flag) {
            result += ` ^${this.flag}`;
        }
        if (this.temporary) {
            result += ` !`;
        }
        return result;
    }

    private getTagCategory(type: string): string {
        const categoryMap: { [key: string]: string } = {
            // Umbrella tags
            umbrella: 'umbrella',
            special: 'umbrella',
            species: 'umbrella',
            type: 'umbrella',
            aged: 'umbrella',
            
            // Skill tags
            skill: 'skill',
            ability: 'skill',
            attack: 'skill',
            
            // Condition tags
            condition: 'condition',
            reputation: 'condition',
            
            // Generic tags
            background: 'generic',
            experience: 'generic',
            language: 'generic',
            goal: 'generic',
            secret: 'generic',
            location: 'generic',
            spell: 'generic',
            item: 'generic',
            use: 'generic',
            
            // Danger tags
            flaw: 'danger',
            weakness: 'danger',
            damage: 'danger',
            wound: 'danger',
            
            // Environment tags
            scene: 'environment',
            
            // Trait tags
            trait: 'trait',
            strong: 'trait',
            descriptor: 'trait',
            drive: 'trait',
        };
        
        return categoryMap[type.toLowerCase()] || 'generic';
    }

    private getTypeIconName(type: string): string | null {
        // Map tag types to Lucide icon names
        const iconMap: { [key: string]: string } = {
            background: "book",
            scene: "image",
            trait: "type",
            umbrella: "type",
            flaw: "circle-off",
            weakness: "circle-off",
            condition: "split",
            reputation: "message-circle",
            skill: "brain",
            ability: "brain",
            experience: "ticket",
            damage: "swords",
            wound: "swords",
            attack: "swords",
            special: "sparkles",
            language: "languages",
            strong: "biceps-flexed",
            goal: "chart-no-axes-combined",
            secret: "lock",
            location: "arrow-down-to-dot",
            descriptor: "type",
            species: "users-round",
            spell: "sparkles",
            item: "amphora",
            type: "crown",
            use: "amphora",
            aged: "binary",
            drive: "flame",
        };

        return iconMap[type.toLowerCase()] || null;
    }

    private getTallyIconName(tally: number): string {
        // Clamp tally to 1-5 and return icon name
        const clampedTally = Math.max(1, Math.min(5, tally));
        return `tally-${clampedTally}`;
    }

    private getFlagMessage(flag: 'x' | 's' | 'w' | 'l'): string {
        const flagMap: { [key: string]: string } = {
            x: "has a secret",
            s: "has a strength",
            w: "has a weakness",
            l: "unknown location",
        };
        return flagMap[flag] || "";
    }

    toDOM(view: EditorView): HTMLElement {
        this.view = view;
        this.el = activeDocument.createElement("span");
        this.el.classList.add("tag-tally-tag");
        this.el.setCssStyles({ cursor: "pointer" });

        const box = this.el.createEl("span");
        box.classList.add("tag-tally-tag-box");
        if (this.type) {
            // Label type uses default styling
            if (this.type.toLowerCase() === "label") {
                box.classList.add("tag-tally-tag-default");
            } else {
                const category = this.getTagCategory(this.type);
                box.classList.add(`tag-tally-tag-${category}`);
            }
        } else {
            box.classList.add("tag-tally-tag-default");
        }

        // If flag is present, add hidden class and make box position relative
        if (this.flag) {
            box.classList.add("tag-tally-tag-hidden");
            box.setCssStyles({ position: "relative" });
        }

        // Type icon (skip for label type)
        if (this.type && this.type.toLowerCase() !== "label") {
            const iconContainer = box.createEl("span");
            iconContainer.classList.add("tag-tally-tag-icon");
            const iconName = this.getTypeIconName(this.type);
            if (iconName) {
                setIcon(iconContainer, iconName);
            }
            // Hide icon if flag is present
            if (this.flag) {
                iconContainer.setCssStyles({ color: "transparent" });
            }
        }

        // Tier display
        if (this.tier !== null) {
            const tierEl = box.createEl("span");
            tierEl.classList.add("tag-tally-tag-tier");
            tierEl.textContent = `T${this.tier}`;
            // Hide tier if flag is present
            if (this.flag) {
                tierEl.setCssStyles({ color: "transparent" });
            }
        }

        // Tag text - handle label format specially
        if (this.type && this.type.toLowerCase() === "label") {
            // Parse label format: (label): (value)
            const labelMatch = this.tagText.match(/^(.+?):\s*(.+)$/);
            if (labelMatch) {
                const labelText = labelMatch[1].trim();
                const valueText = labelMatch[2].trim();
                
                const labelEl = box.createEl("span");
                labelEl.classList.add("tag-tally-tag-label-label");
                labelEl.textContent = labelText;
                // Hide text if flag is present
                if (this.flag) {
                    labelEl.setCssStyles({ color: "transparent" });
                }
                
                const colonEl = box.createEl("span");
                colonEl.textContent = ": ";
                // Hide colon if flag is present
                if (this.flag) {
                    colonEl.setCssStyles({ color: "transparent" });
                }
                
                const valueEl = box.createEl("span");
                valueEl.classList.add("tag-tally-tag-label-value");
                valueEl.textContent = valueText;
                // Hide value if flag is present
                if (this.flag) {
                    valueEl.setCssStyles({ color: "transparent" });
                }
            } else {
                // Fallback if format doesn't match
                const textEl = box.createEl("span");
                textEl.classList.add("tag-tally-tag-text");
                textEl.textContent = this.tagText;
                // Hide text if flag is present
                if (this.flag) {
                    textEl.setCssStyles({ color: "transparent" });
                }
            }
        } else {
            const textEl = box.createEl("span");
            textEl.classList.add("tag-tally-tag-text");
            textEl.textContent = this.tagText;
            // Hide text if flag is present
            if (this.flag) {
                textEl.setCssStyles({ color: "transparent" });
            }
        }

        // Tally icon
        if (this.tally !== null) {
            const tallyEl = box.createEl("span");
            tallyEl.classList.add("tag-tally-tag-tally");
            const tallyIconName = this.getTallyIconName(this.tally);
            setIcon(tallyEl, tallyIconName);
            // Hide tally icon if flag is present
            if (this.flag) {
                tallyEl.setCssStyles({ color: "transparent" });
            }
        }

        // Temporary tag icon
        if (this.temporary) {
            const tempEl = box.createEl("span");
            tempEl.classList.add("tag-tally-tag-icon");
            setIcon(tempEl, "triangle-dashed");
            // Hide temporary icon if flag is present
            if (this.flag) {
                tempEl.setCssStyles({ color: "transparent" });
            }
        }

        // Overlay for flag message
        if (this.flag) {
            const overlay = box.createEl("span");
            overlay.classList.add("tag-tally-tag-overlay");
            overlay.textContent = this.getFlagMessage(this.flag);
        }

        // Make clickable to edit
        this.el.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.view) {
                this.restoreForEditing(this.view);
            }
        };

        return this.el;
    }

    private restoreForEditing(view: EditorView) {
        // Remove backticks from the original text
        const textWithoutBackticks = this.originalText.slice(1, -1);
        
        // Dispatch a change to replace the widget with the text without backticks
        view.dispatch({
            changes: [
                {
                    from: this.node.from,
                    to: this.node.to,
                    insert: textWithoutBackticks,
                },
            ],
            selection: {
                anchor: this.node.from,
                head: this.node.from + textWithoutBackticks.length,
            },
        });
    }
}
