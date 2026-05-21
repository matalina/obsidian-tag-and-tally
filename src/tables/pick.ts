import { App, TFile } from "obsidian";
import { getTableStore } from "./store";

export const PICK_REGEX = /`pick\s*:\s*(.+?)`/;
export const PICK_REGEX_G = /`pick\s*:\s*(.+?)`/g;

interface PickOptions {
    app: App;
    file: TFile;
    lineStart: number;
    lineEnd: number;
    index: number;
    originalText: string;
}

export class PickWidget {
    tableName: string;
    app: App;
    file: TFile;
    lineStart: number;
    lineEnd: number;
    index: number;
    originalText: string;
    hasReplaced: boolean = false;

    constructor(opts: PickOptions) {
        this.app = opts.app;
        this.file = opts.file;
        this.lineStart = opts.lineStart;
        this.lineEnd = opts.lineEnd;
        this.index = opts.index;
        this.originalText = opts.originalText;
        this.parseTableName(opts.originalText);
    }

    private parseTableName(text: string) {
        const match = text.match(PICK_REGEX);
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

    private formatOutput(result: string, output: string, useHtml: boolean = false): string {
        // For file replacement, use markdown format so Obsidian renders it correctly
        if (useHtml) {
            return `${result} ← <em>(${output})</em>`;
        }
        return `${result} ← _(${output})_`;
    }

    async replaceInFile(): Promise<string> {
        if (this.hasReplaced) {
            // Already replaced, just return a roll result for display
            const roll = this.rollTable();
            return this.formatOutput(roll.result, roll.output);
        }

        try {
            const roll = this.rollTable();
            const result = this.formatOutput(roll.result, roll.output);

            const text = await this.app.vault.read(this.file);
            const lines = text.split("\n");
            const regex = new RegExp(PICK_REGEX_G);
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
            console.error("Error replacing pick in file:", error);
            // Fallback: return the roll result even if file modification fails
            const roll = this.rollTable();
            return this.formatOutput(roll.result, roll.output);
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
