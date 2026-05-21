import { createApp } from 'vue';
import { App, Notice, TFile, setIcon } from 'obsidian';
import { DiceRoll } from '@dice-roller/rpg-dice-roller';
import { getTableStore } from '../../tables/store';
import { markdownTextMapperIsDungeon } from '../../text-mapper/dungeon-detect';
import { formatResolveOutput, runResolution } from '@tag-and-tally/shared-ui';
import { ResultBox } from '@tag-and-tally/shared-ui';

interface MapInfo {
  mapId: string;
  filePath: string;
}

// Parse frontmatter from file content
function parseFrontmatter(content: string): Record<string, string> | null {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);
  if (!match) return null;

  const frontmatterText = match[1];
  const frontmatter: Record<string, string> = {};

  // Simple YAML parsing - handle quoted strings and arrays
  const lines = frontmatterText.split('\n');
  let currentKey: string | null = null;
  let currentValue: string[] = [];
  let inArray = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentKey && currentValue.length > 0) {
        frontmatter[currentKey] = currentValue.join('\n');
        currentKey = null;
        currentValue = [];
      }
      continue;
    }

    // Check if this is an array item (starts with -)
    if (trimmed.startsWith('-')) {
      if (currentKey) {
        inArray = true;
        // Extract the value after the dash and quotes
        const arrayValue = trimmed
          .substring(1)
          .trim()
          .replace(/^["']|["']$/g, '');
        currentValue.push(arrayValue);
      }
      continue;
    }

    // If we were in an array and hit a new key, save the array
    if (inArray && currentKey && trimmed.includes(':')) {
      frontmatter[currentKey] = currentValue.join(', ');
      currentKey = null;
      currentValue = [];
      inArray = false;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.substring(0, colonIndex).trim();
    let value = trimmed.substring(colonIndex + 1).trim();

    // Remove quotes from value if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Check if this starts an array
    if (value === '' || value === '[]') {
      currentKey = key;
      currentValue = [];
      inArray = true;
    } else {
      frontmatter[key] = value;
      currentKey = null;
      currentValue = [];
      inArray = false;
    }
  }

  // Save any remaining array
  if (currentKey && currentValue.length > 0) {
    frontmatter[currentKey] = currentValue.join(', ');
  }

  return frontmatter;
}

// Parse hex coordinate input in various formats (00.00, 0000, 00 00, -38-15)
function parseHexCoordinate(input: string): { x: number; y: number } | null {
  // Remove whitespace
  const cleaned = input.trim();

  // Try format: 00.00 or -38.15 (dot separated)
  const dotMatch = cleaned.match(/^(-?\d+)[.]+(-?\d+)$/);
  if (dotMatch) {
    return {
      x: parseInt(dotMatch[1], 10),
      y: parseInt(dotMatch[2], 10),
    };
  }

  // Try format: 00 00 (space separated)
  const spaceMatch = cleaned.match(/^(-?\d+)\s+(-?\d+)$/);
  if (spaceMatch) {
    return {
      x: parseInt(spaceMatch[1], 10),
      y: parseInt(spaceMatch[2], 10),
    };
  }

  // IMPORTANT: Hyphens are NEVER separators - they are ALWAYS part of negative numbers
  // Try format: -0707 (x negative, y positive, 4 digits with leading negative sign)
  // Example: "-0707" -> x=-07, y=07
  const negativeXFourDigitMatch = cleaned.match(/^-(\d{2})(\d{2})$/);
  if (negativeXFourDigitMatch) {
    const x = -parseInt(negativeXFourDigitMatch[1], 10);
    const y = parseInt(negativeXFourDigitMatch[2], 10);
    if (!isNaN(x) && !isNaN(y)) {
      return { x, y };
    }
  }

  // Try format: concatenated with dash where dash is part of negative sign
  // Examples:
  //   "00-01" -> x=00, y=-01 (dash is negative sign for y, NOT a separator)
  //   "-01-01" -> x=-01, y=-01 (both negative, dash is negative sign for y)
  //   "01-02" -> x=01, y=-02 (dash is negative sign for y)
  // This must come before the four-digit format to handle negative coordinates correctly
  // Pattern: optional negative sign, digits, dash (negative indicator), digits
  const dashNegativeMatch = cleaned.match(/^(-?\d{2,})-(\d{2,})$/);
  if (dashNegativeMatch) {
    const x = parseInt(dashNegativeMatch[1], 10);
    const y = -parseInt(dashNegativeMatch[2], 10); // Dash ALWAYS indicates negative for y
    if (!isNaN(x) && !isNaN(y)) {
      return { x, y };
    }
  }

  // Try format: 0000 or 3815 (4+ digits, first half are x, last half are y) - positive only
  // This handles cases like "0000", "3815", etc. where both are positive
  const fourDigitMatch = cleaned.match(/^(\d{2})(\d{2})$/);
  if (fourDigitMatch) {
    return {
      x: parseInt(fourDigitMatch[1], 10),
      y: parseInt(fourDigitMatch[2], 10),
    };
  }

  return null;
}

// Calculate 6 surrounding hex coordinates for flat-top hexes (default orientation)
// Returns neighbors starting from top (position 1) going clockwise
function calculateHexNeighbors(x: number, y: number): Array<{ x: number; y: number; position: number }> {
  const isEven = Math.abs(x) % 2 === 0;
  const evenOdd = 0; // Default swapEvenOdd = false

  let neighbors: Array<{ x: number; y: number; position: number }>;

  if (isEven) {
    // x is even - starting from top, going clockwise
    neighbors = [
      { x: x + 0, y: y - 1, position: 1 }, // top
      { x: x + 1, y: y + 0 - evenOdd, position: 2 }, // top-right
      { x: x + 1, y: y + 1 - evenOdd, position: 3 }, // bottom-right
      { x: x + 0, y: y + 1, position: 4 }, // bottom
      { x: x - 1, y: y + 1 - evenOdd, position: 5 }, // bottom-left
      { x: x - 1, y: y + 0 - evenOdd, position: 6 }, // top-left
    ];
  } else {
    // x is odd - starting from top, going clockwise
    neighbors = [
      { x: x + 0, y: y - 1, position: 1 }, // top
      { x: x + 1, y: y - 1 + evenOdd, position: 2 }, // top-right
      { x: x + 1, y: y + 0 + evenOdd, position: 3 }, // bottom-right
      { x: x + 0, y: y + 1, position: 4 }, // bottom
      { x: x - 1, y: y + 0 + evenOdd, position: 5 }, // bottom-left
      { x: x - 1, y: y - 1 + evenOdd, position: 6 }, // top-left
    ];
  }

  return neighbors;
}

// Calculate hex coordinate after moving N hexes in a specified direction
// direction: 1-6 (position from calculateHexNeighbors)
// distance: number of hexes to move
function calculateHexInDirection(
  startCoord: { x: number; y: number },
  direction: number,
  distance: number,
): { x: number; y: number } {
  let currentCoord = { ...startCoord };

  for (let i = 0; i < distance; i++) {
    const neighbors = calculateHexNeighbors(currentCoord.x, currentCoord.y);
    const neighborInDirection = neighbors.find((n) => n.position === direction);

    if (!neighborInDirection) {
      // Should never happen, but handle edge case
      break;
    }

    currentCoord = { x: neighborInDirection.x, y: neighborInDirection.y };
  }

  return currentCoord;
}

// Format hex coordinate for display
function formatHexCoordinate(x: number, y: number, format = '{X}.{Y}'): string {
  // Format with leading zeros, handling negative numbers
  const formatNumber = (num: number): string => {
    const absNum = Math.abs(num);
    const padded = absNum.toString().padStart(2, '0');
    return num < 0 ? `-${padded}` : padded;
  };

  const xStr = formatNumber(x);
  const yStr = formatNumber(y);
  return format.replace(/{X}/g, xStr).replace(/{Y}/g, yStr);
}

// Extract travel theme from map file (option travel-theme terrain/city/modern)
async function getTravelThemeFromMap(app: App, mapPath: string | null): Promise<string | null> {
  if (!mapPath) return null;

  try {
    const file = app.vault.getAbstractFileByPath(mapPath);
    if (!file || !(file instanceof TFile)) return null;

    const content = await app.vault.read(file);
    const codeBlockRegex = /```text-mapper\n([\s\S]*?)```/;
    const match = content.match(codeBlockRegex);
    if (!match) return null;

    const textMapperSource = match[1];
    const lines = textMapperSource.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.startsWith('option')) continue;

      // Check for "option travel-theme <theme>"
      const travelThemeMatch = trimmed.match(/^option\s+travel-theme\s+(\w+)/i);
      if (travelThemeMatch) {
        const theme = travelThemeMatch[1].toLowerCase();
        // Validate theme is one of the supported values
        if (theme === 'terrain' || theme === 'city' || theme === 'modern') {
          return theme;
        }
      }
    }
  } catch (error) {
    console.error('Error reading travel theme from map:', error);
  }

  return null;
}

// Get all map IDs from vault
async function getAllMapIds(app: App): Promise<MapInfo[]> {
  const markdownFiles = app.vault.getMarkdownFiles();
  const mapInfos: MapInfo[] = [];
  const processedPaths = new Set<string>(); // Track processed file paths

  for (const file of markdownFiles) {
    // Skip if we've already processed this file path
    if (processedPaths.has(file.path)) {
      continue;
    }
    processedPaths.add(file.path);

    try {
      const content = await app.vault.read(file);
      const frontmatter = parseFrontmatter(content);

      if (frontmatter && frontmatter.mapId) {
        if (markdownTextMapperIsDungeon(content)) {
          continue;
        }
        mapInfos.push({
          mapId: frontmatter.mapId,
          filePath: file.path,
        });
      }
    } catch (error) {
      // Skip files that can't be read
      console.warn(`Could not read file ${file.path}:`, error);
    }
  }

  // Deduplicate by both filePath and mapId to prevent any duplicates
  const uniqueMapsByPath = new Map<string, MapInfo>();
  const uniqueMapsById = new Map<string, MapInfo>();

  for (const mapInfo of mapInfos) {
    // First deduplicate by filePath
    if (!uniqueMapsByPath.has(mapInfo.filePath)) {
      uniqueMapsByPath.set(mapInfo.filePath, mapInfo);
    }
    // Also deduplicate by mapId (in case same mapId appears with different paths)
    if (!uniqueMapsById.has(mapInfo.mapId)) {
      uniqueMapsById.set(mapInfo.mapId, mapInfo);
    }
  }

  // Use filePath-based deduplication as primary (more reliable)
  // Convert back to array and sort by mapId
  const uniqueMapArray = Array.from(uniqueMapsByPath.values());
  uniqueMapArray.sort((a, b) => a.mapId.localeCompare(b.mapId));

  return uniqueMapArray;
}

// Get the hex folder path relative to the map file (using map ID as folder name)
async function getHexFolderPath(app: App, mapPath: string): Promise<string> {
  try {
    const file = app.vault.getAbstractFileByPath(mapPath);
    if (file && file instanceof TFile) {
      const content = await app.vault.read(file);
      const frontmatter = parseFrontmatter(content);
      if (frontmatter && frontmatter.mapId) {
        const mapDir = mapPath.substring(0, mapPath.lastIndexOf('/'));
        const folderName = frontmatter.mapId;
        return mapDir ? `${mapDir}/${folderName}` : folderName;
      }
    }
  } catch (error) {
    console.error('Error reading map file for folder path:', error);
  }
  // Fallback to "hex" if we can't read the map ID
  const mapDir = mapPath.substring(0, mapPath.lastIndexOf('/'));
  return mapDir ? `${mapDir}/hex` : 'hex';
}

// Get the hex note file path
async function getHexNotePath(app: App, mapPath: string, coord: { x: number; y: number }): Promise<string> {
  const hexFolder = await getHexFolderPath(app, mapPath);
  const hexId = formatHexCoordinate(coord.x, coord.y, '{X}{Y}');
  return `${hexFolder}/${hexId}.md`;
}

