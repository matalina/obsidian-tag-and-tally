import { App, TFile } from 'obsidian';
import { SENTENCE_TEMPLATES, escapeMarkdownOpeningBrackets, generateSentenceWithTags } from './utils';
import { generateSentenceByType } from './generator';
import { generateSpellSentence } from './spell';

export const SENTENCE_REGEX = /`sentence\s*:\s*([\w-]+)(?:\s*:\s*([\w-]+))?`/;
export const SENTENCE_REGEX_G = /`sentence\s*:\s*([\w-]+)(?:\s*:\s*([\w-]+))?`/g;

interface SentenceOptions {
  app: App;
  file: TFile;
  lineStart: number;
  lineEnd: number;
  index: number;
  originalText: string;
}

export class SentenceWidget {
  sentenceType: string;
  theme: string;
  app: App;
  file: TFile;
  lineStart: number;
  lineEnd: number;
  index: number;
  originalText: string;
  hasReplaced: boolean = false;

  constructor(opts: SentenceOptions) {
    this.app = opts.app;
    this.file = opts.file;
    this.lineStart = opts.lineStart;
    this.lineEnd = opts.lineEnd;
    this.index = opts.index;
    this.originalText = opts.originalText;
    this.parseSentenceType(opts.originalText);
  }

  private parseSentenceType(text: string) {
    const match = text.match(SENTENCE_REGEX);
    if (!match) {
      this.sentenceType = 'Scene';
      this.theme = 'fantasy';
      return;
    }
    // Normalize the sentence type: capitalize first letter, lowercase the rest.
    // Hyphenated types (e.g. blood-magic-trauma) become space-separated capitalized words
    // to match the SENTENCE_TEMPLATES key (e.g. "Blood Magic Trauma").
    const rawType = match[1].trim();
    if (rawType.includes('-')) {
      this.sentenceType = rawType
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    } else {
      this.sentenceType = rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase();
    }
    // "npc" becomes "Npc" but map key is "NPC"
    if (this.sentenceType === 'Npc') this.sentenceType = 'NPC';
    // "wound" becomes "Wound" but map key is "Wounds"
    if (this.sentenceType === 'Wound') this.sentenceType = 'Wounds';
    // Parse optional theme parameter (second capture group)
    const rawTheme = match[2]?.trim();
    if (rawTheme) {
      this.theme = rawTheme.toLowerCase();
    } else {
      this.theme = 'fantasy';
    }
  }

  private generateSentence(): string {
    const theme = this.theme || 'fantasy';
    let result: string;

    // Spell is not in the main sentence-type list; handle inline only
    if (this.sentenceType === 'Spell') {
      result = generateSpellSentence();
    } else {
      try {
        const generated = generateSentenceByType(this.sentenceType, { theme });
        if (generated) {
          result = generated;
        } else {
          const template = SENTENCE_TEMPLATES['Scene'];
          result = generateSentenceWithTags(template, theme);
        }
      } catch (error) {
        console.error(`Error generating ${this.sentenceType} sentence:`, error);
        result = `[Error generating ${this.sentenceType} sentence]`;
      }
    }

    return escapeMarkdownOpeningBrackets(result);
  }

  async replaceInFile(): Promise<string> {
    if (this.hasReplaced) {
      // Already replaced, just return a generated sentence for display
      return this.generateSentence();
    }

    try {
      const result = this.generateSentence();

      const text = await this.app.vault.read(this.file);
      const lines = text.split('\n');
      const regex = new RegExp(SENTENCE_REGEX_G);
      let matchIndex = 0;
      let found = false;

      lookup: {
        for (let i = this.lineStart; i <= this.lineEnd; i++) {
          // Skip if line doesn't contain the pattern
          if (!lines[i].includes('sentence:')) continue;

          // Skip if this line has already been replaced (doesn't match sentence regex anymore)
          if (!SENTENCE_REGEX.test(lines[i])) continue;

          // Reset regex for each line
          regex.lastIndex = 0;
          for (let match = regex.exec(lines[i]); match !== null; match = regex.exec(lines[i])) {
            if (matchIndex < this.index) {
              matchIndex++;
            } else if (matchIndex === this.index) {
              // Verify we're matching the exact original text
              const matchedText = lines[i].substring(match.index, match.index + match[0].length);
              if (matchedText !== match[0]) {
                console.warn('Sentence replacement mismatch:', matchedText, 'vs', match[0]);
                continue;
              }

              // Replace the entire code block (including backticks) with the result
              const before = lines[i].substring(0, match.index);
              const after = lines[i].substring(match.index + match[0].length);
              lines[i] = before + result + after;
              this.hasReplaced = true;
              found = true;
              break lookup;
            }
          }
        }
      }

      if (found) {
        const newContent = lines.join('\n');
        await this.app.vault.modify(this.file, newContent);
      }

      return result;
    } catch (error) {
      console.error('Error replacing sentence in file:', error);
      // Fallback: return the generated sentence even if file modification fails
      return this.generateSentence();
    }
  }

  async toDOM(): Promise<HTMLElement> {
    // Replace in file first and get the result
    const result = await this.replaceInFile();

    // Create a plain span element with just text (not a code element)
    // This completely removes the code block and replaces it with plain text
    const el = document.createElement('span');
    el.className = 'tag-tally-sentence';
    el.textContent = result;
    // Mark as processed so it won't be processed again

    return el;
  }
}
