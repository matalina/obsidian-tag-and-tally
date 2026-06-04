import './styles-entry.css';
import {
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  Menu,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
} from 'obsidian';
import { ParseError } from './error';
import { TextMapperParser } from './text-mapper/parser';
import { Point } from './text-mapper/orientation';
import { TAG_AND_TALLY } from './text-mapper/themes/tag-and-tally';
import { textMapperSourceIsDungeon } from './text-mapper/dungeon-detect';
import { textMapperSourceIsCity } from './text-mapper/city-detect';
import { OPTION_REGEX, SVGElement as CustomSVGElement } from './text-mapper/constants';
import { DEFAULT_SETTINGS, TextMapperSettings, TextMapperSettingTab } from './settings';
import { TagTallyView, VIEW_TYPE_TAG_TALLY } from './views/TagTallyView';
import { DocumentationView, VIEW_TYPE_DOCUMENTATION } from './views/DocumentationView';
import { MarkdownNoteView, VIEW_TYPE_MARKDOWN_NOTE } from './views/MarkdownNoteView';
import { MarkdownFilePickerModal } from './views/MarkdownFilePickerModal';
import { TrackWidget, TRACK_REGEX } from './tally/track';
import { ClockWidget, CLOCK_REGEX } from './tally/clocks';
import { tallyExtension } from './tally/live';
import { DiceWidget, DICE_REGEX } from './dice/dice';
import { RollWidget, ROLL_REGEX } from './dice/roll';
import { diceRollExtension } from './dice/live';
import { RandomWidget, RANDOM_REGEX } from './tables/random';
import { PickWidget, PICK_REGEX } from './tables/pick';
import { CustomWidget, CUSTOM_REGEX } from './tables/custom';
import { CustomRandomWidget, CUSTOM_RANDOM_REGEX } from './tables/custom-random';
import { randomPickExtension } from './tables/live';
import { getTableStore } from './tables/store';
import { TagWidget, TAG_REGEX } from './tag/tag';
import { tagExtension } from './tag/live';
import { sentenceExtension } from './sentences/live';
import { SentenceWidget, SENTENCE_REGEX } from './sentences/sentence';
import { ResolveWidget, RESOLVE_REGEX } from './resolution/resolve';
import { AiChatView, VIEW_TYPE_AI_CHAT } from './ai/chatView';
import { DEFAULT_AI_SETTINGS, mergeAiSettings, type AiPluginSettings } from './ai/settings';
import { PromptManager } from './ai/promptManager';
import { AI_REGEX, isAiCommand, kickOffAi, spliceMarker, type AiCommand } from './ai/inline';
import { aiInlineExtension } from './ai/inlineLive';
import { textReplacementExtension, runTextReplacement } from './replacements/extension';
import type { EditorView } from '@codemirror/view';

export default class TextMapperPlugin extends Plugin {
  settings: TextMapperSettings;
  aiSettings: AiPluginSettings;
  promptManager!: PromptManager;
  gmPromptManager!: PromptManager;
  globalPromptManager!: PromptManager;
  inflightAi: Map<string, AbortController> = new Map();
  refreshedCharacters: Set<string> = new Set();
  activeMappers: Set<TextMapper> = new Set();