// Create or update a hex note (permanent hex data only; event and insights are transient and go in the sidebar result box)
async function createOrUpdateHexNote(
  app: App,
  mapPath: string,
  coord: { x: number; y: number },
  level: number | null,
  terrain: string | null,
  feature: string | null,
  exits: Array<{ position: number; coord: string; terrain: string }> = [],
  theme: 'terrain' | 'city' | 'modern' = 'terrain',
  landmark: string | null = null,
  faction: string | null = null,
): Promise<TFile | null> {
  try {
    const hexNotePath = await getHexNotePath(app, mapPath, coord);
    const hexDisplay = formatHexCoordinate(coord.x, coord.y, '{X}.{Y}');

    // Get mapId from the map file
    let mapId: string | null = null;
    try {
      const mapFile = app.vault.getAbstractFileByPath(mapPath);
      if (mapFile && mapFile instanceof TFile) {
        const mapContent = await app.vault.read(mapFile);
        const mapFrontmatter = parseFrontmatter(mapContent);
        if (mapFrontmatter && mapFrontmatter.mapId) {
          mapId = mapFrontmatter.mapId;
        }
      }
    } catch (error) {
      console.error('Error reading mapId from map file:', error);
    }

    // Build frontmatter
    const frontmatter: string[] = ['---'];
    frontmatter.push(`hex: "${hexDisplay}"`);
    if (mapId) {
      frontmatter.push(`mapId: "${mapId}"`);
    }
    if (level !== null) {
      frontmatter.push(`level: ${level}`);
    }
    if (terrain) {
      frontmatter.push(`terrain: "${terrain}"`);
    }
    if (feature) {
      frontmatter.push(`feature: "${feature}"`);
    }
    if (landmark) {
      frontmatter.push(`landmark: "${landmark}"`);
    }
    if (faction) {
      frontmatter.push(`faction: "${faction}"`);
    }
    if (exits.length > 0) {
      // Store exits as YAML array of hex coordinate strings
      const exitCoords = exits
        .map((exit) => exit.coord)
        .sort((a, b) => {
          // Sort by position for consistent ordering
          const exitA = exits.find((e) => e.coord === a);
          const exitB = exits.find((e) => e.coord === b);
          return (exitA?.position || 0) - (exitB?.position || 0);
        });
      frontmatter.push(`exits:`);
      exitCoords.forEach((coord) => {
        frontmatter.push(`  - "${coord}"`);
      });
    }
    frontmatter.push('---');

    // Build content (matching pane display format)
    const contentLines: string[] = [];
    if (level !== null) {
      contentLines.push(`**Level:** ${level}`);
    }
    if (terrain) {
      const terrainLabel = theme === 'city' || theme === 'modern' ? 'District' : 'Terrain';
      contentLines.push(`**${terrainLabel}:** ${terrain}`);
    }
    if (feature) {
      contentLines.push(`**Feature:** ${feature}`);
    }
    if (landmark) {
      contentLines.push(`**Landmark:** ${landmark}`);
    }
    if (faction) {
      contentLines.push(`**Faction:** ${faction}`);
    }
    if (exits.length > 0) {
      contentLines.push(`**Exits:**`);
      exits.forEach((exit) => {
        // Convert coord from "68.74" format to "6874" for the link
        const hexId = exit.coord.replace(/\./g, '');
        // Format: 5 (68.74) → [[map-1234/6874|Wastelands]] (includes folder name for proper linking)
        const linkPath = mapId ? `${mapId}/${hexId}` : hexId;
        contentLines.push(`- ${exit.position} (${exit.coord}) → [[${linkPath}|${exit.terrain}]]`);
      });
    }

    const content = `${frontmatter.join('\n')}\n\n${contentLines.join('\n')}\n`;

    // Check if file exists
    const existingFile = app.vault.getAbstractFileByPath(hexNotePath);

    if (existingFile && existingFile instanceof TFile) {
      // Update existing file
      await app.vault.modify(existingFile, content);
      return existingFile;
    } else {
      // Create new file (ensure folder exists)
      const hexFolder = await getHexFolderPath(app, mapPath);
      const folder = app.vault.getAbstractFileByPath(hexFolder);
      if (!folder) {
        // Create folder if it doesn't exist
        await app.vault.createFolder(hexFolder);
      }

      const file = await app.vault.create(hexNotePath, content);
      return file;
    }
  } catch (error) {
    console.error('Error creating/updating hex note:', error);
    return null;
  }
}

// Read hex note and extract information
async function readHexNote(
  app: App,
  mapPath: string,
  coord: { x: number; y: number },
): Promise<{ level?: string; terrain?: string; feature?: string; landmark?: string; faction?: string } | null> {
  try {
    const hexNotePath = await getHexNotePath(app, mapPath, coord);
    const file = app.vault.getAbstractFileByPath(hexNotePath);

    if (!file || !(file instanceof TFile)) {
      return null;
    }

    const content = await app.vault.read(file);
    const frontmatter = parseFrontmatter(content);

    if (!frontmatter) {
      return null;
    }

    const result: { level?: string; terrain?: string; feature?: string; landmark?: string; faction?: string } = {};

    if (frontmatter.level) {
      result.level = frontmatter.level;
    }
    if (frontmatter.terrain) {
      // Check if terrain is an error message and skip if so
      if (!frontmatter.terrain.toLowerCase().includes('[table not found:')) {
        result.terrain = frontmatter.terrain;
      }
    }
    if (frontmatter.feature) {
      result.feature = frontmatter.feature;
    }
    if (frontmatter.landmark) {
      result.landmark = frontmatter.landmark;
    }
    if (frontmatter.faction) {
      result.faction = frontmatter.faction;
    }

    return result;
  } catch (error) {
    console.error('Error reading hex note:', error);
    return null;
  }
}

// Extract hex link from a hex line in textmapper (format: "mapId/XXYY|XX.YY" or "XXYY|XX.YY")
function extractHexLinkFromHexLine(line: string): string | null {
  // Look for quoted format: "mapId/XXYY|XX.YY" or "XXYY|XX.YY"
  const linkMatch = line.match(/"([^"]+\|[^"]+)"/);
  if (linkMatch) {
    return linkMatch[1];
  }
  return null;
}

// Add or update hex link in a hex line (format: "mapId/XXYY|XX.YY")
function addHexLinkToHexLine(line: string, hexId: string, hexDisplay: string, mapId: string | null = null): string {
  // Remove existing link if present (both wikilink and quoted formats)
  let cleaned = line.replace(/\[\[[^\]]+\]\]/, '').replace(/"([^"]+\|[^"]+)"/, '');
  cleaned = cleaned.trim();

  // Add quoted link at the end (includes folder path for proper linking)
  const linkPath = mapId ? `${mapId}/${hexId}` : hexId;
  return `${cleaned} "${linkPath}|${hexDisplay}"`;
}

