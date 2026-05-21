import { App, TFile } from "obsidian";
import { DiceRoll } from "@dice-roller/rpg-dice-roller";

export const ROLL_REGEX = /`roll\s*:\s*(.+?)`/;
export const ROLL_REGEX_G = /`roll\s*:\s*(.+?)`/g;

interface RollOptions {
    app: App;
    file: TFile;
    lineStart: number;
    lineEnd: number;
    index: number;
    originalText: string;
}

export class RollWidget {
    formula: string;
    app: App;
    file: TFile;
    lineStart: number;
    lineEnd: number;
    index: number;
    originalText: string;
    hasReplaced: boolean = false;

    constructor(opts: RollOptions) {
        this.app = opts.app;
        this.file = opts.file;
        this.lineStart = opts.lineStart;
        this.lineEnd = opts.lineEnd;
        this.index = opts.index;
        this.originalText = opts.originalText;
        this.parseFormula(opts.originalText);
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

    async replaceInFile(): Promise<string> {
        if (this.hasReplaced) {
            // Already replaced, just return a roll result for display
            const roll = this.rollDice();
            return roll.output;
        }

        try {
            const roll = this.rollDice();
            const result = roll.output;

            const text = await this.app.vault.read(this.file);
            const lines = text.split("\n");
            const regex = new RegExp(ROLL_REGEX_G);
            let matchIndex = 0;
            let found = false;

            lookup: {
                for (let i = this.lineStart; i <= this.lineEnd; i++) {
                    // Reset regex for each line
                    regex.lastIndex = 0;
                    for (
                        let match = regex.exec(lines[i]);
                        match !== null;
                        match = regex.exec(lines[i])
                    ) {
                        if (matchIndex < this.index) {
                            matchIndex++;
                        } else if (matchIndex === this.index) {
                            // Replace the entire code block (including backticks) with the result
                            lines[i] =
                                lines[i].substring(0, match.index) +
                                result +
                                lines[i].substring(match.index + match[0].length);
                            this.hasReplaced = true;
                            found = true;
                            break lookup;
                        }
                    }
                }
            }

            if (found) {
                const newContent = lines.join("\n");
                await this.app.vault.modify(this.file, newContent);
            }
            
            return result;
        } catch (error) {
            console.error("Error replacing roll in file:", error);
            // Fallback: return the roll result even if file modification fails
            const roll = this.rollDice();
            return roll.output;
        }
    }

    async toDOM(): Promise<HTMLElement> {
        // Replace in file first and get the result
        const result = await this.replaceInFile();

        // Create a plain span element with just text (not a code element)
        // This completely removes the code block and replaces it with plain text
        const el = document.createElement("span");
        el.textContent = result;
        // Don't add any classes that might make it look like code
        // Just plain text that replaces the code block

        return el;
    }
}
