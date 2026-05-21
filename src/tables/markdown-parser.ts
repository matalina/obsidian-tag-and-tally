import { RandomTable, TableOption } from "./types/tables";

/**
 * Parse a markdown file and extract all tables defined with ## table name format
 * @param content - The markdown file content
 * @returns Array of parsed RandomTable objects
 */
export function parseMarkdownTables(content: string): RandomTable[] {
    const tables: RandomTable[] = [];
    const lines = content.split("\n");
    
    let i = 0;
    while (i < lines.length) {
        // Look for table header: ## table name
        const headerMatch = lines[i].match(/^##\s+(.+)$/);
        if (headerMatch) {
            const tableName = headerMatch[1].trim();
            
            // Skip empty lines after header
            i++;
            while (i < lines.length && lines[i].trim() === "") {
                i++;
            }
            
            // Look for markdown table starting with |
            if (i < lines.length && lines[i].trim().startsWith("|")) {
                const table = parseTableSection(lines, i, tableName);
                if (table) {
                    tables.push(table);
                    // Move past the table
                    i = table.endLine;
                } else {
                    i++;
                }
            } else {
                i++;
            }
        } else {
            i++;
        }
    }
    
    return tables;
}

/**
 * Parse a markdown table section starting at the given line
 * @param lines - All lines of the file
 * @param startLine - Line index where the table starts
 * @param tableName - Name of the table
 * @returns Parsed table or null if invalid, with endLine property indicating where parsing ended
 */
function parseTableSection(
    lines: string[],
    startLine: number,
    tableName: string
): (RandomTable & { endLine: number }) | null {
    // Parse header row: | 1d13 | Value |
    const headerLine = lines[startLine].trim();
    const headerMatch = headerLine.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
    if (!headerMatch) {
        return null;
    }
    
    let formulaHeader = headerMatch[1].trim();
    const valueHeader = headerMatch[2].trim();
    
    // Strip markdown formatting (bold, italic, etc.) from the formula header
    // Handles cases like "**1d10**" or "*1d20*" or "1d10"
    formulaHeader = formulaHeader.replace(/\*\*/g, "").replace(/\*/g, "").trim();
    
    // Extract dice formula from first column (e.g., "1d13" or "1d4")
    const formulaMatch = formulaHeader.match(/(\d+)d(\d+)/i);
    if (!formulaMatch) {
        console.error(`Invalid dice formula in table "${tableName}": ${formulaHeader}`);
        return null;
    }
    
    const formula = formulaMatch[0].toLowerCase(); // e.g., "1d13"
    
    // Skip separator row (| ----- | ----- |)
    let currentLine = startLine + 1;
    if (currentLine >= lines.length || !lines[currentLine].trim().startsWith("|")) {
        return null;
    }
    
    // Parse table rows
    const tableOptions: TableOption[] = [];
    currentLine++;
    
    while (currentLine < lines.length) {
        const line = lines[currentLine].trim();
        
        // Stop if we hit a non-table line (empty or not starting with |)
        if (line === "" || !line.startsWith("|")) {
            break;
        }
        
        // Parse row: | 1 | Earth | or |1|text| (handles both spaced and compact formats)
        const rowMatch = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
        if (rowMatch) {
            // Strip markdown formatting from roll string (handles bold/italic)
            let rollStr = rowMatch[1].trim().replace(/\*\*/g, "").replace(/\*/g, "").trim();
            // Strip markdown formatting from value
            let value = rowMatch[2].trim().replace(/\*\*/g, "").replace(/\*/g, "").trim();
            
            // Parse roll number (could be a single number or range)
            // Check for range FIRST, because parseInt("1-2") returns 1, not NaN
            // Support regular dash (-), endash (–), and emdash (—)
            const rangeMatch = rollStr.match(/(\d+)\s*[-–—]\s*(\d+)/);
            if (rangeMatch) {
                const min = parseInt(rangeMatch[1], 10);
                const max = parseInt(rangeMatch[2], 10);
                if (!isNaN(min) && !isNaN(max)) {
                    tableOptions.push({
                        min,
                        max,
                        value,
                    });
                } else {
                    console.warn(`Invalid range in table "${tableName}": ${rollStr}`);
                }
            } else {
                // Try to parse as single number
                const rollNum = parseInt(rollStr, 10);
                if (!isNaN(rollNum)) {
                    // Single number - min and max are the same
                    tableOptions.push({
                        min: rollNum,
                        max: rollNum,
                        value,
                    });
                } else {
                    console.warn(`Invalid roll value in table "${tableName}": ${rollStr}`);
                }
            }
        }
        
        currentLine++;
    }
    
    if (tableOptions.length === 0) {
        console.error(`No valid rows found in table "${tableName}"`);
        return null;
    }
    
    // Normalize table name: lowercase and replace spaces with dashes
    const normalizedName = tableName.toLowerCase().replace(/\s+/g, "-");
    
    return {
        name: normalizedName,
        formula,
        table: tableOptions,
        endLine: currentLine,
    };
}
