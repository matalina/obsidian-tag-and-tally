import { App, TFile } from "obsidian";
import { getTableStore } from "./store";

export const CUSTOM_REGEX = /`custom\s+(\{[^}]+\}(?:\s+\{[^}]+\})*)`/;
export const CUSTOM_REGEX_G = /`custom\s+(\{[^}]+\}(?:\s+\{[^}]+\})*)`/g;

interface CustomOptions {
    app: App;
    file: TFile;
    lineStart: number;
    lineEnd: number;
    index: number;
    originalText: string;
}

export class CustomWidget {
    tableNames: string[] = [];
    app: App;
    file: TFile;
    lineStart: number;
    lineEnd: number;
    index: number;
    originalText: string;
    hasReplaced: boolean = false;

    constructor(opts: CustomOptions) {
        this.app = opts.app;
        this.file = opts.file;
        this.lineStart = opts.lineStart;
        this.lineEnd = opts.lineEnd;
        this.index = opts.index;
        this.originalText = opts.originalText;
        this.parseTableNames(opts.originalText);
    }

    private parseTableNames(text: string) {
        const match = text.match(CUSTOM_REGEX);
        if (!match) {
            this.tableNames = [];
            return;
        }
        
        // Extract all table references from the match
        // Format: {table-name} or {table-name} {other-table} {another-table}
        const tableRefs = match[1].trim();
        
        // Find all table references using regex
        const tableRefRegex = /\{([^}]+)\}/g;
        const names: string[] = [];
        let refMatch;
        
        while ((refMatch = tableRefRegex.exec(tableRefs)) !== null) {
            // Normalize table name: lowercase and replace spaces with dashes
            // This matches how tables are stored (see markdown-parser.ts)
            const rawName = refMatch[1].trim();
            const tableName = rawName.toLowerCase().replace(/\s+/g, "-");
            names.push(tableName);
        }
        
        this.tableNames = names;
    }

    private rollAllTables(): { result: string; outputs: string[] } {
        const store = getTableStore();
        const results: string[] = [];
        const outputs: string[] = [];
        
        // Roll on each table independently (like sentence does)
        for (const tableName of this.tableNames) {
            try {
                const tableResult = store.random(tableName);
                results.push(tableResult.result);
                outputs.push(tableResult.roll.output);
            } catch (error) {
                console.error(`Error rolling on custom table ${tableName}:`, error);
                results.push(`[Error: ${tableName}]`);
                outputs.push("");
            }
        }
        
        // Combine results with spaces (like sentence combines table results)
        const combinedResult = results.join(" ");
        
        return {
            result: combinedResult,
            outputs: outputs,
        };
    }

    private formatOutput(result: string, outputs: string[]): string {
        // Format similar to pick/random: result ← _(roll outputs)_
        // Combine all roll outputs
        const combinedOutput = outputs.filter(o => o).join(", ");
        return `${result} ← _(${combinedOutput})_`;
    }

    async replaceInFile(): Promise<string> {
        if (this.hasReplaced) {
            // Already replaced, just return a roll result for display
            const roll = this.rollAllTables();
            return this.formatOutput(roll.result, roll.outputs);
        }

        try {
            const roll = this.rollAllTables();
            const result = this.formatOutput(roll.result, roll.outputs);

            const text = await this.app.vault.read(this.file);
            const lines = text.split("\n");
            const regex = new RegExp(CUSTOM_REGEX_G);
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
            console.error("Error replacing custom in file:", error);
            // Fallback: return the roll result even if file modification fails
            const roll = this.rollAllTables();
            return this.formatOutput(roll.result, roll.outputs);
        }
    }

    async toDOM(): Promise<HTMLElement> {
        // Replace in file first and get the result
        const result = await this.replaceInFile();

        // Create a plain span element with just text (not a code element)
        // This completely removes the code block and replaces it with plain text
        const el = activeDocument.createElement("span");
        el.textContent = result;

        return el;
    }
}