  async onload() {
    await this.loadSettings();

    this.promptManager = new PromptManager(this, () => this.settings.systemPromptFolder);
    this.gmPromptManager = new PromptManager(this, () => this.settings.gmPersonalityFolder);
    this.globalPromptManager = new PromptManager(this, () => this.settings.globalPromptFolder);

    this.addSettingTab(new TextMapperSettingTab(this.app, this));

    this.registerMarkdownCodeBlockProcessor('text-mapper', this.processMarkdown.bind(this));

    // Register markdown post-processor for track and clock widgets (reading view)
    this.registerMarkdownPostProcessor(this.processTrackAndClock.bind(this));

    // Register editor extension for live preview mode
    this.registerEditorExtension(tallyExtension(this));
    this.registerEditorExtension(diceRollExtension(this));
    this.registerEditorExtension(randomPickExtension(this));
    this.registerEditorExtension(tagExtension(this));
    this.registerEditorExtension(sentenceExtension(this));
    this.registerEditorExtension(aiInlineExtension(this));
    this.registerEditorExtension(textReplacementExtension(this));

    // Initialize table store
    const tableStore = getTableStore();
    // Set plugin instance for cache persistence
    tableStore.setPlugin(this);

    // Load custom tables - delay slightly to ensure vault is fully indexed
    // The vault may not have indexed all folders immediately on load
    // Cache will be used first, then files will be checked for updates
    // Note: After parser fixes, tables need to be reloaded to use the new parsing logic
    setTimeout(async () => {
      await this.loadCustomTables();
      await this.promptManager.refresh();
      await this.gmPromptManager.refresh();
      await this.globalPromptManager.refresh();
    }, 500);

    // Process when files are opened or rendered
    this.registerEvent(
      this.app.workspace.on('file-open', () => {
        setTimeout(() => this.processAllPreviewPanes(), 200);
      }),
    );

    // Process preview panes when workspace layout changes
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        setTimeout(() => this.processAllPreviewPanes(), 100);
      }),
    );

    // Process on markdown render
    this.registerEvent(
      (this.app.workspace as unknown as { on: (event: string, cb: () => void) => unknown }).on('markdown-render', () => {
        setTimeout(() => this.processAllPreviewPanes(), 100);
      }) as never,
    );

    // Also process on active leaf change
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        setTimeout(() => this.processAllPreviewPanes(), 200);
      }),
    );

    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        setTimeout(() => this.processAllPreviewPanes(), 200);
      }),
    );

    // Initial processing - wait longer for markdown to render
    setTimeout(() => {
      this.processAllPreviewPanes();
    }, 1000);

    // Use MutationObserver to watch for code elements being added to the DOM
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      let codeCount = 0;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            // Check if the added node or its children contain code elements
            if (el.tagName === 'CODE') {
              shouldProcess = true;
              codeCount++;
            } else if (el.querySelector('code')) {
              shouldProcess = true;
              codeCount += el.querySelectorAll('code').length;
            }
          }
        });
      });
      if (shouldProcess) {
        setTimeout(() => this.processAllPreviewPanes(), 200);
      }
    });

    // Observe markdown preview sections specifically
    const markdownSections = document.querySelectorAll('.markdown-preview-section, .markdown-reading-view');
    markdownSections.forEach((section) => {
      observer.observe(section, {
        childList: true,
        subtree: true,
      });
    });

    // Also observe the body as fallback
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Register the Tag and Tally sidebar view (left)
    this.registerView(VIEW_TYPE_TAG_TALLY, (leaf) => new TagTallyView(leaf, this));

    // Register the Documentation view (right)
    this.registerView(VIEW_TYPE_DOCUMENTATION, (leaf) => new DocumentationView(leaf, this));

    // Register the Markdown Note view (right)
    this.registerView(VIEW_TYPE_MARKDOWN_NOTE, (leaf) => new MarkdownNoteView(leaf, this));

    // Add ribbon icon to open the sidebar
    this.addRibbonIcon('tally-5', 'Tag and Tally', () => {
      this.activateTagTallyView();
    });

    // Add command to open documentation
    this.addCommand({
      id: 'open-documentation',
      name: 'Open Documentation',
      callback: () => {
        this.activateDocumentationView();
      },
    });

    // Add command to create character sheet
    this.addCommand({
      id: 'create-character-sheet',
      name: 'Create Character Sheet',
      callback: async () => {
        await this.createCharacterSheet();
      },
    });

    // Add command to open markdown file in sidebar
    this.addCommand({
      id: 'open-markdown-in-sidebar',
      name: 'Open Markdown File in Sidebar',
      callback: async () => {
        await this.openMarkdownFileInSidebar();
      },
    });

    // Register the integrated Tag and Tally AI chat view + ribbon + command
    // (AI settings render inside TextMapperSettingTab; see renderAiSettings.)
    this.registerView(VIEW_TYPE_AI_CHAT, (leaf) => new AiChatView(leaf, this));
    this.addRibbonIcon('message-square', 'Open Tag and Tally AI chat', () => {
      void this.activateAiChatView();
    });
    this.addCommand({
      id: 'open-ai-chat',
      name: 'Open AI chat',
      callback: () => void this.activateAiChatView(),
    });

    this.addCommand({
      id: 'apply-text-replacement',
      name: 'Apply text replacement at cursor',
      editorCallback: (editor) => {
        const cm = (editor as unknown as { cm?: EditorView }).cm;
        if (cm) runTextReplacement(cm, this);
      },
    });
  }

  async activateAiChatView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null =
      workspace.getLeavesOfType(VIEW_TYPE_AI_CHAT)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_AI_CHAT, active: true });
      }
    }
    if (leaf) {
      void workspace.revealLeaf(leaf);
    } else {
      new Notice('Could not open a sidebar for AI chat.');
    }
  }

  registerMapper(mapper: TextMapper) {
    this.activeMappers.add(mapper);
  }

  unregisterMapper(mapper: TextMapper) {
    this.activeMappers.delete(mapper);
  }

  getMapperByDocId(docId: string): TextMapper | null {
    for (const mapper of this.activeMappers) {
      if ((mapper as any).docId === docId) {
        return mapper;
      }
    }
    return null;
  }

  getMapperBySourcePath(sourcePath: string): TextMapper | null {
    for (const mapper of this.activeMappers) {
      if ((mapper as any).sourcePath === sourcePath) {
        return mapper;
      }
    }
    return null;
  }

  refreshAllMappers() {
    for (const mapper of this.activeMappers) {
      mapper.refresh();
    }
  }

  async loadSettings() {
    const raw = ((await this.loadData()) ?? {}) as Record<string, unknown>;
    const { ai, ...main } = raw;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, main);
    // Deep-copy arrays so users mutating them don't corrupt DEFAULT_SETTINGS
    this.settings.textReplacements = Array.isArray(this.settings.textReplacements)
      ? this.settings.textReplacements.map((r) => ({ ...r }))
      : [];
    this.aiSettings = mergeAiSettings(ai);
  }

  async saveSettings() {
    await this.saveData({ ...this.settings, ai: this.aiSettings });
  }

  async saveAiSettings() {
    await this.saveData({ ...this.settings, ai: this.aiSettings });
  }

  /**
   * Load custom tables from the configured folder
   */
  async loadCustomTables(): Promise<void> {
    const tableStore = getTableStore();
    await tableStore.loadCustomTables(this.app, this.settings.customTablesFolder);
  }

  /**
   * Reload custom tables (called when settings change)
   */
  async reloadCustomTables(): Promise<void> {
    await this.loadCustomTables();
  }

  /**
   * Reload system prompts (called when settings change)
   */
  async reloadSystemPrompts(): Promise<void> {
    await this.promptManager.refresh();
  }

  /**
   * Reload GM personalities (called when settings change)
   */
  async reloadGmPersonalities(): Promise<void> {
    await this.gmPromptManager.refresh();
  }

  /**
   * Reload global always-on prompts (called when settings change)
   */
  async reloadGlobalPrompts(): Promise<void> {
    await this.globalPromptManager.refresh();
  }

  async processMarkdown(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    try {
      const mapper = new TextMapper(el, ctx.docId, source, this, ctx.sourcePath);
      ctx.addChild(mapper);
      this.registerMapper(mapper);
    } catch (e) {
      console.error('text mapper error', e);
      ctx.addChild(new ParseError(el));
    }
  }

  processTrackAndClock = async (el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> => {
    // Use querySelectorAll to find all code elements, including nested ones
    // Also check if the element itself is a code element
    const nodeList: HTMLElement[] = [];
    if (el.tagName === 'CODE') {
      nodeList.push(el);
    }
    const nestedCodes = el.querySelectorAll('code');
    nestedCodes.forEach((code) => {
      if (!nodeList.includes(code as HTMLElement)) {
        nodeList.push(code as HTMLElement);
      }
    });

    if (!nodeList.length) {
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) {
      return;
    }
    const section = ctx.getSectionInfo(el);

    // Use section info if available, otherwise use fallback values
    // This allows commands to work in all markdown contexts (lists, headers, blockquotes, etc.)
    const lineStart = section?.lineStart ?? 0;
    const lineEnd = section?.lineEnd ?? 9999;
    const indexMap = {
      track: 0,
      clock: 0,
      dice: 0,
      roll: 0,
      random: 0,
      pick: 0,
      custom: 0,
      customRandom: 0,
      tag: 0,
      sentence: 0,
      resolve: 0,
    };

    for (let i = 0; i < nodeList.length; i++) {
      const node = nodeList[i];
      const innerText = node.innerText.trim();
      if (!innerText) continue;

      const mdText = `\`${innerText}\``;

      // Handle boxes:1/5 or circles:1/5
      if (TRACK_REGEX.test(mdText)) {
        const widget = new TrackWidget({
          app: this.app,
          file: file,
          lineStart: lineStart,
          lineEnd: lineEnd,
          index: indexMap.track++,
          originalText: mdText,
        });
        node.replaceWith(widget.toDOM());
      }

      // Handle clocks:1/5
      if (CLOCK_REGEX.test(mdText)) {
        const widget = new ClockWidget({
          app: this.app,
          file: file,
          lineStart: lineStart,
          lineEnd: lineEnd,
          index: indexMap.clock++,
          originalText: mdText,
        });
        node.replaceWith(widget.toDOM());
      }

      // Handle dice:1d6 or dice: 1d6
      if (DICE_REGEX.test(mdText)) {
        const widget = new DiceWidget({
          app: this.app,
          file: file,
          lineStart: lineStart,
          lineEnd: lineEnd,
          index: indexMap.dice++,
          originalText: mdText,
        });
        node.replaceWith(widget.toDOM());
      }

      // Handle roll:1d6 or roll: 1d6
      if (ROLL_REGEX.test(mdText)) {
        const widget = new RollWidget({
          app: this.app,
          file: file,
          lineStart: lineStart,
          lineEnd: lineEnd,
          index: indexMap.roll++,
          originalText: mdText,
        });
        widget.toDOM().then((el) => {
          node.replaceWith(el);
        });
      }

      // Handle random:table-name or random: table-name
      if (RANDOM_REGEX.test(mdText)) {
        const widget = new RandomWidget({
          app: this.app,
          file: file,
          lineStart: lineStart,
          lineEnd: lineEnd,
          index: indexMap.random++,
          originalText: mdText,
        });
        node.replaceWith(widget.toDOM());
      }

      // Handle pick:table-name or pick: table-name
      if (PICK_REGEX.test(mdText)) {
        const widget = new PickWidget({
          app: this.app,
          file: file,
          lineStart: lineStart,
          lineEnd: lineEnd,
          index: indexMap.pick++,
          originalText: mdText,
        });
        widget.toDOM().then((el) => {
          node.replaceWith(el);
        });
      }

      // Handle custom {table-name} or custom {table-name} {nested-table}
      if (CUSTOM_REGEX.test(mdText)) {
        const widget = new CustomWidget({
          app: this.app,
          file: file,
          lineStart: lineStart,
          lineEnd: lineEnd,
          index: indexMap.custom++,
          originalText: mdText,
        });
        widget.toDOM().then((el) => {
          node.replaceWith(el);
        });
      }

      // Handle custom-random:table-name or custom-random: table-name
      if (CUSTOM_RANDOM_REGEX.test(mdText)) {
        // For reading view, we need to create a simple display widget
        // The live preview extension handles the interactive widget
        const store = getTableStore();
        try {
          const match = mdText.match(CUSTOM_RANDOM_REGEX);
          if (match) {
            const tableName = match[1].trim();
            const tableResult = store.random(tableName);
            const formatted = `${tableResult.result} ← _(${tableResult.roll.output})_`;
            const el = document.createElement('span');
            el.textContent = formatted;
            node.replaceWith(el);
          }
        } catch (error) {
          console.error('Error rolling on custom-random table:', error);
        }
      }

      // Handle tag:(type) T(tier) (Tag information) %(tally)
      if (TAG_REGEX.test(mdText)) {
        const widget = new TagWidget({
          app: this.app,
          file: file,
          lineStart: lineStart,
          lineEnd: lineEnd,
          index: indexMap.tag++,
          originalText: mdText,
        });
        node.replaceWith(widget.toDOM());
      }

      // Handle sentence:(type) or sentence: type
      if (SENTENCE_REGEX.test(mdText)) {
        const widget = new SentenceWidget({
          app: this.app,
          file: file,
          lineStart: lineStart,
          lineEnd: lineEnd,
          index: indexMap.sentence++,
          originalText: mdText,
        });
        widget.toDOM().then((el) => {
          node.replaceWith(el);
        });
      }

      // Handle resolve:type … (hyphenated slugs, level, +/- for oracle/insights/secrets)
      if (RESOLVE_REGEX.test(mdText)) {
        const widget = new ResolveWidget({
          app: this.app,
          file: file,
          lineStart: lineStart,
          lineEnd: lineEnd,
          index: indexMap.resolve++,
          originalText: mdText,
        });
        widget.toDOM().then((el) => {
          node.replaceWith(el);
        });
      }

      // Handle ai:* commands (with optional :gm-name)
      if (AI_REGEX.test(mdText)) {
        const pill = document.createElement('span');
        pill.className = 'tag-tally-ai-pending';
        pill.textContent = 'AI generating…';
        node.replaceWith(pill);
        void this.kickOffReadingViewAi(file, mdText);
      }
    }
  };

  /** Reading-view path: load file content via cachedRead, locate the backtick by indexOf, build the prompt snapshot, and fire kickOffAi. */
  private async kickOffReadingViewAi(file: TFile, mdText: string): Promise<void> {
    const m = mdText.match(AI_REGEX);
    if (!m) return;
    const rawCommand = m[1].toLowerCase();
    if (!isAiCommand(rawCommand)) return;
    const command: AiCommand = rawCommand;

    let fileContent: string;
    try {
      fileContent = await this.app.vault.cachedRead(file);
    } catch {
      return;
    }
    const pos = fileContent.indexOf(mdText);
    if (pos === -1) return;

    const snapshot = spliceMarker(fileContent, pos, mdText.length, command);
    await kickOffAi({
      plugin: this,
      file,
      originalBacktick: mdText,
      position: pos,
      documentSnapshot: snapshot,
    });
  }

  processAllPreviewPanes() {
    // Process both reading view and preview mode
    const allPanes = document.querySelectorAll('.markdown-preview-view, .markdown-reading-view');

    allPanes.forEach((pane) => {
      // Try multiple selectors to find code elements
      const codeElements1 = pane.querySelectorAll('code');
      const codeElements2 = pane.querySelectorAll(
        'p code, li code, h1 code, h2 code, h3 code, h4 code, h5 code, h6 code, blockquote code',
      );

      // Use the most specific selector that finds elements
      const codeElements = codeElements2.length > 0 ? codeElements2 : codeElements1;

      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        return;
      }

      let trackIndex = 0;
      let clockIndex = 0;
      let diceIndex = 0;
      let rollIndex = 0;
      let randomIndex = 0;
      let pickIndex = 0;
      let customIndex = 0;
      let customRandomIndex = 0;
      let tagIndex = 0;
      let sentenceIndex = 0;
      let resolveIndex = 0;

      codeElements.forEach((codeEl) => {
        const codeElement = codeEl as HTMLElement;

        // Skip if already processed
        if (
          codeElement.closest(
            '.tag-tally-track, .tag-tally-clock, .tag-tally-dice, .tag-tally-roll, .tag-tally-random, .tag-tally-pick, .tag-tally-custom, .tag-tally-tag, .tag-tally-sentence',
          ) ||
          codeElement.parentElement?.classList.contains('tag-tally-track') ||
          codeElement.parentElement?.classList.contains('tag-tally-clock') ||
          codeElement.parentElement?.classList.contains('tag-tally-dice') ||
          codeElement.parentElement?.classList.contains('tag-tally-roll') ||
          codeElement.parentElement?.classList.contains('tag-tally-random') ||
          codeElement.parentElement?.classList.contains('tag-tally-pick') ||
          codeElement.parentElement?.classList.contains('tag-tally-custom') ||
          codeElement.parentElement?.classList.contains('tag-tally-tag') ||
          codeElement.parentElement?.classList.contains('tag-tally-sentence')
        ) {
          return;
        }

        const innerText = codeElement.innerText.trim();
        if (!innerText) return;

        const mdText = `\`${innerText}\``;

        // Process track widgets
        if (TRACK_REGEX.test(mdText)) {
          const widget = new TrackWidget({
            app: this.app,
            file: activeFile,
            lineStart: 0,
            lineEnd: 9999,
            index: trackIndex++,
            originalText: mdText,
          });
          codeElement.replaceWith(widget.toDOM());
        }

        // Process clock widgets
        if (CLOCK_REGEX.test(mdText)) {
          const widget = new ClockWidget({
            app: this.app,
            file: activeFile,
            lineStart: 0,
            lineEnd: 9999,
            index: clockIndex++,
            originalText: mdText,
          });
          codeElement.replaceWith(widget.toDOM());
        }

        // Process dice widgets
        if (DICE_REGEX.test(mdText)) {
          const widget = new DiceWidget({
            app: this.app,
            file: activeFile,
            lineStart: 0,
            lineEnd: 9999,
            index: diceIndex++,
            originalText: mdText,
          });
          codeElement.replaceWith(widget.toDOM());
        }

        // Process roll widgets
        if (ROLL_REGEX.test(mdText)) {
          const widget = new RollWidget({
            app: this.app,
            file: activeFile,
            lineStart: 0,
            lineEnd: 9999,
            index: rollIndex++,
            originalText: mdText,
          });
          widget.toDOM().then((el) => {
            codeElement.replaceWith(el);
          });
        }

        // Process tag widgets
        if (TAG_REGEX.test(mdText)) {
          const widget = new TagWidget({
            app: this.app,
            file: activeFile,
            lineStart: 0,
            lineEnd: 9999,
            index: tagIndex++,
            originalText: mdText,
          });
          codeElement.replaceWith(widget.toDOM());
        }

        // Process sentence widgets
        if (SENTENCE_REGEX.test(mdText)) {
          const widget = new SentenceWidget({
            app: this.app,
            file: activeFile,
            lineStart: 0,
            lineEnd: 9999,
            index: sentenceIndex++,
            originalText: mdText,
          });
          widget.toDOM().then((el) => {
            codeElement.replaceWith(el);
          });
        }

        // Process resolve:… widgets
        if (RESOLVE_REGEX.test(mdText)) {
          const widget = new ResolveWidget({
            app: this.app,
            file: activeFile,
            lineStart: 0,
            lineEnd: 9999,
            index: resolveIndex++,
            originalText: mdText,
          });
          widget.toDOM().then((el) => {
            codeElement.replaceWith(el);
          });
        }

        // Process ai:* widgets
        if (AI_REGEX.test(mdText)) {
          const pill = document.createElement('span');
          pill.className = 'tag-tally-ai-pending';
          pill.textContent = 'AI generating…';
          codeElement.replaceWith(pill);
          void this.kickOffReadingViewAi(activeFile, mdText);
        }

        // Process random widgets
        if (RANDOM_REGEX.test(mdText)) {
          const widget = new RandomWidget({
            app: this.app,
            file: activeFile,
            lineStart: 0,
            lineEnd: 9999,
            index: randomIndex++,
            originalText: mdText,
          });
          codeElement.replaceWith(widget.toDOM());
        }

        // Process pick widgets
        if (PICK_REGEX.test(mdText)) {
          const widget = new PickWidget({
            app: this.app,
            file: activeFile,
            lineStart: 0,
            lineEnd: 9999,
            index: pickIndex++,
            originalText: mdText,
          });
          widget.toDOM().then((el) => {
            codeElement.replaceWith(el);
          });
        }

        // Process custom widgets
        if (CUSTOM_REGEX.test(mdText)) {
          const widget = new CustomWidget({
            app: this.app,
            file: activeFile,
            lineStart: 0,
            lineEnd: 9999,
            index: customIndex++,
            originalText: mdText,
          });
          widget.toDOM().then((el) => {
            codeElement.replaceWith(el);
          });
        }

        // Process custom-random widgets
        if (CUSTOM_RANDOM_REGEX.test(mdText)) {
          const store = getTableStore();
          try {
            const match = mdText.match(CUSTOM_RANDOM_REGEX);
            if (match) {
              const tableName = match[1].trim();
              const tableResult = store.random(tableName);
              const formatted = `${tableResult.result} ← _(${tableResult.roll.output})_`;
              const el = document.createElement('span');
              el.textContent = formatted;
              codeElement.replaceWith(el);
            }
          } catch (error) {
            console.error('Error rolling on custom-random table:', error);
          }
        }
      });
    });
  }

  async activateTagTallyView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;

    // Check if the view already exists
    workspace.getLeavesOfType(VIEW_TYPE_TAG_TALLY).forEach((existingLeaf) => {
      leaf = existingLeaf;
    });

    if (!leaf) {
      // Create a new leaf in the left sidebar
      leaf = workspace.getLeftLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE_TAG_TALLY, active: true });
    }

    workspace.revealLeaf(leaf);
  }

  async activateDocumentationView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;

    // Check if the view already exists
    workspace.getLeavesOfType(VIEW_TYPE_DOCUMENTATION).forEach((existingLeaf) => {
      leaf = existingLeaf;
    });

    if (!leaf) {
      // Create a new leaf in the right sidebar
      leaf = workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE_DOCUMENTATION, active: true });
    }

    workspace.revealLeaf(leaf);
  }

  async openMarkdownFileInSidebar(): Promise<void> {
    try {
      // Get all markdown files from the vault
      const files = this.app.vault.getMarkdownFiles();

      if (files.length === 0) {
        new Notice('No markdown files found in vault');
        return;
      }

      // Create and open the file picker modal
      const modal = new MarkdownFilePickerModal(this.app, files);
      const selectedFile = await modal.openAndGetFile();

      if (selectedFile) {
        await this.activateMarkdownNoteView(selectedFile.path);
      }
    } catch (error) {
      console.error('Error opening markdown file picker:', error);
      new Notice('Error opening file picker');
    }
  }

  async activateMarkdownNoteView(filePath: string): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;

    // Check if the view already exists
    workspace.getLeavesOfType(VIEW_TYPE_MARKDOWN_NOTE).forEach((existingLeaf) => {
      leaf = existingLeaf;
    });

    if (!leaf) {
      // Create a new leaf in the right sidebar
      leaf = workspace.getRightLeaf(false);
      await leaf.setViewState({
        type: VIEW_TYPE_MARKDOWN_NOTE,
        active: true,
        state: { filePath: filePath },
      });
    } else {
      // Update existing view with new file path
      const view = leaf.view;
      if (view instanceof MarkdownNoteView) {
        await view.setFilePath(filePath);
      } else {
        // If view isn't loaded yet, set the state
        await leaf.setViewState({
          type: VIEW_TYPE_MARKDOWN_NOTE,
          active: true,
          state: { filePath: filePath },
        });
      }
    }

    workspace.revealLeaf(leaf);
  }

  async createCharacterSheet(): Promise<void> {
    // Character sheet template
    const characterTemplate = `**Name** is a \\[descriptor] \\[species] \\[type] who \\[does something].

**MAI:** (if spellcaster)
**Caster Tier:** (if spellcaster)

**Childhood**
* (flaw)
* (background)
* ?
* ?

**Adolescent**
* (flaw)
* (background)
* ?
* ?

**Young Adult**
* (flaw)
* (background)
* (occupation)
* ?
* ?

**Descriptor**
* ?

**Species**
* (species sentence)
\t* Magic: \\[Can use / Can learn / Cannot use] \\[Aspects] Aspects.
\t\t* Base MAI: X
\t* Languages: Common, ?
\t* ?
\t* ?

**Type**
* **Name** is a \\[descriptor] \\[type] who \\[specializes in]
\t* (flaw)
\t* ?
\t* ?

**Specialty**
* (does something)
\t* ?
\t* ?

**Wounds**
Strain \`boxes:0/5\`
Lingering Trauma \`boxes:0/3\`
Debilitating Injury \`boxes:0/2\`
Lasting Scars \`boxes:0/1\`
* (wound sentence)

**Gear**
* Wealth: 3 (\\[Above Means/Below Means/Reasonable/] - \\[In Debt?])
* (weapon) (weapon sentence)
* (armor) (armor sentence)
* Tier 1 Belt Pouch
\t1. (item sentence)
\t2. ?
\t3. ?
* Tier 1 Backpack
\t1. (item sentence)
\t2. ?
\t3. ?
\t4. ?
\t5. ?
\t6. ?
\t7. ?
* Tier 1 Resource Bag
\t1. (resource sentence) (stack: x)
\t2. ? (stack: x)
\t3. ? (stack: x)
\t4. ? (stack: x)

**Spells**
* (spell sentence) (Tier X → Level X) **Mastery**

**Character Arcs**
* **Name** is \\[verb] \\[adjective] \\[noun]
\t* (return to) for (reward)
\t* (location found)
\t* (insight)

**Quests**
* \\[verb] \\[adjective] \\[noun] → \`boxes:0/5\`
\t* (return to) for (reward)
\t* (location found)
\t* (insight)

**Relationships**
* (npc sentence) → \\[relationship] (+/- step): known how?

**Factions**
* (faction sentence) → \\[relationship] (+/- step): (known how?)

**Known Locations**
* \\[Residence] - (location sentence)
* \\[Place of Employment] - (location sentence)
`;

    try {
      // Prompt for filename
      const filename = await new Promise<string>((resolve) => {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Character Name';
        input.style.width = '100%';
        input.style.padding = '8px';
        input.style.marginBottom = '10px';

        const modal = document.createElement('div');
        modal.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: var(--background-primary);
                    border: 1px solid var(--background-modifier-border);
                    border-radius: 8px;
                    padding: 20px;
                    z-index: 10000;
                    min-width: 300px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                `;

        const title = document.createElement('div');
        title.textContent = 'Create Character Sheet';
        title.style.cssText = 'font-weight: bold; margin-bottom: 10px; font-size: 16px;';

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px;';

        const createButton = document.createElement('button');
        createButton.textContent = 'Create';
        createButton.className = 'mod-cta';
        createButton.style.cssText = 'padding: 6px 12px;';

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.cssText = 'padding: 6px 12px;';

        const handleCreate = () => {
          const name = input.value.trim() || 'Character';
          const sanitizedName = name.replace(/[<>:"/\\|?*]/g, ''); // Remove invalid filename characters
          resolve(sanitizedName);
          document.body.removeChild(modal);
        };

        const handleCancel = () => {
          resolve('');
          document.body.removeChild(modal);
        };

        createButton.addEventListener('click', handleCreate);
        cancelButton.addEventListener('click', handleCancel);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            handleCreate();
          } else if (e.key === 'Escape') {
            handleCancel();
          }
        });

        modal.appendChild(title);
        modal.appendChild(input);
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(createButton);
        modal.appendChild(buttonContainer);
        document.body.appendChild(modal);
        input.focus();
      });

      if (!filename) {
        return; // User cancelled
      }

      // Determine file path
      const activeFile = this.app.workspace.getActiveFile();
      let filePath: string;

      if (activeFile) {
        // Create in same folder as active file
        const folder = activeFile.parent?.path || '';
        filePath = folder ? `${folder}/${filename}.md` : `${filename}.md`;
      } else {
        // Create in vault root
        filePath = `${filename}.md`;
      }

      // Check if file already exists
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);
      if (existingFile) {
        new Notice(`File "${filePath}" already exists. Please choose a different name.`);
        return;
      }

      // Create the file
      const file = await this.app.vault.create(filePath, characterTemplate);

      // Open the file in a new leaf
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.openFile(file);

      new Notice(`Character sheet "${filename}" created successfully!`);
    } catch (error) {
      console.error('Error creating character sheet:', error);
      new Notice(`Error creating character sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  onunload() {
    // Abort any in-flight inline AI commands so they don't outlive the plugin.
    for (const controller of this.inflightAi.values()) {
      try {
        controller.abort();
      } catch {
        // ignore
      }
    }
    this.inflightAi.clear();

    // Clean up the views if needed
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TAG_TALLY);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_DOCUMENTATION);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_AI_CHAT);
  }
}