export async function createTravelTab(
  container: HTMLElement,
  app: App,
  selectedMapPath: string | null = null,
  hexInputValue = '0000',
  theme = 'terrain',
  onMapSelected: (mapPath: string | null) => Promise<void> = async () => {},
  onHexInputChanged: (hexValue: string) => Promise<void> = async () => {},
  onThemeChanged: (theme: string) => Promise<void> = async () => {},
  autoCalculate = false,
): Promise<void> {
  container.empty();

  // Track currently selected map path (updated when dropdown changes)
  let currentSelectedMapPath = selectedMapPath;

  // Generate a random 4-digit ID (1000-9999)
  const generateMapId = (): string => {
    const id = Math.floor(1000 + Math.random() * 9000);
    return id.toString();
  };

  // Get all map IDs and create dropdown
  let mapInfos = await getAllMapIds(app);

  // Function to refresh the map dropdown
  async function refreshMapDropdown() {
    mapInfos = await getAllMapIds(app);

    // Remove any duplicate dropdowns (shouldn't happen, but safety check)
    const allMapSelects = container.querySelectorAll('#map-select');
    if (allMapSelects.length > 1) {
      for (let i = 1; i < allMapSelects.length; i++) {
        allMapSelects[i].remove();
      }
    }

    let mapSelect = container.querySelector('#map-select') as HTMLSelectElement;

    // If dropdown doesn't exist and we now have maps, create it
    if (!mapSelect && mapInfos.length > 0) {
      // Remove "No maps found" message if it exists
      const noMapsMessage = selectContainer.querySelector('span');
      if (noMapsMessage) {
        noMapsMessage.remove();
      }

      // Create label
      selectContainer.createEl('label', {
        text: 'Select Map:',
        attr: { for: 'map-select' },
      });

      // Create select element
      mapSelect = selectContainer.createEl('select', {
        cls: 'tag-tally-select',
        attr: { id: 'map-select' },
      });

      // Add default option
      const defaultOption = mapSelect.createEl('option', {
        text: '-- Select a map --',
        value: '',
      });
      defaultOption.disabled = true;
      defaultOption.selected = true;

      // Add event listener for map selection (only if not already added)
      // Check if event listener already exists by checking for a data attribute
      if (!mapSelect.hasAttribute('data-listener-added')) {
        mapSelect.setAttribute('data-listener-added', 'true');
        mapSelect.addEventListener('change', async (event) => {
          const selectedPath = (event.target as HTMLSelectElement).value;
          if (selectedPath) {
            currentSelectedMapPath = selectedPath;
            await onMapSelected(selectedPath);

            // Read travel theme from map file and update theme dropdown
            const mapTheme = await getTravelThemeFromMap(app, selectedPath);
            if (mapTheme) {
              themeSelect.value = mapTheme;
              await onThemeChanged(mapTheme);
            }

            // Show open map button
            openMapButton.style.display = '';
            const file = app.vault.getAbstractFileByPath(selectedPath);
            if (file && file instanceof TFile) {
              const leaf = app.workspace.getLeaf(true);
              await leaf.openFile(file);
            }

            // Update display with current hex coordinate for the new map
            const coord = parseHexCoordinate(hexInput.value.trim());
            if (coord) {
              await updateMapInfoDisplay(coord, selectedPath);
            }
          } else {
            currentSelectedMapPath = null;
            await onMapSelected(null);
            // Hide open map button
            openMapButton.style.display = 'none';
            // Clear display when no map is selected
            resultsContainer.empty();
            resultsContainer.style.display = 'none';
          }
        });
      }
    }

    if (!mapSelect) return;

    const currentSelection = mapSelect.value;

    // Clear all existing options completely
    while (mapSelect.firstChild) {
      mapSelect.removeChild(mapSelect.firstChild);
    }

    // Re-add default option
    const defaultOption = mapSelect.createEl('option', {
      text: '-- Select a map --',
      value: '',
    });
    defaultOption.disabled = true;

    // Deduplicate mapInfos by filePath to prevent duplicates
    const uniqueMaps = new Map<string, MapInfo>();
    for (const mapInfo of mapInfos) {
      // Only add if we haven't seen this filePath before
      if (!uniqueMaps.has(mapInfo.filePath)) {
        uniqueMaps.set(mapInfo.filePath, mapInfo);
      }
    }

    // Also check for duplicate mapIds and only keep the first occurrence
    const seenMapIds = new Set<string>();
    const finalMaps: MapInfo[] = [];
    for (const mapInfo of uniqueMaps.values()) {
      if (!seenMapIds.has(mapInfo.mapId)) {
        seenMapIds.add(mapInfo.mapId);
        finalMaps.push(mapInfo);
      }
    }

    // Add updated map options (only unique ones)
    let foundSelectedMap = false;
    for (const mapInfo of finalMaps) {
      const option = mapSelect.createEl('option', {
        text: mapInfo.mapId,
        value: mapInfo.filePath,
      });
      // Restore selected map if it still exists
      if (currentSelection && mapInfo.filePath === currentSelection) {
        option.selected = true;
        foundSelectedMap = true;
      }
    }

    // If no map was selected, select the default option
    if (!foundSelectedMap) {
      defaultOption.selected = true;
    }

    // If selected map was deleted, select default
    if (currentSelection && !foundSelectedMap) {
      const defaultOption = mapSelect.querySelector('option[value=""]') as HTMLOptionElement;
      if (defaultOption) {
        defaultOption.selected = true;
      }
      // Clear selection
      currentSelectedMapPath = null;
      await onMapSelected(null);
      // Hide open map button
      openMapButton.style.display = 'none';
    } else if (currentSelection && foundSelectedMap) {
      // If a map is still selected after refresh, read its theme
      const mapTheme = await getTravelThemeFromMap(app, currentSelection);
      if (mapTheme) {
        const themeSelectElement = container.querySelector('#theme-select') as HTMLSelectElement;
        if (themeSelectElement) {
          themeSelectElement.value = mapTheme;
          await onThemeChanged(mapTheme);
        }
      }
    }
  }

  // Create theme dropdown above map selector
  const themeContainer = container.createDiv({
    cls: 'tag-tally-theme-container',
    attr: { style: 'display: flex; align-items: center; gap: 8px; margin-bottom: 12px;' },
  });

  themeContainer.createEl('label', {
    text: 'Theme:',
    attr: { for: 'theme-select' },
  });

  const themeSelect = themeContainer.createEl('select', {
    cls: 'tag-tally-select',
    attr: { id: 'theme-select' },
  });

  const terrainOption = themeSelect.createEl('option', {
    text: 'Terrain',
    value: 'terrain',
  });

  const cityOption = themeSelect.createEl('option', {
    text: 'City',
    value: 'city',
  });

  const modernOption = themeSelect.createEl('option', {
    text: 'Modern',
    value: 'modern',
  });

  // Set selected theme
  if (theme === 'city') {
    cityOption.selected = true;
  } else if (theme === 'modern') {
    modernOption.selected = true;
  } else {
    terrainOption.selected = true;
  }

  // Save theme when it changes
  themeSelect.addEventListener('change', async (event) => {
    const selectedTheme = (event.target as HTMLSelectElement).value;
    await onThemeChanged(selectedTheme);
  });

  // Create container for controls (flex row layout)
  const controlsContainer = container.createDiv({
    cls: 'tag-tally-travel-container',
    attr: { style: 'display: flex; align-items: center; gap: 8px;' },
  });

  // Create dropdown for existing maps
  const selectContainer = controlsContainer.createDiv({ cls: 'tag-tally-select-container' });
  if (mapInfos.length > 0) {
    selectContainer.createEl('label', {
      text: 'Select Map:',
      attr: { for: 'map-select' },
    });
    const mapSelect = selectContainer.createEl('select', {
      cls: 'tag-tally-select',
      attr: { id: 'map-select' },
    });

    // Add default option
    const defaultOption = mapSelect.createEl('option', {
      text: '-- Select a map --',
      value: '',
    });
    defaultOption.disabled = true;

    // Track if we found the selected map
    let foundSelectedMap = false;

    // Deduplicate mapInfos by filePath to prevent duplicates
    const uniqueMaps = new Map<string, MapInfo>();
    for (const mapInfo of mapInfos) {
      // Only add if we haven't seen this filePath before
      if (!uniqueMaps.has(mapInfo.filePath)) {
        uniqueMaps.set(mapInfo.filePath, mapInfo);
      }
    }

    // Also check for duplicate mapIds and only keep the first occurrence
    const seenMapIds = new Set<string>();
    const finalMaps: MapInfo[] = [];
    for (const mapInfo of uniqueMaps.values()) {
      if (!seenMapIds.has(mapInfo.mapId)) {
        seenMapIds.add(mapInfo.mapId);
        finalMaps.push(mapInfo);
      }
    }

    // Add map options (only unique ones)
    for (const mapInfo of finalMaps) {
      const option = mapSelect.createEl('option', {
        text: mapInfo.mapId,
        value: mapInfo.filePath,
      });
      // Restore selected map if it matches
      if (currentSelectedMapPath && mapInfo.filePath === currentSelectedMapPath) {
        option.selected = true;
        foundSelectedMap = true;
      }
    }

    // Only select default option if no map was selected
    if (!foundSelectedMap) {
      defaultOption.selected = true;
    }

    // If a map is already selected, read its theme and update the dropdown
    if (currentSelectedMapPath && foundSelectedMap) {
      const mapTheme = await getTravelThemeFromMap(app, currentSelectedMapPath);
      if (mapTheme) {
        themeSelect.value = mapTheme;
        await onThemeChanged(mapTheme);
      }
    }

    // Handle map selection
    mapSelect.addEventListener('change', async (event) => {
      const selectedPath = (event.target as HTMLSelectElement).value;
      if (selectedPath) {
        currentSelectedMapPath = selectedPath;
        await onMapSelected(selectedPath);

        // Read travel theme from map file and update theme dropdown
        const mapTheme = await getTravelThemeFromMap(app, selectedPath);
        if (mapTheme) {
          themeSelect.value = mapTheme;
          await onThemeChanged(mapTheme);
        }

        // Show open map button
        openMapButton.style.display = '';
        const file = app.vault.getAbstractFileByPath(selectedPath);
        if (file && file instanceof TFile) {
          const leaf = app.workspace.getLeaf(true);
          await leaf.openFile(file);
        }

        // Update display with current hex coordinate for the new map
        const coord = parseHexCoordinate(hexInput.value.trim());
        if (coord) {
          await updateMapInfoDisplay(coord, selectedPath);
        }
      } else {
        currentSelectedMapPath = null;
        await onMapSelected(null);
        // Hide open map button
        openMapButton.style.display = 'none';
        // Clear display when no map is selected
        resultsContainer.empty();
        resultsContainer.style.display = 'none';
      }
    });
  } else {
    // Show message if no maps exist
    selectContainer.createEl('span', { text: 'No maps found' });
  }

  // Create "Open Map" button with file-text icon
  const openMapButton = controlsContainer.createEl('button', {
    cls: 'clickable-icon',
  });
  openMapButton.setAttribute('aria-label', 'Open Map');
  setIcon(openMapButton, 'file-input');
  openMapButton.style.display = currentSelectedMapPath ? '' : 'none';

  // Open map button handler
  openMapButton.addEventListener('click', async () => {
    if (currentSelectedMapPath) {
      const file = app.vault.getAbstractFileByPath(currentSelectedMapPath);
      if (file && file instanceof TFile) {
        const leaf = app.workspace.getLeaf(true);
        await leaf.openFile(file);
      } else {
        new Notice('Map file not found');
      }
    }
  });

  // Create "New Map" button with map-plus icon
  const newMapButton = controlsContainer.createEl('button', {
    cls: 'mod-cta',
  });
  newMapButton.setAttribute('aria-label', 'New Map');
  setIcon(newMapButton, 'map-plus');
  newMapButton.createSpan({ text: ' New Map' });

  // Create hex neighbor calculator section
  const hexCalculatorContainer = container.createDiv({ cls: 'tag-tally-hex-calculator' });

  const inputContainer = hexCalculatorContainer.createDiv({
    cls: 'tag-tally-hex-input-container',
    attr: { style: 'display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;' },
  });

  inputContainer.createEl('label', {
    text: 'Hex Coordinate:',
    attr: { for: 'hex-input' },
  });

  const inputRow = inputContainer.createDiv({
    attr: { style: 'display: flex; align-items: center; gap: 8px;' },
  });

  const hexInput = inputRow.createEl('input', {
    type: 'text',
    cls: 'tag-tally-input tag-tally-control',
    attr: {
      id: 'hex-input',
      placeholder: '00.00, 0000, or 00 00',
      style: 'width: 12ch; min-height: 2.5rem; box-sizing: border-box;',
    },
    value: hexInputValue,
  });

  const moveButton = inputRow.createEl('button', {
    cls: 'clickable-icon',
  });
  moveButton.setAttribute('aria-label', 'Move');
  setIcon(moveButton, 'move-3d');

  // Create Locate button
  const locateButton = inputRow.createEl('button', {
    cls: 'clickable-icon',
  });
  locateButton.setAttribute('aria-label', 'Locate');
  setIcon(locateButton, 'locate');

  // Create Random Hex button
  const randomHexButton = inputRow.createEl('button', {
    cls: 'clickable-icon',
  });
  randomHexButton.setAttribute('aria-label', 'Random Hex Coordinate');
  setIcon(randomHexButton, 'dice');

  // Random hex button handler
  randomHexButton.addEventListener('click', async () => {
    // Generate random x and y values from -99 to 99
    const randomX = Math.floor(Math.random() * 199) - 99; // -99 to 99
    const randomY = Math.floor(Math.random() * 199) - 99; // -99 to 99

    // Format the coordinate using the same format as the input expects
    const formattedCoord = formatHexCoordinate(randomX, randomY, '{X}.{Y}');

    // Set the input value
    hexInput.value = formattedCoord;

    // Trigger the input change callback
    await onHexInputChanged(formattedCoord);
  });

  // Store previous coordinates (stored when Move is clicked, for future use)
  let previousCoord: { x: number; y: number } | null = null;
  let currentDisplayedCoord: { x: number; y: number } | null = null;

  // Track movement path for roads (starts at 0000)
  let movementPath: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];

  // Load existing road path from map if available
  if (currentSelectedMapPath) {
    (async () => {
      try {
        const file = app.vault.getAbstractFileByPath(currentSelectedMapPath);
        if (file && file instanceof TFile) {
          const content = await app.vault.read(file);
          const codeBlockRegex = /```text-mapper\n([\s\S]*?)```/;
          const match = content.match(codeBlockRegex);
          if (match) {
            const textMapperSource = match[1];
            const lines = textMapperSource.split('\n');

            // Find road path line (format: 0000-0100-0200 road)
            const roadPathLine = lines.find((line) => {
              const trimmed = line.trim();
              return trimmed.endsWith(' road') || trimmed.match(/^-?\d{2}-?\d{2}(?:-?\d{2}-?\d{2})+\s+road$/);
            });
            if (roadPathLine) {
              // Parse road path: "0000-0100-0200 road"
              const roadPathMatch = roadPathLine.trim().match(/^(.+?)\s+road$/);
              if (roadPathMatch) {
                const pathString = roadPathMatch[1].trim();
                const pathCoords = pathString.split('-');
                const loadedPath = pathCoords
                  .map((coordStr) => {
                    const parsed = parseHexCoordinate(coordStr);
                    return parsed;
                  })
                  .filter((coord): coord is { x: number; y: number } => coord !== null);

                if (loadedPath.length > 0) {
                  movementPath = loadedPath;
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error loading road path:', error);
      }
    })();
  }

  // Create Populate button (initially hidden) - generates level, feature, landmark, faction AND neighbor terrain
  const populateButton = inputRow.createEl('button', {
    cls: 'clickable-icon',
    attr: {
      style: 'display: none;',
      'aria-label': 'Populate (with neighbors)',
    },
  });
  setIcon(populateButton, 'map-pin-plus');

  // Create Populate Current Only button (initially hidden) - only generates data for current hex, no neighbor terrain
  const populateCurrentButton = inputRow.createEl('button', {
    cls: 'clickable-icon',
    attr: {
      style: 'display: none;',
      'aria-label': 'Populate Current Only',
    },
  });
  setIcon(populateCurrentButton, 'map-pin');

  // Function to get terrain for a specific hex coordinate from the map
  async function getHexTerrainFromMap(mapPath: string | null, coord: { x: number; y: number }): Promise<string | null> {
    if (!mapPath) return null;

    try {
      const file = app.vault.getAbstractFileByPath(mapPath);
      if (!file || !(file instanceof TFile)) return null;

      const content = await app.vault.read(file);

      // Extract textmapper code block
      const codeBlockRegex = /```text-mapper\n([\s\S]*?)```/;
      const match = content.match(codeBlockRegex);
      if (!match) return null;

      const textMapperSource = match[1];
      const lines = textMapperSource.split('\n');

      // Format the target hex coordinate
      const targetCoord = formatHexCoordinate(coord.x, coord.y, '{X}{Y}');

      // Find the hex entry
      const hexLine = lines.find((line) => {
        const trimmed = line.trim();
        return (
          trimmed.startsWith(targetCoord) &&
          !trimmed.startsWith('#') &&
          !trimmed.startsWith('id') &&
          !trimmed.startsWith('option')
        );
      });

      if (!hexLine) return null;

      // Parse the hex entry to get terrain
      const hexMatch = hexLine.trim().match(new RegExp(`^${targetCoord}\\s+(.+)`));
      if (hexMatch) {
        const tags = hexMatch[1].split(/\s+/);

        // Extract bg tag (ends with -bg)
        const bgTag = tags.find((tag) => tag.endsWith('-bg'));
        const bgName = bgTag ? bgTag.replace(/-bg$/, '') : null;

        // Extract terrain (first non-bg, non-difficulty, non-level tag)
        const terrainTag = tags.find(
          (tag) =>
            !tag.endsWith('-bg') &&
            tag !== 'easy' &&
            tag !== 'rough' &&
            tag !== 'dangerous' &&
            !tag.startsWith('level-'),
        );

        if (terrainTag) {
          const terrainName = terrainTag;
          const terrain = terrainTag.charAt(0).toUpperCase() + terrainTag.slice(1).replace(/-/g, ' ');
          // Check if terrain is an error message and return null if so
          if (terrain.toLowerCase().includes('[table not found:')) {
            return null;
          }

          // If bg and terrain don't match, format as "bg (terrain)"
          if (bgName && bgName !== terrainName) {
            const bgFormatted = bgName.charAt(0).toUpperCase() + bgName.slice(1).replace(/-/g, ' ');
            return `${bgFormatted} (${terrain})`;
          }

          return terrain;
        }
      }
    } catch (error) {
      console.error('Error getting hex terrain:', error);
    }

    return null;
  }

  // Function to update the display with map information
  async function updateMapInfoDisplay(
    coord: { x: number; y: number } | null,
    mapPath: string | null = null,
    overrideData?: {
      level?: string;
      terrain?: string;
      feature?: string;
      landmark?: string;
      faction?: string;
      exits?: Array<{ position: number; coord: string; terrain: string }>;
    },
  ) {
    resultsContainer.empty();

    const currentMapPath = mapPath || currentSelectedMapPath;

    if (!coord || !currentMapPath) {
      resultsContainer.style.display = 'none';
      return;
    }

    // Track currently displayed coordinate
    currentDisplayedCoord = coord;

    resultsContainer.style.display = 'block';

    // Use override data if provided, otherwise read from hex note first, then fall back to textmapper
    let mapInfo: {
      level?: string;
      terrain?: string;
      feature?: string;
      landmark?: string;
      faction?: string;
      exits?: Array<{ position: number; coord: string; terrain: string }>;
    };

    if (overrideData) {
      mapInfo = {
        level: overrideData.level,
        terrain: overrideData.terrain,
        feature: overrideData.feature,
        landmark: overrideData.landmark,
        faction: overrideData.faction,
        exits: [],
      };
    } else {
      // First try to read from hex note file
      const hexNoteInfo = await readHexNote(app, currentMapPath, coord);

      // Then get info from textmapper source (for terrain/feature if not in hex note, and for exits)
      const textMapperInfo = await getMapInfoFromTextMapper(currentMapPath, coord);

      // Merge: prefer hex note data, but use textmapper as fallback (event/insights are transient, not in notes)
      mapInfo = {
        level: hexNoteInfo?.level || textMapperInfo.level,
        terrain: hexNoteInfo?.terrain || textMapperInfo.terrain,
        feature: hexNoteInfo?.feature || textMapperInfo.feature,
        landmark: hexNoteInfo?.landmark || textMapperInfo.landmark,
        faction: hexNoteInfo?.faction || textMapperInfo.faction,
        exits: textMapperInfo.exits || [],
      };
    }

    // Always calculate all 6 neighbors
    const neighbors = calculateHexNeighbors(coord.x, coord.y);

    // Build exits list with all neighbors, checking if they exist in the map
    // Use override exits if provided, otherwise calculate from map
    const exitsToDisplay: Array<{ position: number; coord: string; terrain: string }> = overrideData?.exits || [];

    if (exitsToDisplay.length === 0) {
      for (const neighbor of neighbors) {
        const neighborCoord = formatHexCoordinate(neighbor.x, neighbor.y, '{X}.{Y}');
        const terrain = await getHexTerrainFromMap(currentMapPath, neighbor);

        exitsToDisplay.push({
          position: neighbor.position,
          coord: neighborCoord,
          terrain: terrain || 'empty',
        });
      }

      // Sort by position
      exitsToDisplay.sort((a, b) => a.position - b.position);
    }

    if (mapInfo.level || mapInfo.terrain || mapInfo.feature || exitsToDisplay.length > 0) {
      const infoDiv = resultsContainer.createDiv({
        cls: 'tag-tally-hex-info',
        attr: {
          style: 'margin-bottom: 16px; padding: 12px; background: var(--background-secondary); border-radius: 4px;',
        },
      });

      // Copy button
      const copyButton = infoDiv.createEl('button', {
        cls: 'clickable-icon',
        attr: {
          style: 'float: right; margin-bottom: 8px;',
          'aria-label': 'Copy',
        },
      });
      setIcon(copyButton, 'copy');

      // Level
      if (mapInfo.level) {
        const levelDiv = infoDiv.createDiv({ attr: { style: 'margin: 4px 0;' } });
        levelDiv.createEl('strong', { text: 'Level: ' });
        levelDiv.createEl('span', { text: mapInfo.level });
      }

      // Terrain/District
      if (mapInfo.terrain) {
        const terrainLabel = themeSelect.value === 'city' || themeSelect.value === 'modern' ? 'District' : 'Terrain';
        const terrainDiv = infoDiv.createDiv({ attr: { style: 'margin: 4px 0;' } });
        terrainDiv.createEl('strong', { text: `${terrainLabel}: ` });
        terrainDiv.createEl('span', { text: mapInfo.terrain });
      }

      // Feature
      if (mapInfo.feature) {
        const featureDiv = infoDiv.createDiv({ attr: { style: 'margin: 4px 0;' } });
        featureDiv.createEl('strong', { text: 'Feature: ' });
        featureDiv.createEl('span', { text: mapInfo.feature });
      }

      // Landmark
      if (mapInfo.landmark) {
        const landmarkDiv = infoDiv.createDiv({ attr: { style: 'margin: 4px 0;' } });
        landmarkDiv.createEl('strong', { text: 'Landmark: ' });
        landmarkDiv.createEl('span', { text: mapInfo.landmark });
      }

      // Faction
      if (mapInfo.faction) {
        const factionDiv = infoDiv.createDiv({ attr: { style: 'margin: 4px 0;' } });
        factionDiv.createEl('strong', { text: 'Faction: ' });
        factionDiv.createEl('span', { text: mapInfo.faction });
      }

      // Exits - always show all 6 neighbors
      if (exitsToDisplay.length > 0) {
        const exitsDiv = infoDiv.createDiv({ attr: { style: 'margin-top: 8px;' } });
        exitsDiv.createEl('strong', {
          text: 'Exits:',
          attr: { style: 'display: block; margin-bottom: 4px;' },
        });

        const exitsList = exitsDiv.createDiv({
          attr: { style: 'margin-left: 16px;' },
        });

        exitsToDisplay.forEach((exit: { position: number; coord: string; terrain: string }) => {
          const exitItem = exitsList.createEl('div', {
            attr: { style: 'margin: 2px 0;' },
          });
          exitItem.createEl('span', { text: `${exit.position} (` });
          exitItem.createEl('span', { text: exit.coord });
          exitItem.createEl('span', { text: `) → ` });
          if (exit.terrain === 'empty') {
            exitItem.createEl('span', { text: 'empty' });
          } else {
            exitItem.createEl('span', { text: exit.terrain });
          }
        });
      }

      // Copy button handler
      copyButton.addEventListener('click', async () => {
        // Build markdown text
        let markdownText = '';

        // Level
        if (mapInfo.level) {
          markdownText += `**Level:** ${mapInfo.level}\n`;
        }

        // Terrain/District
        if (mapInfo.terrain) {
          const terrainLabel = themeSelect.value === 'city' || themeSelect.value === 'modern' ? 'District' : 'Terrain';
          markdownText += `**${terrainLabel}:** ${mapInfo.terrain}\n`;
        }

        // Feature
        if (mapInfo.feature) {
          markdownText += `**Feature:** ${mapInfo.feature}\n`;
        }

        // Point of Interest
        if (mapInfo.landmark) {
          markdownText += `**Landmark:** ${mapInfo.landmark}\n`;
        }
        if (mapInfo.faction) {
          markdownText += `**Faction:** ${mapInfo.faction}\n`;
        }
        // Exits
        if (exitsToDisplay.length > 0) {
          markdownText += `**Exits:**\n`;
          exitsToDisplay.forEach((exit: { position: number; coord: string; terrain: string }) => {
            markdownText += `- ${exit.position} (${exit.coord}) → ${exit.terrain}\n`;
          });
        }

        try {
          await navigator.clipboard.writeText(markdownText.trim());
          // Temporarily change icon to show success
          setIcon(copyButton, 'check');
          setTimeout(() => {
            setIcon(copyButton, 'copy');
          }, 1000);
        } catch (err) {
          console.error('Failed to copy text:', err);
          new Notice('Failed to copy to clipboard');
        }
      });
    }

    // Show/hide Populate buttons based on whether hex has level and feature
    if (coord && currentMapPath) {
      const hasLevel = !!mapInfo.level;
      const hasFeature = !!mapInfo.feature;
      if (!hasLevel || !hasFeature) {
        populateButton.style.display = '';
        populateCurrentButton.style.display = '';
      } else {
        populateButton.style.display = 'none';
        populateCurrentButton.style.display = 'none';
      }
    } else {
      populateButton.style.display = 'none';
      populateCurrentButton.style.display = 'none';
    }
  }

  // Save input value when it changes (but don't update display)
  hexInput.addEventListener('input', async () => {
    await onHexInputChanged(hexInput.value);
    // Display only updates when Move button is clicked
  });

  const resultsContainer = hexCalculatorContainer.createDiv({
    cls: 'tag-tally-hex-results',
    attr: { style: 'display: none;' },
  });

  // Entry result box: event + insights when entering a hex (transient; copyable for journal, not stored in hex note)
  const entryResultContainer = hexCalculatorContainer.createDiv({
    cls: 'tag-tally-entry-result',
    attr: { style: 'display: none; margin-bottom: 12px;' },
  });
  let entryResultVueUnmount: (() => void) | null = null;

  // Create hex calculator section (below hex information display)
  const calculatorContainer = hexCalculatorContainer.createDiv({
    cls: 'tag-tally-hex-calculator-row',
    attr: { style: 'display: flex; align-items: center; gap: 8px; margin-top: 12px; margin-bottom: 12px;' },
  });

  // Direction select
  const directionSelect = calculatorContainer.createEl('select', {
    cls: 'tag-tally-select tag-tally-control',
    attr: {
      id: 'direction-select',
      style: 'width: 80px; min-height: 2.5rem;',
    },
  });
  for (let i = 1; i <= 6; i++) {
    directionSelect.createEl('option', { text: i.toString(), value: i.toString() });
  }

  // Distance input
  const distanceInput = calculatorContainer.createEl('input', {
    type: 'number',
    cls: 'tag-tally-input tag-tally-control',
    attr: {
      id: 'distance-input',
      min: '1',
      placeholder: 'Distance',
      style: 'width: 80px; min-height: 2.5rem; box-sizing: border-box;',
    },
  });

  // Random button
  const randomButton = calculatorContainer.createEl('button', {
    cls: 'clickable-icon',
    attr: { 'aria-label': 'Random Direction and Distance' },
  });
  setIcon(randomButton, 'dice');

  // Calculate button
  const calculateButton = calculatorContainer.createEl('button', {
    cls: 'clickable-icon',
    attr: {
      id: 'calculate-button',
      'aria-label': 'Calculate',
    },
  });
  setIcon(calculateButton, 'drafting-compass');

  // Results display area
  const calculatorResults = hexCalculatorContainer.createDiv({
    cls: 'tag-tally-calculator-results',
    attr: {
      id: 'calculator-results',
      style:
        'display: none; margin-top: 8px; padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 4px;',
    },
  });

  // Function to get map info (level, terrain, feature/difficulty, exits) from textmapper hex entries
  // Now accepts a coordinate parameter to get info for any hex, not just 0000
  async function getMapInfoFromTextMapper(
    mapPath: string | null,
    hexCoord: { x: number; y: number } = { x: 0, y: 0 },
    themeOverride?: string,
  ): Promise<{
    level?: string;
    terrain?: string;
    feature?: string;
    landmark?: string;
    event?: string;
    faction?: string;
    exits: Array<{ position: number; coord: string; terrain: string }>;
  }> {
    const result: {
      level?: string;
      terrain?: string;
      feature?: string;
      landmark?: string;
      event?: string;
      faction?: string;
      exits: Array<{ position: number; coord: string; terrain: string }>;
    } = {
      exits: [],
    };

    if (!mapPath) return result;

    try {
      const file = app.vault.getAbstractFileByPath(mapPath);
      if (!file || !(file instanceof TFile)) return result;

      const content = await app.vault.read(file);

      // Extract textmapper code block
      const codeBlockRegex = /```text-mapper\n([\s\S]*?)```/;
      const match = content.match(codeBlockRegex);
      if (!match) return result;

      const textMapperSource = match[1];
      const lines = textMapperSource.split('\n');

      // Format the target hex coordinate
      const targetCoord = formatHexCoordinate(hexCoord.x, hexCoord.y, '{X}{Y}');

      // Find the target hex entry
      const mainHexLine = lines.find((line) => {
        const trimmed = line.trim();
        return trimmed.startsWith(targetCoord) && !trimmed.startsWith('#');
      });
      if (!mainHexLine) return result;

      // Check for hex link first - if it exists, read from hex note
      const hexLink = extractHexLinkFromHexLine(mainHexLine);
      if (hexLink) {
        // Extract hex ID from link (format: "mapId/XXYY|XX.YY" or "XXYY|XX.YY")
        const hexIdMatch = hexLink.match(/^([^|]+)/);
        if (hexIdMatch) {
          const hexNoteInfo = await readHexNote(app, mapPath, hexCoord);
          if (hexNoteInfo) {
            if (hexNoteInfo.level) result.level = hexNoteInfo.level;
            if (hexNoteInfo.terrain) {
              // Check if terrain is an error message and skip if so
              if (!hexNoteInfo.terrain.toLowerCase().includes('[table not found:')) {
                result.terrain = hexNoteInfo.terrain;
              }
            }
            if (hexNoteInfo.feature) result.feature = hexNoteInfo.feature;
            if (hexNoteInfo.landmark) result.landmark = hexNoteInfo.landmark;
          }
        }
      }

      // If we didn't get info from hex note, fall back to parsing tags
      if (!result.level || !result.terrain || !result.feature) {
        // Parse the hex entry
        const mainHexMatch = mainHexLine.trim().match(new RegExp(`^${targetCoord}\\s+(.+)`));
        if (mainHexMatch) {
          const lineContent = mainHexMatch[1];
          // Remove hex link from content before parsing tags
          const contentWithoutLink = lineContent.replace(/"([^"]+\|[^"]+)"/, '').trim();
          const tags = contentWithoutLink.split(/\s+/).filter((tag) => tag.length > 0);

          // Extract level (only if not already set from hex note)
          if (!result.level) {
            const levelTag = tags.find((tag) => tag.startsWith('level-'));
            if (levelTag) {
              result.level = levelTag.replace('level-', '');
            }
          }

          // Extract terrain (only if not already set from hex note)
          if (!result.terrain) {
            // Extract bg tag (ends with -bg)
            const bgTag = tags.find((tag) => tag.endsWith('-bg'));
            const bgName = bgTag ? bgTag.replace(/-bg$/, '') : null;

            const terrainTag = tags.find(
              (tag) =>
                !tag.endsWith('-bg') &&
                tag !== 'easy' &&
                tag !== 'rough' &&
                tag !== 'dangerous' &&
                !tag.startsWith('level-'),
            );

            if (terrainTag) {
              const terrainName = terrainTag;
              const terrain = terrainTag.charAt(0).toUpperCase() + terrainTag.slice(1).replace(/-/g, ' ');

              // If bg and terrain don't match, format as "bg (terrain)"
              if (bgName && bgName !== terrainName) {
                const bgFormatted = bgName.charAt(0).toUpperCase() + bgName.slice(1).replace(/-/g, ' ');
                result.terrain = `${bgFormatted} (${terrain})`;
              } else {
                result.terrain = terrain;
              }
            }
          }

          // Generate feature if needed (only if not already set from hex note)
          if (!result.feature) {
            const hasDifficulty = tags.includes('easy') || tags.includes('rough') || tags.includes('dangerous');
            if (hasDifficulty) {
              try {
                const tableStore = getTableStore();
                // Determine which table to use based on theme
                const currentTheme = themeOverride || themeSelect.value;
                const featureTableName =
                  currentTheme === 'city' || currentTheme === 'modern' ? 'modern-feature' : 'terrain-feature';
                const featureResult = tableStore.random(featureTableName);
                result.feature = featureResult.result.trim();
              } catch (error) {
                console.error('Error generating feature for display:', error);
              }
            }
          }
        }
      }

      // Calculate neighbors for the target hex
      const neighbors = calculateHexNeighbors(hexCoord.x, hexCoord.y);

      // Parse each line to find neighbor hexes
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('id') || trimmed.startsWith('option')) continue;

        // Parse hex coordinate and tags
        const hexMatch = trimmed.match(/^(-?\d{2})(-?\d{2})\s+(.+)/);
        if (!hexMatch) continue;

        const x = parseInt(hexMatch[1], 10);
        const y = parseInt(hexMatch[2], 10);

        // Find if this is a neighbor of the target hex
        const neighbor = neighbors.find((n) => n.x === x && n.y === y);
        if (neighbor) {
          // Check for hex link first
          const neighborHexLink = extractHexLinkFromHexLine(line);
          let terrain: string | undefined;

          if (neighborHexLink) {
            // Try to read from hex note
            const hexNoteInfo = await readHexNote(app, mapPath, { x, y });
            if (hexNoteInfo && hexNoteInfo.terrain) {
              // Check if terrain is an error message and skip if so
              if (!hexNoteInfo.terrain.toLowerCase().includes('[table not found:')) {
                terrain = hexNoteInfo.terrain;
              }
            }
          }

          // Fall back to parsing tags if no terrain from hex note
          if (!terrain) {
            // Remove hex link from content before parsing tags
            const lineContent = hexMatch[3];
            const contentWithoutLink = lineContent.replace(/"([^"]+\|[^"]+)"/, '').trim();
            const cleanTags = contentWithoutLink.split(/\s+/).filter((tag) => tag.length > 0);

            // Extract bg tag (ends with -bg)
            const bgTag = cleanTags.find((tag) => tag.endsWith('-bg'));
            const bgName = bgTag ? bgTag.replace(/-bg$/, '') : null;

            // Extract terrain from tags (first non-bg, non-difficulty, non-level tag)
            const terrainTag = cleanTags.find(
              (tag) =>
                !tag.endsWith('-bg') &&
                tag !== 'easy' &&
                tag !== 'rough' &&
                tag !== 'dangerous' &&
                !tag.startsWith('level-'),
            );

            if (terrainTag) {
              const terrainName = terrainTag;
              const terrainFormatted = terrainTag.charAt(0).toUpperCase() + terrainTag.slice(1).replace(/-/g, ' ');

              // If bg and terrain don't match, format as "bg (terrain)"
              if (bgName && bgName !== terrainName) {
                const bgFormatted = bgName.charAt(0).toUpperCase() + bgName.slice(1).replace(/-/g, ' ');
                terrain = `${bgFormatted} (${terrainFormatted})`;
              } else {
                terrain = terrainFormatted;
              }
            }
          }

          if (terrain) {
            const formatted = formatHexCoordinate(x, y, '{X}.{Y}');
            result.exits.push({
              position: neighbor.position,
              coord: formatted,
              terrain: terrain,
            });
          }
        }
      }

      // Sort exits by position
      result.exits.sort((a, b) => a.position - b.position);
      return result;
    } catch (error) {
      console.error('Error reading map info:', error);
    }

    return result;
  }

  moveButton.addEventListener('click', async () => {
    const input = hexInput.value.trim();
    if (!input) {
      new Notice('Please enter a hex coordinate');
      return;
    }

    const coord = parseHexCoordinate(input);
    if (!coord) {
      new Notice('Invalid coordinate format. Use 00.00, 0000, or 00 00');
      return;
    }

    if (!currentSelectedMapPath) {
      new Notice('Please select a map first');
      return;
    }

    // Remember previous coordinates before moving (the currently displayed coordinate)
    if (currentDisplayedCoord) {
      previousCoord = { ...currentDisplayedCoord };
    }

    // Add new coordinate to movement path if it's not already the last one
    const lastPathCoord = movementPath.length > 0 ? movementPath[movementPath.length - 1] : null;
    if (!lastPathCoord || lastPathCoord.x !== coord.x || lastPathCoord.y !== coord.y) {
      movementPath.push({ ...coord });
    }

    // Update road path in textmapper
    try {
      const file = app.vault.getAbstractFileByPath(currentSelectedMapPath);
      if (!file || !(file instanceof TFile)) {
        new Notice('Map file not found');
        return;
      }

      const content = await app.vault.read(file);

      // Extract textmapper code block
      const codeBlockRegex = /```text-mapper\n([\s\S]*?)```/;
      const match = content.match(codeBlockRegex);
      if (!match) {
        new Notice('Could not find textmapper block in map file');
        return;
      }

      const textMapperSource = match[1];
      const lines = textMapperSource.split('\n');

      // Update centered-at option to the new coordinates
      const centeredAtCoord = formatHexCoordinate(coord.x, coord.y, '{X} {Y}');
      let centeredAtIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('option centered-at')) {
          centeredAtIndex = i;
          break;
        }
      }

      if (centeredAtIndex >= 0) {
        // Update existing centered-at option
        lines[centeredAtIndex] = `option centered-at ${centeredAtCoord}`;
      } else {
        // Add centered-at option after other option lines
        const optionIndex = lines.findIndex((line) => line.trim().startsWith('option'));
        if (optionIndex >= 0) {
          // Find the last option line
          let lastOptionIndex = optionIndex;
          for (let i = optionIndex + 1; i < lines.length; i++) {
            if (lines[i].trim().startsWith('option')) {
              lastOptionIndex = i;
            } else {
              break;
            }
          }
          lines.splice(lastOptionIndex + 1, 0, `option centered-at ${centeredAtCoord}`);
        } else {
          // Add after id line
          const idIndex = lines.findIndex((line) => line.trim().startsWith('id'));
          if (idIndex >= 0) {
            lines.splice(idIndex + 1, 0, `option centered-at ${centeredAtCoord}`);
          } else {
            lines.splice(1, 0, `option centered-at ${centeredAtCoord}`);
          }
        }
      }

      // Build road path string (format: 0000-0100-0200 road)
      const roadPathString = movementPath.map((c) => formatHexCoordinate(c.x, c.y, '{X}{Y}')).join('-');

      // Find existing road path line or add it
      let roadPathIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        // Check if line ends with "road" and contains hex coordinates
        if (trimmed.endsWith(' road') || trimmed.match(/^-?\d{2}-?\d{2}(?:-?\d{2}-?\d{2})+\s+road$/)) {
          roadPathIndex = i;
          break;
        }
      }

      if (roadPathIndex >= 0) {
        // Update existing road path
        lines[roadPathIndex] = `${roadPathString} road`;
      } else {
        // Add new road path after option line or at the end
        const optionIndex = lines.findIndex((line) => line.trim().startsWith('option'));
        if (optionIndex >= 0) {
          lines.splice(optionIndex + 1, 0, `${roadPathString} road`);
        } else {
          // Find where to insert (after id line)
          const idIndex = lines.findIndex((line) => line.trim().startsWith('id'));
          if (idIndex >= 0) {
            lines.splice(idIndex + 1, 0, `${roadPathString} road`);
          } else {
            lines.push(`${roadPathString} road`);
          }
        }
      }

      // Rebuild textmapper block
      const newTextMapperSource = lines.join('\n');
      const newContent = content.replace(codeBlockRegex, `\`\`\`text-mapper\n${newTextMapperSource}\n\`\`\``);

      // Write updated content
      await app.vault.modify(file, newContent);
    } catch (error) {
      console.error('Error updating road path:', error);
      // Continue even if road update fails
    }

    // Save the hex input value
    await onHexInputChanged(hexInput.value);

    // Roll for event and insights when entering a hex (transient; show in sidebar result box for copy to journal, not stored in hex note)
    let eventText: string | null = null;
    let insightsStr: string | null = null;
    try {
      const tableStore = getTableStore();
      const currentTheme = (container.querySelector('#theme-select') as HTMLSelectElement)?.value || theme;
      const eventTableName = currentTheme === 'modern' ? 'modern-event-type' : 'event-type';
      const eventResult = tableStore.random(eventTableName);
      eventText = eventResult.result.trim();

      try {
        const insightsResult = runResolution({
          resolutionType: 'insights',
          level: 5,
          likelihoodMod: 0,
          questionOrAction: '',
        });
        insightsStr = formatResolveOutput(insightsResult).trimEnd();
      } catch (e) {
        console.error('Error rolling insights:', e);
      }

      // Show event + insights in shared-ui ResultBox (copyable for journal); do not write to hex note
      const hexDisplay = formatHexCoordinate(coord.x, coord.y, '{X}.{Y}');
      const copyValue = `**Entered hex ${hexDisplay}**\n**Event:** ${eventText || '—'}\n**Insights:**\n${insightsStr || '—'}`;
      const escapeHtml = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const displayContent = `<strong>Entered hex ${escapeHtml(hexDisplay)}</strong><div style="margin: 4px 0;"><strong>Event:</strong> ${escapeHtml(eventText || '—')}</div><div style="margin: 4px 0; white-space: pre-wrap;"><strong>Insights:</strong><br>${escapeHtml(insightsStr || '—')}</div>`;
      if (entryResultVueUnmount) {
        entryResultVueUnmount();
        entryResultVueUnmount = null;
      }
      entryResultContainer.empty();
      entryResultContainer.style.display = 'block';
      const mountPoint = entryResultContainer.createDiv();
      const vueApp = createApp(ResultBox, {
        copyValue,
        content: displayContent,
        contentMode: 'html',
      });
      vueApp.mount(mountPoint);
      entryResultVueUnmount = () => {
        vueApp.unmount();
      };
    } catch (error) {
      console.error('Error generating event:', error);
    }

    // Update display with the new hex coordinate
    await updateMapInfoDisplay(coord);
  });

  // Locate button handler - updates display without moving or updating path
  locateButton.addEventListener('click', async () => {
    const input = hexInput.value.trim();
    if (!input) {
      new Notice('Please enter a hex coordinate');
      return;
    }

    const coord = parseHexCoordinate(input);
    if (!coord) {
      new Notice('Invalid coordinate format. Use 00.00, 0000, or 00 00');
      return;
    }

    if (!currentSelectedMapPath) {
      new Notice('Please select a map first');
      return;
    }

    // Update the display
    await updateMapInfoDisplay(coord);

    // Update centered-at option in the file so map centers when rendered
    try {
      const file = app.vault.getAbstractFileByPath(currentSelectedMapPath);
      if (file && file instanceof TFile) {
        const content = await app.vault.read(file);
        const codeBlockRegex = /```text-mapper\n([\s\S]*?)```/;
        const match = content.match(codeBlockRegex);
        if (match) {
          const textMapperSource = match[1];
          const lines = textMapperSource.split('\n');
          // Write coordinates directly as numbers (not formatted) for centered-at option
          // This handles negative coordinates correctly: "option centered-at -38 -15"
          const centeredAtCoord = `${coord.x} ${coord.y}`;

          // Find or add centered-at option
          let centeredAtIndex = -1;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('option centered-at')) {
              centeredAtIndex = i;
              break;
            }
          }

          if (centeredAtIndex >= 0) {
            lines[centeredAtIndex] = `option centered-at ${centeredAtCoord}`;
          } else {
            // Add centered-at option after other option lines
            const optionIndex = lines.findIndex((line) => line.trim().startsWith('option'));
            if (optionIndex >= 0) {
              let lastOptionIndex = optionIndex;
              for (let i = optionIndex + 1; i < lines.length; i++) {
                if (lines[i].trim().startsWith('option')) {
                  lastOptionIndex = i;
                } else {
                  break;
                }
              }
              lines.splice(lastOptionIndex + 1, 0, `option centered-at ${centeredAtCoord}`);
            } else {
              const idIndex = lines.findIndex((line) => line.trim().startsWith('id'));
              if (idIndex >= 0) {
                lines.splice(idIndex + 1, 0, `option centered-at ${centeredAtCoord}`);
              } else {
                lines.splice(1, 0, `option centered-at ${centeredAtCoord}`);
              }
            }
          }

          const newTextMapperSource = lines.join('\n');
          const newContent = content.replace(codeBlockRegex, `\`\`\`text-mapper\n${newTextMapperSource}\n\`\`\``);
          await app.vault.modify(file, newContent);
        }
      }
    } catch (error) {
      console.error('Error updating centered-at option:', error);
    }

    // Center the map on the hex coordinate (if mapper is already loaded)
    // Access plugin through app.plugins (exists at runtime but not in TypeScript types)
    interface TextMapper {
      centerOnHex(x: number, y: number): void;
    }
    interface PluginWithMapper {
      getMapperBySourcePath(sourcePath: string): TextMapper | null;
    }
    const plugin = (app as { plugins?: { getPlugin(id: string): PluginWithMapper | null } }).plugins?.getPlugin(
      'tag-and-tally',
    );
    if (plugin) {
      // Normalize the path (remove leading slash if present)
      const normalizedPath = currentSelectedMapPath.startsWith('/')
        ? currentSelectedMapPath.substring(1)
        : currentSelectedMapPath;

      // Try to find the mapper by source path
      let mapper = plugin.getMapperBySourcePath(normalizedPath);

      // Also try with leading slash
      if (!mapper) {
        mapper = plugin.getMapperBySourcePath('/' + normalizedPath);
      }

      // If not found, wait a bit and try again (map might still be rendering)
      if (!mapper) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        mapper = plugin.getMapperBySourcePath(normalizedPath);
        if (!mapper) {
          mapper = plugin.getMapperBySourcePath('/' + normalizedPath);
        }
      }

      if (mapper) {
        mapper.centerOnHex(coord.x, coord.y);
      }
    }
  });

  // Allow Enter key to trigger locate
  hexInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      locateButton.click();
    }
  });

  // Populate button handler
  populateButton.addEventListener('click', async () => {
    const input = hexInput.value.trim();
    if (!input || !currentSelectedMapPath) {
      new Notice('Please enter a hex coordinate and select a map');
      return;
    }

    const coord = parseHexCoordinate(input);
    if (!coord) {
      new Notice('Invalid coordinate format. Use 00.00, 0000, or 00 00');
      return;
    }

    try {
      const file = app.vault.getAbstractFileByPath(currentSelectedMapPath);
      if (!file || !(file instanceof TFile)) {
        new Notice('Map file not found');
        return;
      }

      // Get current map info
      const mapInfo = await getMapInfoFromTextMapper(currentSelectedMapPath, coord);
      const needsLevel = !mapInfo.level;
      const needsFeature = !mapInfo.feature;

      // Get table store
      const tableStore = getTableStore();
      const selectedTheme = themeSelect.value;

      // Read current content
      const content = await app.vault.read(file);

      // Extract mapId from frontmatter for hex links
      const mapFrontmatter = parseFrontmatter(content);
      const currentMapId = mapFrontmatter?.mapId || null;

      // Extract textmapper code block
      const codeBlockRegex = /```text-mapper\n([\s\S]*?)```/;
      const match = content.match(codeBlockRegex);
      if (!match) {
        new Notice('Could not find textmapper block in map file');
        return;
      }

      const textMapperSource = match[1];
      const lines = textMapperSource.split('\n');

      // Format the target hex coordinate
      const targetCoord = formatHexCoordinate(coord.x, coord.y, '{X}{Y}');

      // Find the hex entry line
      let hexLineIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (
          trimmed.startsWith(targetCoord) &&
          !trimmed.startsWith('#') &&
          !trimmed.startsWith('id') &&
          !trimmed.startsWith('option')
        ) {
          hexLineIndex = i;
          break;
        }
      }

      // Generate level if needed based on previous hex level
      let level: number | null = null;
      if (needsLevel) {
        let leavingHexLevel: number | null = null;

        // Try to get level from previousCoord (hex we left)
        if (previousCoord) {
          const previousMapInfo = await getMapInfoFromTextMapper(currentSelectedMapPath, previousCoord);
          if (previousMapInfo.level) {
            leavingHexLevel = parseInt(previousMapInfo.level, 10);
          }
        }

        // If no previous hex level, try to get from current hex (in case it exists but doesn't have level)
        if (leavingHexLevel === null && mapInfo.level) {
          leavingHexLevel = parseInt(mapInfo.level, 10);
        }

        // Determine dice formula based on leaving hex level
        let diceFormula = '1d4+2'; // Default for level 1-2
        if (leavingHexLevel !== null) {
          if (leavingHexLevel >= 1 && leavingHexLevel <= 2) {
            diceFormula = '1d4+2'; // Range 3-6
          } else if (leavingHexLevel >= 3 && leavingHexLevel <= 4) {
            diceFormula = '1d6+2'; // Range 3-8
          } else if (leavingHexLevel >= 5 && leavingHexLevel <= 6) {
            diceFormula = '1d8+2'; // Range 3-10
          } else if (leavingHexLevel >= 7 && leavingHexLevel <= 10) {
            diceFormula = '1d10+2'; // Range 3-10
          } else if (leavingHexLevel >= 11 && leavingHexLevel <= 12) {
            // Level 11-12 on tier 4 scene is level 10
            level = 10;
          }
        }

        if (level === null) {
          const levelRoll = new DiceRoll(diceFormula);
          level = levelRoll.total;
        }
      } else if (mapInfo.level) {
        level = parseInt(mapInfo.level, 10);
      }

      // Generate feature if needed
      let featureText: string | null = null;
      let difficulty = '';
      if (needsFeature) {
        const featureTableName =
          selectedTheme === 'city' || selectedTheme === 'modern' ? 'modern-feature' : 'terrain-feature';
        const featureResult = tableStore.random(featureTableName);
        featureText = featureResult.result.trim();

        // Extract difficulty
        if (featureText.includes('(Easy)')) {
          difficulty = 'easy';
        } else if (featureText.includes('(Rough)')) {
          difficulty = 'rough';
        } else if (featureText.includes('(Dangerous)')) {
          difficulty = 'dangerous';
        }
      }

      // Generate Landmark
      let landmark: string | null = null;
      try {
        const landmarkResult = tableStore.random('landmark-type');
        let landmarkText = landmarkResult.result.trim();

        // If landmark is "Geographic" and theme is city, roll on city-geographic-landmark table
        if (landmarkText === 'Geographic' && selectedTheme === 'city') {
          try {
            const geoLandmarkResult = tableStore.random('city-geographic-landmark');
            landmarkText = geoLandmarkResult.result.trim();
          } catch (error) {
            console.error('Error generating city geographic landmark:', error);
            // Keep "Geographic" as fallback
          }
        }

        landmark = landmarkText;
      } catch (error) {
        console.error('Error generating landmark:', error);
      }

      // Generate Faction for modern theme
      let faction: string | null = null;
      if (selectedTheme === 'modern') {
        try {
          const factionRoll = new DiceRoll('2d6');
          const factionTotal = factionRoll.total;
          if (factionTotal >= 2 && factionTotal <= 3) {
            faction = 'New Faction HQ';
          } else if (factionTotal >= 4 && factionTotal <= 5) {
            faction = 'Known Faction HQ';
          } else {
            faction = 'No Faction HQ';
          }
        } catch (error) {
          console.error('Error generating faction:', error);
        }
      }

      // Get current terrain (or generate if needed)
      let terrain: string | null = mapInfo.terrain;
      // If terrain is "ghost" or "empty", generate a new terrain to replace it
      if (!terrain || terrain.toLowerCase() === 'ghost' || terrain.toLowerCase() === 'empty') {
        const mainTableName =
          selectedTheme === 'city' ? 'fantasy-districts' : selectedTheme === 'modern' ? 'districts' : 'terrain';
        const mainResult = tableStore.random(mainTableName);
        terrain = mainResult.result.trim();
      }

      // Calculate neighbors
      const neighbors = calculateHexNeighbors(coord.x, coord.y);

      // Get empty neighbors (those that show "empty" in exits or have "ghost"/"empty" terrain)
      const emptyNeighbors: Array<{ x: number; y: number; position: number }> = [];
      for (const neighbor of neighbors) {
        const neighborTerrain = await getHexTerrainFromMap(currentSelectedMapPath, neighbor);
        if (
          !neighborTerrain ||
          neighborTerrain.toLowerCase() === 'ghost' ||
          neighborTerrain.toLowerCase() === 'empty'
        ) {
          emptyNeighbors.push(neighbor);
        }
      }

      // Generate terrain for empty neighbors
      const neighborTerrains: Array<{ x: number; y: number; position: number; terrain: string }> = [];
      if (terrain) {
        for (const neighbor of emptyNeighbors) {
          // Roll for adjacent terrain/district using current hex's terrain
          const adjacentTableName =
            selectedTheme === 'city'
              ? `modern-adjacent-${terrain.toLowerCase().replace(/\s+/g, '-')}`
              : selectedTheme === 'modern'
                ? `modern-adjacent-${terrain.toLowerCase().replace(/\s+/g, '-')}`
                : `terrain-adjacent-${terrain.toLowerCase()}`;

          let neighborTerrain: string | null = null;

          // Check if primary table exists for current hex
          if (tableStore.hasTable(adjacentTableName)) {
            const adjacentResult = tableStore.random(adjacentTableName);
            neighborTerrain = adjacentResult.result.trim();
          } else {
            // If primary table doesn't exist (switched themes), use theme default fallback
            const fallbackTableName =
              selectedTheme === 'city'
                ? 'fantasy-adjacent-central'
                : selectedTheme === 'modern'
                  ? 'modern-adjacent-downtown'
                  : 'terrain-adjacent-plains';

            if (tableStore.hasTable(fallbackTableName)) {
              const fallbackResult = tableStore.random(fallbackTableName);
              neighborTerrain = fallbackResult.result.trim();
            } else {
              // If fallback table also doesn't exist, use default terrain value
              neighborTerrain = selectedTheme === 'city' || selectedTheme === 'modern' ? 'plains' : 'center';
            }
          }

          // Final safety check - ensure we never store an error message
          if (neighborTerrain && neighborTerrain.toLowerCase().includes('[table not found:')) {
            neighborTerrain = selectedTheme === 'city' || selectedTheme === 'modern' ? 'plains' : 'center';
          }

          neighborTerrains.push({
            x: neighbor.x,
            y: neighbor.y,
            position: neighbor.position,
            terrain: neighborTerrain,
          });
        }
      }

      // Update or create main hex entry
      if (!terrain) {
        new Notice('Could not determine terrain for hex');
        return;
      }

      // Calculate exits for the current hex (all 6 neighbors)
      const allNeighbors = calculateHexNeighbors(coord.x, coord.y);
      const exitsForNote: Array<{ position: number; coord: string; terrain: string }> = [];
      for (const neighbor of allNeighbors) {
        const neighborCoord = formatHexCoordinate(neighbor.x, neighbor.y, '{X}.{Y}');
        // Check if this neighbor is in the neighborTerrains (newly generated) or already exists in map
        const neighborTerrainInfo = neighborTerrains.find((nt) => nt.x === neighbor.x && nt.y === neighbor.y);
        if (neighborTerrainInfo) {
          exitsForNote.push({
            position: neighbor.position,
            coord: neighborCoord,
            terrain: neighborTerrainInfo.terrain,
          });
        } else {
          // Check if it exists in the map
          const existingTerrain = await getHexTerrainFromMap(currentSelectedMapPath, neighbor);
          exitsForNote.push({
            position: neighbor.position,
            coord: neighborCoord,
            terrain: existingTerrain || 'empty',
          });
        }
      }
      exitsForNote.sort((a, b) => a.position - b.position);

      // Create or update hex note (no insights on creation; insights are rolled when entering the hex)
      const hexId = formatHexCoordinate(coord.x, coord.y, '{X}{Y}');
      const hexDisplay = formatHexCoordinate(coord.x, coord.y, '{X}.{Y}');
      await createOrUpdateHexNote(
        app,
        currentSelectedMapPath,
        coord,
        level,
        terrain,
        featureText,
        exitsForNote,
        selectedTheme as 'terrain' | 'city' | 'modern',
        landmark,
        faction,
      );

      if (hexLineIndex >= 0) {
        // Update existing hex line
        const existingLine = lines[hexLineIndex];
        // Remove existing hex link if present
        const lineWithoutLink = existingLine.replace(/"([^"]+\|[^"]+)"/, '').trim();
        const existingTags = lineWithoutLink
          .replace(new RegExp(`^${targetCoord}\\s+`), '')
          .split(/\s+/)
          .filter((tag) => tag.length > 0);

        // Build new tags
        const terrainNormalized = terrain.toLowerCase().replace(/\s+/g, '-');
        const newTags: string[] = [];

        // Add bg and terrain
        const bgIndex = existingTags.findIndex((tag) => tag.endsWith('-bg'));
        if (bgIndex >= 0) {
          existingTags[bgIndex] = `${terrainNormalized}-bg`;
        } else {
          newTags.push(`${terrainNormalized}-bg`);
        }

        // Add terrain if not already present
        if (!existingTags.includes(terrainNormalized)) {
          newTags.push(terrainNormalized);
        }

        // Add difficulty if feature was generated
        if (difficulty && !existingTags.includes(difficulty)) {
          newTags.push(difficulty);
        }

        // Add level if generated
        if (level !== null) {
          const levelTag = `level-${level}`;
          const existingLevelIndex = existingTags.findIndex((tag) => tag.startsWith('level-'));
          if (existingLevelIndex >= 0) {
            existingTags[existingLevelIndex] = levelTag;
          } else {
            newTags.push(levelTag);
          }
        }

        // Keep other existing tags that aren't bg, difficulty, or level
        // Also remove ghost and empty tags when updating hex coordinates
        const otherTags = existingTags.filter(
          (tag) =>
            !tag.endsWith('-bg') &&
            tag !== 'easy' &&
            tag !== 'rough' &&
            tag !== 'dangerous' &&
            !tag.startsWith('level-') &&
            tag !== terrainNormalized &&
            tag.toLowerCase() !== 'ghost' &&
            tag.toLowerCase() !== 'empty',
        );

        // Combine all tags
        const allTags = [
          ...existingTags.filter(
            (tag) => tag.endsWith('-bg') || tag === terrainNormalized || tag.startsWith('level-') || tag === difficulty,
          ),
          ...newTags,
          ...otherTags,
        ];
        lines[hexLineIndex] = addHexLinkToHexLine(
          `${targetCoord} ${allTags.join(' ')}`,
          hexId,
          hexDisplay,
          currentMapId,
        );
      } else {
        // Create new hex entry
        const terrainNormalized = terrain.toLowerCase().replace(/\s+/g, '-');
        const newTags = [`${terrainNormalized}-bg`, terrainNormalized];
        if (difficulty) {
          newTags.push(difficulty);
        }
        if (level !== null) {
          newTags.push(`level-${level}`);
        }
        lines.push(addHexLinkToHexLine(`${targetCoord} ${newTags.join(' ')}`, hexId, hexDisplay, currentMapId));
      }

      // Feature is not stored in the map, only displayed in the pane

      // Add or update neighbor hexes
      for (const neighborTerrain of neighborTerrains) {
        const neighborCoord = formatHexCoordinate(neighborTerrain.x, neighborTerrain.y, '{X}{Y}');
        const neighborTerrainNormalized = neighborTerrain.terrain.toLowerCase().replace(/\s+/g, '-');

        // Check if this hex already exists
        let neighborLineIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          if (
            trimmed.startsWith(neighborCoord) &&
            !trimmed.startsWith('#') &&
            !trimmed.startsWith('id') &&
            !trimmed.startsWith('option')
          ) {
            neighborLineIndex = i;
            break;
          }
        }

        if (neighborLineIndex >= 0) {
          // Hex exists - check if it has "ghost" or "empty" terrain and update it
          const existingLine = lines[neighborLineIndex];
          const lineMatch = existingLine.trim().match(new RegExp(`^${neighborCoord}\\s+(.+)`));
          if (lineMatch) {
            const lineContent = lineMatch[1];
            // Remove hex link if present
            const contentWithoutLink = lineContent.replace(/"([^"]+\|[^"]+)"/, '').trim();
            const existingTags = contentWithoutLink.split(/\s+/).filter((tag) => tag.length > 0);

            // Check if terrain is "ghost" or "empty"
            const terrainTag = existingTags.find(
              (tag) =>
                !tag.endsWith('-bg') &&
                tag !== 'easy' &&
                tag !== 'rough' &&
                tag !== 'dangerous' &&
                !tag.startsWith('level-'),
            );

            if (terrainTag && (terrainTag.toLowerCase() === 'ghost' || terrainTag.toLowerCase() === 'empty')) {
              // Replace ghost/empty terrain with new terrain
              const newTags: string[] = [];
              // Update or add bg tag
              const bgIndex = existingTags.findIndex((tag) => tag.endsWith('-bg'));
              if (bgIndex >= 0) {
                existingTags[bgIndex] = `${neighborTerrainNormalized}-bg`;
              } else {
                newTags.push(`${neighborTerrainNormalized}-bg`);
              }

              // Remove old terrain tags (ghost, empty)
              const filteredTags = existingTags.filter((tag) => tag !== terrainTag && !tag.endsWith('-bg'));

              // Add new terrain
              if (!filteredTags.includes(neighborTerrainNormalized)) {
                newTags.push(neighborTerrainNormalized);
              }

              // Combine tags
              const allTags = [...existingTags.filter((tag) => tag.endsWith('-bg')), ...newTags, ...filteredTags];
              lines[neighborLineIndex] = `${neighborCoord} ${allTags.join(' ')}`;
            }
          }
        } else {
          // Hex doesn't exist - create it
          // Don't create hex note or link for neighbor terrain - only create notes when hexes are moved into
          lines.push(`${neighborCoord} ${neighborTerrainNormalized}-bg ${neighborTerrainNormalized}`);
        }
      }

      // Rebuild textmapper block
      const newTextMapperSource = lines.join('\n');
      const newContent = content.replace(codeBlockRegex, `\`\`\`text-mapper\n${newTextMapperSource}\n\`\`\``);

      // Write updated content
      await app.vault.modify(file, newContent);

      new Notice(`Hex ${targetCoord} populated successfully`);

      // Refresh display
      await updateMapInfoDisplay(coord);
    } catch (error) {
      console.error('Error populating hex:', error);
      new Notice(`Error populating hex: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Populate Current Only button handler - only populates current hex without generating neighbor terrain
  populateCurrentButton.addEventListener('click', async () => {
    const input = hexInput.value.trim();
    if (!input || !currentSelectedMapPath) {
      new Notice('Please enter a hex coordinate and select a map');
      return;
    }

    const coord = parseHexCoordinate(input);
    if (!coord) {
      new Notice('Invalid coordinate format. Use 00.00, 0000, or 00 00');
      return;
    }

    try {
      const file = app.vault.getAbstractFileByPath(currentSelectedMapPath);
      if (!file || !(file instanceof TFile)) {
        new Notice('Map file not found');
        return;
      }

      // Get current map info
      const mapInfo = await getMapInfoFromTextMapper(currentSelectedMapPath, coord);
      const needsLevel = !mapInfo.level;
      const needsFeature = !mapInfo.feature;

      // Get table store
      const tableStore = getTableStore();
      const selectedTheme = themeSelect.value;

      // Read current content
      const content = await app.vault.read(file);

      // Extract mapId from frontmatter for hex links
      const mapFrontmatter = parseFrontmatter(content);
      const currentMapId = mapFrontmatter?.mapId || null;

      // Extract textmapper code block
      const codeBlockRegex = /```text-mapper\n([\s\S]*?)```/;
      const match = content.match(codeBlockRegex);
      if (!match) {
        new Notice('Could not find textmapper block in map file');
        return;
      }

      const textMapperSource = match[1];
      const lines = textMapperSource.split('\n');

      // Format the target hex coordinate
      const targetCoord = formatHexCoordinate(coord.x, coord.y, '{X}{Y}');

      // Find the hex entry line
      let hexLineIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (
          trimmed.startsWith(targetCoord) &&
          !trimmed.startsWith('#') &&
          !trimmed.startsWith('id') &&
          !trimmed.startsWith('option')
        ) {
          hexLineIndex = i;
          break;
        }
      }

      // Generate level if needed based on previous hex level
      let level: number | null = null;
      if (needsLevel) {
        let leavingHexLevel: number | null = null;

        // Try to get level from previousCoord (hex we left)
        if (previousCoord) {
          const previousMapInfo = await getMapInfoFromTextMapper(currentSelectedMapPath, previousCoord);
          if (previousMapInfo.level) {
            leavingHexLevel = parseInt(previousMapInfo.level, 10);
          }
        }

        // If no previous hex level, try to get from current hex (in case it exists but doesn't have level)
        if (leavingHexLevel === null && mapInfo.level) {
          leavingHexLevel = parseInt(mapInfo.level, 10);
        }

        // Determine dice formula based on leaving hex level
        let diceFormula = '1d4+2'; // Default for level 1-2
        if (leavingHexLevel !== null) {
          if (leavingHexLevel >= 1 && leavingHexLevel <= 2) {
            diceFormula = '1d4+2'; // Range 3-6
          } else if (leavingHexLevel >= 3 && leavingHexLevel <= 4) {
            diceFormula = '1d6+2'; // Range 3-8
          } else if (leavingHexLevel >= 5 && leavingHexLevel <= 6) {
            diceFormula = '1d8+2'; // Range 3-10
          } else if (leavingHexLevel >= 7 && leavingHexLevel <= 10) {
            diceFormula = '1d10+2'; // Range 3-10
          } else if (leavingHexLevel >= 11 && leavingHexLevel <= 12) {
            // Level 11-12 on tier 4 scene is level 10
            level = 10;
          }
        }

        if (level === null) {
          const levelRoll = new DiceRoll(diceFormula);
          level = levelRoll.total;
        }
      } else if (mapInfo.level) {
        level = parseInt(mapInfo.level, 10);
      }

      // Generate feature if needed
      let featureText: string | null = null;
      let difficulty = '';
      if (needsFeature) {
        const featureTableName =
          selectedTheme === 'city' || selectedTheme === 'modern' ? 'modern-feature' : 'terrain-feature';
        const featureResult = tableStore.random(featureTableName);
        featureText = featureResult.result.trim();

        // Extract difficulty
        if (featureText.includes('(Easy)')) {
          difficulty = 'easy';
        } else if (featureText.includes('(Rough)')) {
          difficulty = 'rough';
        } else if (featureText.includes('(Dangerous)')) {
          difficulty = 'dangerous';
        }
      }

      // Generate Landmark
      let landmark: string | null = null;
      try {
        const landmarkResult = tableStore.random('landmark-type');
        let landmarkText = landmarkResult.result.trim();

        // If landmark is "Geographic" and theme is city, roll on city-geographic-landmark table
        if (landmarkText === 'Geographic' && selectedTheme === 'city') {
          try {
            const geoLandmarkResult = tableStore.random('city-geographic-landmark');
            landmarkText = geoLandmarkResult.result.trim();
          } catch (error) {
            console.error('Error generating city geographic landmark:', error);
          }
        }

        landmark = landmarkText;
      } catch (error) {
        console.error('Error generating landmark:', error);
      }

      // Generate Faction for modern theme
      let faction: string | null = null;
      if (selectedTheme === 'modern') {
        try {
          const factionRoll = new DiceRoll('2d6');
          const factionTotal = factionRoll.total;
          if (factionTotal >= 2 && factionTotal <= 3) {
            faction = 'New Faction HQ';
          } else if (factionTotal >= 4 && factionTotal <= 5) {
            faction = 'Known Faction HQ';
          } else {
            faction = 'No Faction HQ';
          }
        } catch (error) {
          console.error('Error generating faction:', error);
        }
      }

      // Get current terrain (or generate if needed)
      let terrain: string | null = mapInfo.terrain;
      // If terrain is "ghost" or "empty", generate a new terrain to replace it
      if (!terrain || terrain.toLowerCase() === 'ghost' || terrain.toLowerCase() === 'empty') {
        const mainTableName =
          selectedTheme === 'city' ? 'fantasy-districts' : selectedTheme === 'modern' ? 'districts' : 'terrain';
        const mainResult = tableStore.random(mainTableName);
        terrain = mainResult.result.trim();
      }

      // Update or create main hex entry
      if (!terrain) {
        new Notice('Could not determine terrain for hex');
        return;
      }

      // Calculate exits for the current hex (all 6 neighbors) - use existing terrain or "empty"
      const allNeighbors = calculateHexNeighbors(coord.x, coord.y);
      const exitsForNote: Array<{ position: number; coord: string; terrain: string }> = [];
      for (const neighbor of allNeighbors) {
        const neighborCoord = formatHexCoordinate(neighbor.x, neighbor.y, '{X}.{Y}');
        // Check existing terrain in map
        const existingTerrain = await getHexTerrainFromMap(currentSelectedMapPath, neighbor);
        exitsForNote.push({
          position: neighbor.position,
          coord: neighborCoord,
          terrain: existingTerrain || 'empty',
        });
      }
      exitsForNote.sort((a, b) => a.position - b.position);

      // Create or update hex note (no insights on creation; insights are rolled when entering the hex)
      const hexId = formatHexCoordinate(coord.x, coord.y, '{X}{Y}');
      const hexDisplay = formatHexCoordinate(coord.x, coord.y, '{X}.{Y}');
      await createOrUpdateHexNote(
        app,
        currentSelectedMapPath,
        coord,
        level,
        terrain,
        featureText,
        exitsForNote,
        selectedTheme as 'terrain' | 'city' | 'modern',
        landmark,
        faction,
      );

      if (hexLineIndex >= 0) {
        // Update existing hex line
        const existingLine = lines[hexLineIndex];
        // Remove existing hex link if present
        const lineWithoutLink = existingLine.replace(/"([^"]+\|[^"]+)"/, '').trim();
        const existingTags = lineWithoutLink
          .replace(new RegExp(`^${targetCoord}\\s+`), '')
          .split(/\s+/)
          .filter((tag) => tag.length > 0);

        // Build new tags
        const terrainNormalized = terrain.toLowerCase().replace(/\s+/g, '-');
        const newTags: string[] = [];

        // Add bg and terrain
        const bgIndex = existingTags.findIndex((tag) => tag.endsWith('-bg'));
        if (bgIndex >= 0) {
          existingTags[bgIndex] = `${terrainNormalized}-bg`;
        } else {
          newTags.push(`${terrainNormalized}-bg`);
        }

        // Add terrain if not already present
        if (!existingTags.includes(terrainNormalized)) {
          newTags.push(terrainNormalized);
        }

        // Add difficulty if feature was generated
        if (difficulty && !existingTags.includes(difficulty)) {
          newTags.push(difficulty);
        }

        // Add level if generated
        if (level !== null) {
          const levelTag = `level-${level}`;
          const existingLevelIndex = existingTags.findIndex((tag) => tag.startsWith('level-'));
          if (existingLevelIndex >= 0) {
            existingTags[existingLevelIndex] = levelTag;
          } else {
            newTags.push(levelTag);
          }
        }

        // Keep other existing tags that aren't bg, difficulty, or level
        // Also remove ghost and empty tags when updating hex coordinates
        const otherTags = existingTags.filter(
          (tag) =>
            !tag.endsWith('-bg') &&
            tag !== 'easy' &&
            tag !== 'rough' &&
            tag !== 'dangerous' &&
            !tag.startsWith('level-') &&
            tag !== terrainNormalized &&
            tag.toLowerCase() !== 'ghost' &&
            tag.toLowerCase() !== 'empty',
        );

        // Combine all tags
        const allTags = [
          ...existingTags.filter(
            (tag) => tag.endsWith('-bg') || tag === terrainNormalized || tag.startsWith('level-') || tag === difficulty,
          ),
          ...newTags,
          ...otherTags,
        ];
        lines[hexLineIndex] = addHexLinkToHexLine(
          `${targetCoord} ${allTags.join(' ')}`,
          hexId,
          hexDisplay,
          currentMapId,
        );
      } else {
        // Create new hex entry
        const terrainNormalized = terrain.toLowerCase().replace(/\s+/g, '-');
        const newTags = [`${terrainNormalized}-bg`, terrainNormalized];
        if (difficulty) {
          newTags.push(difficulty);
        }
        if (level !== null) {
          newTags.push(`level-${level}`);
        }
        lines.push(addHexLinkToHexLine(`${targetCoord} ${newTags.join(' ')}`, hexId, hexDisplay, currentMapId));
      }

      // Rebuild textmapper block (no neighbor updates)
      const newTextMapperSource = lines.join('\n');
      const newContent = content.replace(codeBlockRegex, `\`\`\`text-mapper\n${newTextMapperSource}\n\`\`\``);

      // Write updated content
      await app.vault.modify(file, newContent);

      new Notice(`Hex ${targetCoord} populated (current only)`);

      // Refresh display
      await updateMapInfoDisplay(coord);
    } catch (error) {
      console.error('Error populating current hex:', error);
      new Notice(`Error populating hex: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Random button handler - rolls both direction and distance
  randomButton.addEventListener('click', () => {
    const tableStore = getTableStore();

    try {
      // Roll direction (1d6)
      const directionResult = tableStore.random('direction');
      const direction = parseInt(directionResult.result.trim(), 10);
      if (direction >= 1 && direction <= 6) {
        directionSelect.value = direction.toString();
      }

      // Roll distance type (1d6)
      const distanceTypeResult = tableStore.random('distance');
      const distanceType = distanceTypeResult.result.trim();

      // Roll actual distance based on type
      let distance = 0;
      if (distanceType === 'Short') {
        const roll = new DiceRoll('1d6');
        distance = roll.total;
      } else if (distanceType === 'Standard') {
        const roll = new DiceRoll('2d6');
        distance = roll.total;
      } else if (distanceType === 'Long') {
        const roll = new DiceRoll('3d6');
        distance = roll.total;
      }

      if (distance > 0) {
        distanceInput.value = distance.toString();
      }
    } catch (error) {
      console.error('Error rolling random direction/distance:', error);
      new Notice('Error rolling random values');
    }
  });

  // Calculate button handler
  calculateButton.addEventListener('click', () => {
    const startCoord = parseHexCoordinate(hexInput.value.trim());
    if (!startCoord) {
      new Notice('Please enter a valid hex coordinate');
      return;
    }

    const direction = parseInt(directionSelect.value, 10);
    if (direction < 1 || direction > 6) {
      new Notice('Please select a valid direction (1-6)');
      return;
    }

    const distance = parseInt(distanceInput.value, 10);
    if (!distance || distance < 1) {
      new Notice('Please enter a valid distance (1 or more)');
      return;
    }

    // Calculate destination
    const destination = calculateHexInDirection(startCoord, direction, distance);
    const destinationDisplay = formatHexCoordinate(destination.x, destination.y, '{X}.{Y}');

    // Display results
    calculatorResults.empty();
    calculatorResults.style.display = 'block';

    const resultDiv = calculatorResults.createDiv();
    resultDiv.createEl('strong', { text: 'Destination: ' });
    resultDiv.createEl('span', { text: destinationDisplay });

    const detailsDiv = calculatorResults.createDiv({
      attr: { style: 'margin-top: 4px; font-size: 0.9em; color: var(--text-muted);' },
    });
    detailsDiv.createEl('span', { text: `Direction: ${direction}, Distance: ${distance} hexes` });

    // Add to map button
    const addToMapButton = calculatorResults.createEl('button', {
      cls: 'clickable-icon',
      attr: {
        style: 'margin-top: 8px;',
        'aria-label': 'Add calculated hex to map',
      },
    });
    setIcon(addToMapButton, 'map-pin-plus');

    addToMapButton.addEventListener('click', async () => {
      if (!currentSelectedMapPath) {
        new Notice('Please select a map first');
        return;
      }

      try {
        const file = app.vault.getAbstractFileByPath(currentSelectedMapPath);
        if (!file || !(file instanceof TFile)) {
          new Notice('Map file not found');
          return;
        }

        const content = await app.vault.read(file);
        const codeBlockRegex = /```text-mapper\n([\s\S]*?)```/;
        const match = content.match(codeBlockRegex);
        if (!match) {
          new Notice('No text-mapper code block found in map file');
          return;
        }

        const textMapperSource = match[1];
        const lines = textMapperSource.split('\n');

        // Format the destination coordinate
        const targetCoord = formatHexCoordinate(destination.x, destination.y, '{X}{Y}');

        // Check if hex already exists
        let hexLineIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          if (
            trimmed.startsWith(targetCoord) &&
            !trimmed.startsWith('#') &&
            !trimmed.startsWith('id') &&
            !trimmed.startsWith('option')
          ) {
            hexLineIndex = i;
            break;
          }
        }

        if (hexLineIndex >= 0) {
          // Hex exists - update it with ghost terrain
          const existingLine = lines[hexLineIndex];
          const lineWithoutLink = existingLine.replace(/"([^"]+\|[^"]+)"/, '').trim();
          const existingTags = lineWithoutLink
            .replace(new RegExp(`^${targetCoord}\\s+`), '')
            .split(/\s+/)
            .filter((tag) => tag.length > 0);

          // Remove ghost and empty tags if present
          const filteredTags = existingTags.filter(
            (tag) => tag.toLowerCase() !== 'ghost' && tag.toLowerCase() !== 'empty' && tag.toLowerCase() !== 'ghost-bg',
          );

          // Add ghost terrain
          filteredTags.unshift('ghost-bg', 'ghost');
          lines[hexLineIndex] = `${targetCoord} ${filteredTags.join(' ')}`;
        } else {
          // Hex doesn't exist - create it with ghost terrain
          lines.push(`${targetCoord} ghost-bg ghost`);
        }

        // Rebuild textmapper block
        const newTextMapperSource = lines.join('\n');
        const newContent = content.replace(codeBlockRegex, `\`\`\`text-mapper\n${newTextMapperSource}\n\`\`\``);

        // Write updated content
        await app.vault.modify(file, newContent);

        new Notice(`Hex ${destinationDisplay} added to map`);
      } catch (error) {
        console.error('Error adding hex to map:', error);
        new Notice(`Error adding hex to map: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    // Store destination for reference (using data attributes instead of properties)
    calculatorResults.setAttribute('data-destination-x', destination.x.toString());
    calculatorResults.setAttribute('data-destination-y', destination.y.toString());
    calculatorResults.setAttribute('data-direction', direction.toString());
    calculatorResults.setAttribute('data-distance', distance.toString());
  });

  // Set up vault event listener to refresh dropdown when files are deleted
  const deleteHandler = (file: TFile) => {
    // Check if the deleted file was a map file
    if (file.path.endsWith('.md')) {
      refreshMapDropdown();
    }
  };
  app.vault.on('delete', deleteHandler);

  // Clean up event listener when tab is destroyed (handled by container being cleared)
  // Note: In Obsidian, event listeners are automatically cleaned up when the plugin unloads

  // Load and display information on pane load
  if (currentSelectedMapPath && hexInputValue) {
    const coord = parseHexCoordinate(hexInputValue);
    if (coord) {
      // Small delay to ensure UI is fully rendered
      setTimeout(async () => {
        await updateMapInfoDisplay(coord);
      }, 100);
    }
  }

  newMapButton.addEventListener('click', async () => {
    try {
      const mapId = generateMapId();
      const mapIdWithPrefix = `map-${mapId}`;
      const filename = `${mapIdWithPrefix}.md`;
      const selectedTheme = themeSelect.value;

      // Get table store
      const tableStore = getTableStore();

      // Roll for main terrain/district
      const mainTableName =
        selectedTheme === 'city' ? 'fantasy-districts' : selectedTheme === 'modern' ? 'districts' : 'terrain';
      const mainResult = tableStore.random(mainTableName);
      const mainTerrain = mainResult.result.trim();

      // Roll for level (1d4+2)
      const levelRoll = new DiceRoll('1d4+2');
      const level = levelRoll.total;

      // Roll for feature
      const featureTableName =
        selectedTheme === 'city' || selectedTheme === 'modern' ? 'modern-feature' : 'terrain-feature';
      const featureResult = tableStore.random(featureTableName);
      const featureText = featureResult.result.trim();

      // Extract difficulty from feature (Easy, Rough, or Dangerous)
      let difficulty = '';
      if (featureText.includes('(Easy)')) {
        difficulty = 'easy';
      } else if (featureText.includes('(Rough)')) {
        difficulty = 'rough';
      } else if (featureText.includes('(Dangerous)')) {
        difficulty = 'dangerous';
      }

      // Generate Landmark
      let landmark: string | null = null;
      try {
        const landmarkResult = tableStore.random('landmark-type');
        let landmarkText = landmarkResult.result.trim();

        // If landmark is "Geographic" and theme is city, roll on city-geographic-landmark table
        if (landmarkText === 'Geographic' && selectedTheme === 'city') {
          try {
            const geoLandmarkResult = tableStore.random('city-geographic-landmark');
            landmarkText = geoLandmarkResult.result.trim();
          } catch (error) {
            console.error('Error generating city geographic landmark:', error);
            // Keep "Geographic" as fallback
          }
        }

        landmark = landmarkText;
      } catch (error) {
        console.error('Error generating landmark:', error);
      }

      // Generate Faction for modern theme
      let faction: string | null = null;
      if (selectedTheme === 'modern') {
        try {
          const factionRoll = new DiceRoll('2d6');
          const factionTotal = factionRoll.total;
          if (factionTotal >= 2 && factionTotal <= 3) {
            faction = 'New Faction HQ';
          } else if (factionTotal >= 4 && factionTotal <= 5) {
            faction = 'Known Faction HQ';
          } else {
            faction = 'No Faction HQ';
          }
        } catch (error) {
          console.error('Error generating faction:', error);
        }
      }

      // Calculate neighbors for hex 00.00
      const neighbors = calculateHexNeighbors(0, 0);

      // Roll for adjacent terrain/district for each neighbor
      const neighborTerrains: Array<{ position: number; coord: string; terrain: string }> = [];
      for (const neighbor of neighbors) {
        const adjacentTableName =
          selectedTheme === 'city'
            ? `modern-adjacent-${mainTerrain.toLowerCase().replace(/\s+/g, '-')}`
            : selectedTheme === 'modern'
              ? `modern-adjacent-${mainTerrain.toLowerCase().replace(/\s+/g, '-')}`
              : `terrain-adjacent-${mainTerrain.toLowerCase()}`;

        let neighborTerrain: string | null = null;

        // Check if primary table exists
        if (tableStore.hasTable(adjacentTableName)) {
          const adjacentResult = tableStore.random(adjacentTableName);
          neighborTerrain = adjacentResult.result.trim();
        } else {
          // If primary table doesn't exist (switched themes), use theme default fallback
          const fallbackTableName =
            selectedTheme === 'city'
              ? 'fantasy-adjacent-central'
              : selectedTheme === 'modern'
                ? 'modern-adjacent-downtown'
                : 'terrain-adjacent-plains';

          if (tableStore.hasTable(fallbackTableName)) {
            const fallbackResult = tableStore.random(fallbackTableName);
            neighborTerrain = fallbackResult.result.trim();
          } else {
            // If fallback table also doesn't exist, use default terrain value
            neighborTerrain = selectedTheme === 'city' || selectedTheme === 'modern' ? 'plains' : 'center';
          }
        }

        // Final safety check - ensure we never store an error message
        if (neighborTerrain && neighborTerrain.toLowerCase().includes('[table not found:')) {
          neighborTerrain = selectedTheme === 'city' || selectedTheme === 'modern' ? 'plains' : 'center';
        }

        const formatted = formatHexCoordinate(neighbor.x, neighbor.y, '{X}.{Y}');
        neighborTerrains.push({
          position: neighbor.position,
          coord: formatted,
          terrain: neighborTerrain,
        });
      }

      // Sort neighbors by position
      neighborTerrains.sort((a, b) => a.position - b.position);

      // Build textmapper hex entries
      const hexEntries: string[] = [];

      // Normalize terrain/district name for bg tag (lowercase, replace spaces with dashes)
      const mainTerrainNormalized = mainTerrain.toLowerCase().replace(/\s+/g, '-');

      // Main hex (0000) with (terrain)-bg, terrain, difficulty, and level
      const mainHexTags = [`${mainTerrainNormalized}-bg`, mainTerrainNormalized];
      if (difficulty) {
        mainHexTags.push(difficulty);
      }
      mainHexTags.push(`level-${level}`);
      const mainHexId = '0000';
      const mainHexDisplay = '00.00';
      hexEntries.push(
        addHexLinkToHexLine(`${mainHexId} ${mainHexTags.join(' ')}`, mainHexId, mainHexDisplay, mapIdWithPrefix),
      );

      // Neighbor hexes with (terrain)-bg and terrain only (no link since no file is created)
      for (const neighbor of neighborTerrains) {
        const neighborHex = neighbors.find((n) => n.position === neighbor.position);
        if (neighborHex) {
          const coord = formatHexCoordinate(neighborHex.x, neighborHex.y, '{X}{Y}');
          const neighborTerrainNormalized = neighbor.terrain.toLowerCase().replace(/\s+/g, '-');
          hexEntries.push(`${coord} ${neighborTerrainNormalized}-bg ${neighborTerrainNormalized}`);
        }
      }

      // Create note content with frontmatter, heading, and textmapper code block
      const content = `---
mapId: ${mapIdWithPrefix}
---

# New Map ${mapId}

\`\`\`text-mapper
id ${mapIdWithPrefix}
option coordinates-format {X}.{Y}

${hexEntries.join('\n')}
\`\`\`
`;

      // Create the file
      const file = await app.vault.create(filename, content);

      // Calculate exits for main hex (0000)
      const mainNeighbors = calculateHexNeighbors(0, 0);
      const mainExits: Array<{ position: number; coord: string; terrain: string }> = [];
      for (const neighbor of mainNeighbors) {
        const neighborCoord = formatHexCoordinate(neighbor.x, neighbor.y, '{X}.{Y}');
        const neighborInfo = neighborTerrains.find((nt) => nt.position === neighbor.position);
        mainExits.push({
          position: neighbor.position,
          coord: neighborCoord,
          terrain: neighborInfo ? neighborInfo.terrain : 'empty',
        });
      }
      mainExits.sort((a, b) => a.position - b.position);

      // Create hex notes for all hexes
      // Main hex note (0000) - create with all data
      const mainHexNote = await createOrUpdateHexNote(
        app,
        file.path,
        { x: 0, y: 0 },
        level,
        mainTerrain,
        featureText,
        mainExits,
        selectedTheme as 'terrain' | 'city' | 'modern',
        landmark,
        faction,
      );
      if (!mainHexNote) {
        new Notice('Warning: Could not create hex note for 0000');
      }

      // Don't create hex notes for neighbor terrain hexes - only create notes when hexes are moved into

      // Open the file in a new leaf
      const leaf = app.workspace.getLeaf(true);
      await leaf.openFile(file);

      new Notice(`Map created: ${mapIdWithPrefix}`);

      // Select the newly created map and update the display without recreating the entire tab
      await onMapSelected(file.path);
      // Update selected map path in this scope
      currentSelectedMapPath = file.path;
      // Show open map button
      openMapButton.style.display = '';
      // Refresh the map dropdown to include the new map
      await refreshMapDropdown();
      // Update the map selector to select the new map
      const mapSelectElement = container.querySelector('#map-select') as HTMLSelectElement;
      if (mapSelectElement) {
        mapSelectElement.value = file.path;
      }
      // Read travel theme from the newly created map and update theme dropdown
      const mapTheme = await getTravelThemeFromMap(app, file.path);
      if (mapTheme) {
        themeSelect.value = mapTheme;
        await onThemeChanged(mapTheme);
      }
      // Update hex coordinate input to 0000
      const hexInputElement = container.querySelector('#hex-input') as HTMLInputElement;
      if (hexInputElement) {
        hexInputElement.value = '0000';
        await onHexInputChanged('0000');
      }
      // Update display for hex 0000 with the generated data (don't read from file)
      const coord = parseHexCoordinate('0000');
      if (coord) {
        await updateMapInfoDisplay(coord, file.path, {
          level: level.toString(),
          terrain: mainTerrain,
          feature: featureText,
          landmark: landmark,
          exits: mainExits,
        });
      }
    } catch (error) {
      console.error('Error creating map:', error);
      new Notice(`Error creating map: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });
}
