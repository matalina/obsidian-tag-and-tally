import { App, TFile } from 'obsidian';
import { runResolution, formatResolveOutput, parseResolveInline } from '@tag-and-tally/shared-ui';

export const RESOLVE_REGEX = /`resolve\s*:\s*(.+?)`/;
export const RESOLVE_REGEX_G = /`resolve\s*:\s*(.+?)`/g;

export function executeResolveInner(inner: string): string {
  const parsed = parseResolveInline(inner.trim());
  if ('error' in parsed) return `[Error: ${parsed.error}]`;
  const r = runResolution({
    resolutionType: parsed.resolutionType,
    level: parsed.level,
    likelihoodMod: parsed.likelihoodMod,
    questionOrAction: '',
  });
  return formatResolveOutput(r).trimEnd();
}

interface ResolveOptions {
  app: App;
  file: TFile;
  lineStart: number;
  lineEnd: number;
  index: number;
  originalText: string;
}

export class ResolveWidget {
  app: App;
  file: TFile;
  lineStart: number;
  lineEnd: number;
  index: number;
  originalText: string;
  hasReplaced: boolean = false;

  constructor(opts: ResolveOptions) {
    this.app = opts.app;
    this.file = opts.file;
    this.lineStart = opts.lineStart;
    this.lineEnd = opts.lineEnd;
    this.index = opts.index;
    this.originalText = opts.originalText;
  }

  private computeResult(): string {
    const match = this.originalText.match(RESOLVE_REGEX);
    const inner = match?.[1]?.trim() ?? '';
    return executeResolveInner(inner);
  }

  async replaceInFile(): Promise<string> {
    if (this.hasReplaced) {
      return this.computeResult();
    }

    try {
      const result = this.computeResult();

      const text = await this.app.vault.read(this.file);
      const lines = text.split('\n');
      const regex = new RegExp(RESOLVE_REGEX_G);
      let matchIndex = 0;
      let found = false;

      lookup: {
        for (let i = this.lineStart; i <= this.lineEnd; i++) {
          regex.lastIndex = 0;
          for (let match = regex.exec(lines[i]); match !== null; match = regex.exec(lines[i])) {
            if (matchIndex < this.index) {
              matchIndex++;
            } else if (matchIndex === this.index) {
              lines[i] =
                lines[i].substring(0, match.index) + result + lines[i].substring(match.index + match[0].length);
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
      console.error('Error replacing resolve in file:', error);
      return this.computeResult();
    }
  }

  async toDOM(): Promise<HTMLElement> {
    const result = await this.replaceInFile();
    const el = document.createElement('span');
    el.textContent = result;
    return el;
  }
}