/**
 * Extract theme option from source code if present
 * @param source The map source code
 * @returns Theme name if found, null otherwise
 */
function getThemeFromSource(source: string): string | null {
  const lines = source.split('\n');
  for (const line of lines) {
    if (line.startsWith('#')) {
      continue;
    }
    if (OPTION_REGEX.test(line)) {
      const match = line.match(OPTION_REGEX);
      if (match) {
        const optionStr = match[1].trim();
        const tokens = optionStr.split(' ');
        if (tokens.length >= 2 && tokens[0] === 'theme') {
          return tokens[1].toLowerCase();
        }
      }
    }
  }
  return null;
}

/**
 * Extract zoom option from source code if present
 * @param source The map source code
 * @returns Zoom value if found, null otherwise
 */
function getZoomFromSource(source: string): number | null {
  const lines = source.split('\n');
  for (const line of lines) {
    if (line.startsWith('#')) {
      continue;
    }
    if (OPTION_REGEX.test(line)) {
      const match = line.match(OPTION_REGEX);
      if (match) {
        const optionStr = match[1].trim();
        const tokens = optionStr.split(' ');
        if (tokens.length >= 2 && tokens[0] === 'zoom') {
          const zoomValue = parseFloat(tokens[1]);
          if (!isNaN(zoomValue) && zoomValue > 0) {
            return zoomValue;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Get the theme constant string based on theme name
 * @param themeName The theme name (only "tag-and-tally" is supported)
 * @returns The theme constant string
 */
function getThemeConstant(themeName: string): string {
  // Only tag-and-tally theme is supported
  return TAG_AND_TALLY;
}

export class TextMapper extends MarkdownRenderChild {
  textMapperEl: HTMLDivElement;
  svgEl: CustomSVGElement | null = null;
  svgDomElement: SVGSVGElement | null = null;
  parser: TextMapperParser | null = null;
  plugin: TextMapperPlugin;
  private source: string;
  private docId: string;
  private sourcePath: string;

  // Pan and zoom state
  panX = 0;
  panY = 0;
  zoom = 1.0;
  isDragging = false;
  dragStartX = 0;
  dragStartY = 0;
  dragStartPanX = 0;
  dragStartPanY = 0;

  // Touch state
  touchStartX = 0;
  touchStartY = 0;
  touchStartPanX = 0;
  touchStartPanY = 0;

  // Content bounds for pan limits
  contentBounds: { minX: number; maxX: number; minY: number; maxY: number } | null = null;

  // Fixed viewBox dimensions
  fixedViewBoxWidth = 800;
  fixedViewBoxHeight = 600;

  // Zoom limits
  minZoom = 0.5;
  maxZoom = 4.0;

  constructor(containerEl: HTMLElement, docId: string, source: string, plugin: TextMapperPlugin, sourcePath?: string) {
    super(containerEl);
    this.plugin = plugin;
    this.source = source;
    this.docId = docId;
    this.sourcePath = sourcePath || '';
    this.textMapperEl = this.containerEl.createDiv({ cls: 'textmapper' });

    this.render();

    // Register with plugin
    plugin.registerMapper(this);
  }

  onunload() {
    // Unregister from plugin
    this.plugin.unregisterMapper(this);
    super.onunload();
  }

  refresh() {
    // Only refresh if this mapper doesn't have a theme override in source
    // (mappers with theme override shouldn't change when default changes)
    const themeFromSource = getThemeFromSource(this.source);
    if (!themeFromSource) {
      // Reset pan and zoom state
      this.panX = 0;
      this.panY = 0;
      this.zoom = 1.0;
      this.isDragging = false;

      this.textMapperEl.empty();
      this.render();
    }
  }

  private render() {
    // Determine which theme to use
    const themeFromSource = getThemeFromSource(this.source);
    // Only tag-and-tally theme is supported
    const themeName = themeFromSource || 'tag-and-tally';
    const themeConstant = getThemeConstant(themeName);

    const useDungeonOnly = textMapperSourceIsDungeon(this.source);
    const useCityOnly = textMapperSourceIsCity(this.source);
    const totalSource =
      useDungeonOnly || useCityOnly
        ? this.source.split('\n')
        : themeConstant.split('\n').concat(this.source.split('\n'));

    this.parser = new TextMapperParser(this.docId);
    this.parser.process(totalSource);
    this.svgEl = this.parser.svg(this.textMapperEl);

    // Get the actual DOM element
    this.svgDomElement = this.textMapperEl.querySelector('svg') as SVGSVGElement;

    // Get content bounds for pan limits
    this.contentBounds = this.parser.getContentBounds();

    // Extract and apply zoom option from source
    const zoomFromSource = getZoomFromSource(this.source);
    if (zoomFromSource !== null) {
      // Apply zoom, respecting min/max limits
      this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoomFromSource));
    }

    // Setup event handlers
    this.setupEventHandlers();

    // Set initial cursor style and update viewBox
    if (this.svgDomElement) {
      this.svgDomElement.style.cursor = 'grab';
      // Ensure initial viewBox is set correctly with the configured zoom
      this.updateViewBox();

      // Apply faction overlay visibility state from settings
      this.applyFactionOverlayVisibility();
    }
  }

  applyFactionOverlayVisibility() {
    if (!this.svgDomElement || !this.parser) return;

    // Find the faction overlays group using the namespace
    const factionOverlaysId = this.parser.options.global ? 'faction-overlays' : `faction-overlays-${this.parser.id}`;
    const factionOverlaysEl = this.svgDomElement.querySelector(`#${factionOverlaysId}`) as SVGGElement;

    if (factionOverlaysEl) {
      factionOverlaysEl.style.display = this.plugin.settings.factionOverlaysVisible ? '' : 'none';
    }
  }

  setupEventHandlers() {
    if (!this.svgDomElement) return;

    const svgElement = this.svgDomElement;

    // Mouse events for panning
    svgElement.addEventListener('mousedown', this.handleMouseDown.bind(this));
    svgElement.addEventListener('mousemove', this.handleMouseMove.bind(this));
    svgElement.addEventListener('mouseup', this.handleMouseUp.bind(this));
    svgElement.addEventListener('mouseleave', this.handleMouseUp.bind(this));

    // Touch events for mobile panning
    svgElement.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    svgElement.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    svgElement.addEventListener('touchend', this.handleTouchEnd.bind(this));

    // Wheel event for zooming
    svgElement.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

    // Context menu event for save option
    svgElement.addEventListener('contextmenu', this.handleContextMenu.bind(this));

    // Double-click event to re-center
    svgElement.addEventListener('dblclick', this.handleDoubleClick.bind(this));
  }

  handleMouseDown(e: MouseEvent) {
    if (e.button !== 0 || !this.svgDomElement) return; // Only handle left mouse button

    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragStartPanX = this.panX;
    this.dragStartPanY = this.panY;

    this.svgDomElement.style.cursor = 'grabbing';
  }

  handleMouseMove(e: MouseEvent) {
    if (!this.isDragging || !this.svgDomElement) return;

    const deltaX = e.clientX - this.dragStartX;
    const deltaY = e.clientY - this.dragStartY;

    // Convert screen delta to SVG coordinate delta
    const rect = this.svgDomElement.getBoundingClientRect();
    const svgDeltaX = (deltaX / rect.width) * (this.fixedViewBoxWidth / this.zoom);
    const svgDeltaY = (deltaY / rect.height) * (this.fixedViewBoxHeight / this.zoom);

    this.panX = this.dragStartPanX - svgDeltaX;
    this.panY = this.dragStartPanY - svgDeltaY;

    this.applyPanLimits();
    this.updateViewBox();
  }

  handleMouseUp(e: MouseEvent) {
    if (!this.isDragging || !this.svgDomElement) return;

    this.isDragging = false;
    this.svgDomElement.style.cursor = 'grab';
  }

  handleTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1 || !this.svgDomElement) return; // Only handle single touch for now

    e.preventDefault();

    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartPanX = this.panX;
    this.touchStartPanY = this.panY;
  }

  handleTouchMove(e: TouchEvent) {
    if (e.touches.length !== 1 || !this.svgDomElement) return;

    e.preventDefault();

    const touch = e.touches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;

    // Convert screen delta to SVG coordinate delta
    const rect = this.svgDomElement.getBoundingClientRect();
    const svgDeltaX = (deltaX / rect.width) * (this.fixedViewBoxWidth / this.zoom);
    const svgDeltaY = (deltaY / rect.height) * (this.fixedViewBoxHeight / this.zoom);

    this.panX = this.touchStartPanX - svgDeltaX;
    this.panY = this.touchStartPanY - svgDeltaY;

    this.applyPanLimits();
    this.updateViewBox();
  }

  handleTouchEnd(e: TouchEvent) {
    // Touch ended, nothing to do
  }

  handleWheel(e: WheelEvent) {
    e.preventDefault();

    if (!this.svgDomElement) return;

    const rect = this.svgDomElement.getBoundingClientRect();

    // Get mouse position relative to SVG
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert to SVG coordinates (before zoom)
    const svgX = (mouseX / rect.width) * (this.fixedViewBoxWidth / this.zoom) + this.getViewBoxX();
    const svgY = (mouseY / rect.height) * (this.fixedViewBoxHeight / this.zoom) + this.getViewBoxY();

    // Calculate zoom delta
    const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * zoomDelta));

    if (newZoom === this.zoom) return; // Zoom limit reached

    // Calculate new pan to keep the point under mouse cursor in the same place
    const newViewBoxWidth = this.fixedViewBoxWidth / newZoom;
    const newViewBoxHeight = this.fixedViewBoxHeight / newZoom;

    const newViewBoxX = svgX - (mouseX / rect.width) * newViewBoxWidth;
    const newViewBoxY = svgY - (mouseY / rect.height) * newViewBoxHeight;

    // Update zoom and pan
    this.zoom = newZoom;
    if (!this.parser) return;
    const initialCenter = this.parser.getInitialCenter();
    this.panX = newViewBoxX - (initialCenter.x - newViewBoxWidth / 2);
    this.panY = newViewBoxY - (initialCenter.y - newViewBoxHeight / 2);

    this.applyPanLimits();
    this.updateViewBox();
  }

  getViewBoxX(): number {
    if (!this.parser) return 0;
    const initialCenter = this.parser.getInitialCenter();
    const viewBoxWidth = this.fixedViewBoxWidth / this.zoom;
    return initialCenter.x - viewBoxWidth / 2 + this.panX;
  }

  getViewBoxY(): number {
    if (!this.parser) return 0;
    const initialCenter = this.parser.getInitialCenter();
    const viewBoxHeight = this.fixedViewBoxHeight / this.zoom;
    return initialCenter.y - viewBoxHeight / 2 + this.panY;
  }

  applyPanLimits() {
    if (!this.contentBounds || !this.parser) return;

    const viewBoxWidth = this.fixedViewBoxWidth / this.zoom;
    const viewBoxHeight = this.fixedViewBoxHeight / this.zoom;
    const initialCenter = this.parser.getInitialCenter();

    // Calculate limits based on viewBox boundaries
    // viewBoxX = initialCenter.x - viewBoxWidth/2 + panX
    // We need: viewBoxX >= contentBounds.minX and viewBoxX + viewBoxWidth <= contentBounds.maxX
    const minPanX = this.contentBounds.minX - initialCenter.x + viewBoxWidth / 2;
    const maxPanX = this.contentBounds.maxX - initialCenter.x - viewBoxWidth / 2;

    // Similar for Y
    const minPanY = this.contentBounds.minY - initialCenter.y + viewBoxHeight / 2;
    const maxPanY = this.contentBounds.maxY - initialCenter.y - viewBoxHeight / 2;

    // Apply constraints
    this.panX = Math.max(minPanX, Math.min(maxPanX, this.panX));
    this.panY = Math.max(minPanY, Math.min(maxPanY, this.panY));
  }

  updateViewBox() {
    if (!this.svgDomElement) return;

    const viewBoxX = this.getViewBoxX();
    const viewBoxY = this.getViewBoxY();
    const viewBoxWidth = this.fixedViewBoxWidth / this.zoom;
    const viewBoxHeight = this.fixedViewBoxHeight / this.zoom;

    this.svgDomElement.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`);
  }

  handleDoubleClick(e: MouseEvent) {
    // Re-center the map on double-click
    this.recenter();
  }

  recenter() {
    // Reset pan to center on the initial center point
    this.panX = 0;
    this.panY = 0;
    this.applyPanLimits();
    this.updateViewBox();
  }

  centerOnHex(x: number, y: number) {
    if (!this.parser || this.parser.isDungeonMap()) return;

    const hexPoint = this.parser.orientation.pixels(new Point(x, y));
    const initialCenter = this.parser.getInitialCenter();
    const viewBoxWidth = this.fixedViewBoxWidth / this.zoom;
    const viewBoxHeight = this.fixedViewBoxHeight / this.zoom;

    // Calculate pan to center the hex in the view
    this.panX = hexPoint.x - initialCenter.x;
    this.panY = hexPoint.y - initialCenter.y;

    this.applyPanLimits();
    this.updateViewBox();
  }

  handleContextMenu(e: MouseEvent) {
    if (!this.svgDomElement) return;

    e.preventDefault();

    const menu = new Menu();
    menu.addItem((item) => {
      item
        .setTitle('Re-center')
        .setIcon('crosshair')
        .onClick(() => {
          this.recenter();
        });
    });
    menu.addItem((item) => {
      item
        .setTitle('Save canvas as PNG')
        .setIcon('download')
        .onClick(() => {
          this.saveSvgAsPng();
        });
    });

    // Add separator if there are faction overlays
    const hasFactionOverlays = this.hasFactionOverlays();
    if (hasFactionOverlays) {
      menu.addSeparator();
      menu.addItem((item) => {
        item
          .setTitle(this.plugin.settings.factionOverlaysVisible ? 'Hide Faction Overlays' : 'Show Faction Overlays')
          .setIcon(this.plugin.settings.factionOverlaysVisible ? 'eye-off' : 'eye')
          .onClick(() => {
            this.toggleFactionOverlays();
          });
      });
    }

    menu.showAtPosition({ x: e.clientX, y: e.clientY });
  }

  hasFactionOverlays(): boolean {
    if (!this.svgDomElement || !this.parser) return false;

    // Find the faction overlays group using the namespace
    const factionOverlaysId = this.parser.options.global ? 'faction-overlays' : `faction-overlays-${this.parser.id}`;
    const factionOverlaysEl = this.svgDomElement.querySelector(`#${factionOverlaysId}`);

    return factionOverlaysEl !== null;
  }

  toggleFactionOverlays() {
    if (!this.svgDomElement || !this.parser) return;

    // Toggle the setting and save it
    this.plugin.settings.factionOverlaysVisible = !this.plugin.settings.factionOverlaysVisible;
    this.plugin.saveSettings();

    // Apply to all active mappers
    this.plugin.activeMappers.forEach((mapper) => {
      mapper.applyFactionOverlayVisibility();
    });
  }

  async saveSvgAsPng() {
    if (!this.svgDomElement || !this.parser) {
      new Notice('Error: SVG element not found');
      return;
    }

    try {
      // Get the full content bounds for the PNG
      const contentBounds = this.parser.getContentBounds();
      if (!contentBounds) {
        new Notice('Error: Could not determine map bounds');
        return;
      }

      // Calculate dimensions based on content bounds
      let width = contentBounds.maxX - contentBounds.minX;
      let height = contentBounds.maxY - contentBounds.minY;

      // Validate dimensions
      if (width <= 0 || height <= 0 || !isFinite(width) || !isFinite(height)) {
        new Notice('Error: Invalid map dimensions');
        return;
      }

      // Limit maximum canvas size to prevent browser issues
      // Most browsers have limits around 16k-32k pixels, but we'll be conservative
      const MAX_DIMENSION = 16384; // 16k pixels is safer
      let scale = 1.0;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.floor(width * scale);
        height = Math.floor(height * scale);
      }

      // Ensure dimensions are integers and at least 1 pixel
      width = Math.max(1, Math.floor(width));
      height = Math.max(1, Math.floor(height));

      // Create a clone of the SVG with the full viewBox
      const svgClone = this.svgDomElement.cloneNode(true) as SVGSVGElement;
      svgClone.setAttribute(
        'viewBox',
        `${contentBounds.minX} ${contentBounds.minY} ${contentBounds.maxX - contentBounds.minX} ${contentBounds.maxY - contentBounds.minY}`,
      );
      svgClone.setAttribute('width', width.toString());
      svgClone.setAttribute('height', height.toString());

      // Serialize SVG to string
      const svgData = new XMLSerializer().serializeToString(svgClone);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      // Create canvas and draw SVG
      const canvas = document.createElement('canvas');

      // Set dimensions and validate
      canvas.width = width;
      canvas.height = height;

      // Verify canvas dimensions were set correctly
      if (canvas.width !== width || canvas.height !== height) {
        URL.revokeObjectURL(svgUrl);
        throw new Error(
          `Canvas dimensions mismatch: expected ${width}x${height}, got ${canvas.width}x${canvas.height}`,
        );
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: false });

      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        throw new Error('Could not create canvas context');
      }

      // Fill white background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);

      // Load SVG as image and draw on canvas
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Prevent CORS issues

      await new Promise<void>((resolve, reject) => {
        const imgTimeout = setTimeout(() => {
          URL.revokeObjectURL(svgUrl);
          reject(new Error('Timeout loading SVG image'));
        }, 10000); // 10 second timeout for image loading

        img.onload = () => {
          clearTimeout(imgTimeout);
          try {
            ctx.drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(svgUrl);
            resolve();
          } catch (error) {
            URL.revokeObjectURL(svgUrl);
            reject(
              new Error(`Failed to draw image on canvas: ${error instanceof Error ? error.message : String(error)}`),
            );
          }
        };
        img.onerror = (error) => {
          clearTimeout(imgTimeout);
          URL.revokeObjectURL(svgUrl);
          reject(new Error(`Failed to load SVG image: ${error}`));
        };
        img.src = svgUrl;
      });

      // Validate canvas before conversion
      if (canvas.width === 0 || canvas.height === 0) {
        throw new Error(`Invalid canvas dimensions: ${canvas.width}x${canvas.height}`);
      }

      // Convert canvas to blob using toDataURL (more reliable than toBlob)
      let blob: Blob;
      try {
        // Use toDataURL which is more reliable across browsers
        const dataUrl = canvas.toDataURL('image/png');
        if (!dataUrl || dataUrl === 'data:,' || dataUrl.length < 100) {
          throw new Error(`toDataURL returned invalid data (length: ${dataUrl?.length || 0})`);
        }

        // Convert data URL to blob
        const response = await fetch(dataUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch data URL: ${response.status} ${response.statusText}`);
        }
        blob = await response.blob();
        if (!blob || blob.size === 0) {
          throw new Error(`Blob from data URL is empty (size: ${blob?.size || 0})`);
        }
      } catch (error) {
        // If toDataURL fails, try toBlob as fallback
        console.warn('toDataURL failed, trying toBlob fallback:', error);
        try {
          blob = await new Promise<Blob>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Timeout: Canvas conversion took too long'));
            }, 30000);

            canvas.toBlob(
              (result) => {
                clearTimeout(timeout);
                if (result) {
                  resolve(result);
                } else {
                  reject(new Error('toBlob returned null'));
                }
              },
              'image/png',
              1.0,
            );
          });
        } catch (fallbackError) {
          const errorMsg =
            `Failed to convert canvas (${canvas.width}x${canvas.height}) to blob. ` +
            `Primary method (toDataURL) error: ${error instanceof Error ? error.message : String(error)}. ` +
            `Fallback method (toBlob) error: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`;
          throw new Error(errorMsg);
        }
      }

      // Get current file to determine save location
      const activeFile = this.plugin.app.workspace.getActiveFile();
      let basePath = '';
      let baseName = 'text-mapper-export';

      if (activeFile) {
        const filePath = activeFile.path;
        const lastSlash = filePath.lastIndexOf('/');
        if (lastSlash >= 0) {
          basePath = filePath.substring(0, lastSlash + 1);
        }
        baseName = activeFile.basename;
      }

      // Use settings save location if configured
      let savePath = '';
      if (this.plugin.settings.saveLocation) {
        // Ensure the folder exists
        const folderPath = this.plugin.settings.saveLocation;
        const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
          try {
            await this.plugin.app.vault.createFolder(folderPath);
          } catch (error) {
            // Folder might already exist or path might be invalid
            console.warn('Could not create folder:', error);
          }
        }
        savePath = folderPath.endsWith('/') ? folderPath : folderPath + '/';
      } else {
        // If no save location is set, save in the same folder as the current note
        savePath = basePath;
      }

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `${savePath}${baseName}-${timestamp}.png`;

      // Save file
      await this.plugin.app.vault.createBinary(filename, await blob.arrayBuffer());

      new Notice(`Canvas saved as ${filename}`);
    } catch (error) {
      console.error('Error saving SVG as PNG:', error);
      new Notice(`Error saving canvas: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
