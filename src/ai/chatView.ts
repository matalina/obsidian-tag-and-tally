import {
  ItemView,
  MarkdownRenderer,
  Notice,
  TFile,
  WorkspaceLeaf,
  normalizePath,
  type Vault,
} from "obsidian";
import type TextMapperPlugin from "../main";
import { runAgentTurn, type TurnHistory } from "./agent";
import {
  ASSISTANT_MARKDOWN_DEBOUNCE_MS,
  MARKDOWN_RENDER_SOURCE_PATH,
  enhanceCodeBlocks,
  renderAssistantMarkdownBody,
} from "./markdownChat";
import { buildAugmentedUserText } from "./attachmentContext";
import {
  getActiveMentionRange,
  getMentionCandidates,
  insertMentionPath,
  type MentionCandidate,
} from "./mentionPopover";
import {
  getActivePromptSlashRange,
  getPromptSlashCandidates,
  insertPromptSlash,
  type PromptSlashCandidate,
} from "./promptSlashPopover";
import { VaultScope } from "./vaultScope";

/**
 * Convert chat-style single newlines into markdown hard breaks so Shift+Enter
 * renders as a visible line break. Paragraph breaks (blank lines) are preserved.
 */
function toChatMarkdown(s: string): string {
  return s
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, "  \n"))
    .join("\n\n");
}

/**
 * Tools whose output is bulky reference material (file contents, search hits,
 * table listings) rather than a generated result the user is waiting to see.
 * These render with `<details>` closed by default.
 */
const COLLAPSED_BY_DEFAULT = new Set([
  "read_file",
  "write_file",
  "search_vault",
  "list_tables",
]);

/** One-line preview shown next to the tool name in the collapsed `<summary>`. */
function buildToolSummary(name: string, argsJson: string): string {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    /* ignore malformed args */
  }
  const pick = (k: string): string =>
    typeof args[k] === "string" ? (args[k] as string) : "";
  switch (name) {
    case "read_file":
      return pick("path");
    case "write_file": {
      const p = pick("path");
      const mode = pick("mode");
      return mode ? `${p} (${mode})` : p;
    }
    case "search_vault": {
      const q = pick("query");
      return q ? `"${q}"` : "";
    }
    case "list_tables": {
      const kind = pick("kind") || "all";
      const src = pick("source");
      return src ? `${kind} / ${src}` : kind;
    }
    default:
      return "";
  }
}

/** Human-readable duration for timers and footers (e.g. 3.4s or 2m 15s). */
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0.0s";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

async function ensureFolderExists(
  vault: Vault,
  folderPath: string,
): Promise<void> {
  const parts = folderPath.split("/").filter(Boolean);
  let acc = "";
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    if (!vault.getAbstractFileByPath(acc)) {
      await vault.createFolder(acc);
    }
  }
}

export const VIEW_TYPE_AI_CHAT = "tag-and-tally-ai-chat";

export class AiChatView extends ItemView {
  plugin: TextMapperPlugin;
  private prior: TurnHistory[] = [];
  private sessionId = crypto.randomUUID();
  private abort: AbortController | null = null;
  private messagesEl!: HTMLDivElement;
  private statusEl!: HTMLDivElement;
  private statusRowEl!: HTMLDivElement;
  private statusDotsEl!: HTMLDivElement;
  private statusMsgEl!: HTMLElement;
  private statusSepEl!: HTMLElement;
  private statusElapsedEl!: HTMLElement;
  private thinkingTimerId: number | null = null;
  private thinkingT0 = 0;
  /** Coalesced rAF id for scroll-to-bottom (streaming sends many updates). */
  private scrollMessagesRafId: number | null = null;
  /** Trailing debounce for markdown preview during streaming. */
  private markdownDebounceTimer: number | null = null;
  private inputEl!: HTMLTextAreaElement;
  private inputWrapEl!: HTMLDivElement;
  private mentionPopoverEl!: HTMLDivElement;
  private mentionListEl!: HTMLDivElement;
  /** After Escape, hide popover until @query changes. */
  private mentionClosedKey: string | null = null;
  private mentionSelectedIndex = 0;
  /** Resets selection when the active @query changes. */
  private mentionQuerySig = "";
  private slashPopoverEl!: HTMLDivElement;
  private slashListEl!: HTMLDivElement;
  private slashClosedKey: string | null = null;
  private slashSelectedIndex = 0;
  private slashQuerySig = "";
  private gmSelectEl!: HTMLSelectElement;
  private gmPersonality: string = "";
  private unsubscribeGm: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: TextMapperPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_AI_CHAT;
  }

  getDisplayText(): string {
    return "Tag and Tally AI";
  }

  getIcon(): string {
    return "message-square";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("tag-tally-ai-chat-view");
    const root = this.contentEl.createDiv({ cls: "tag-tally-ai-chat" });
    root.createDiv({
      cls: "tag-tally-ai-chat-header",
      text: "Chat (LM Studio)",
    });

    this.messagesEl = root.createDiv({ cls: "tag-tally-ai-chat-messages" });
    this.statusEl = root.createDiv({ cls: "tag-tally-ai-status" });
    this.statusRowEl = this.statusEl.createDiv({
      cls: "tag-tally-ai-status-row",
    });
    this.statusRowEl.style.display = "none";
    this.statusDotsEl = this.statusRowEl.createDiv({
      cls: "tag-tally-ai-thinking-dots",
    });
    this.statusDotsEl.setAttr("aria-hidden", "true");
    for (let i = 0; i < 3; i++) {
      this.statusDotsEl.createEl("span", { cls: "tag-tally-ai-thinking-dot" });
    }
    this.statusMsgEl = this.statusRowEl.createEl("span", {
      cls: "tag-tally-ai-status-msg",
    });
    this.statusSepEl = this.statusRowEl.createEl("span", {
      cls: "tag-tally-ai-status-sep",
      text: "·",
    });
    this.statusElapsedEl = this.statusRowEl.createEl("span", {
      cls: "tag-tally-ai-status-elapsed",
    });

    const toolbar = root.createDiv({ cls: "tag-tally-ai-toolbar" });
    toolbar.createEl(
      "button",
      { text: "Clear chat", cls: "tag-tally-button" },
      (b) => {
        b.addEventListener("click", () => this.clearChat());
      },
    );
    toolbar.createEl(
      "button",
      { text: "Stop", cls: "tag-tally-button" },
      (b) => {
        b.addEventListener("click", () => this.stopGeneration());
      },
    );
    this.gmSelectEl = toolbar.createEl("select", {
      cls: "tag-tally-select tag-tally-ai-gm-select",
    });
    this.gmSelectEl.title = "GM personality";
    this.gmSelectEl.addEventListener("change", () => {
      this.gmPersonality = this.gmSelectEl.value;
    });
    this.renderGmOptions();
    this.unsubscribeGm = this.plugin.gmPromptManager.onChange(() =>
      this.renderGmOptions(),
    );

    this.inputWrapEl = root.createDiv({
      cls: "tag-tally-ai-chat-input-row tag-tally-ai-input-wrap",
    });
    this.mentionPopoverEl = this.inputWrapEl.createDiv({
      cls: "tag-tally-ai-mention-popover",
    });
    this.mentionPopoverEl.style.display = "none";
    this.mentionListEl = this.mentionPopoverEl.createDiv({
      cls: "tag-tally-ai-mention-list",
    });
    this.slashPopoverEl = this.inputWrapEl.createDiv({
      cls: "tag-tally-ai-mention-popover tag-tally-ai-slash-popover",
    });
    this.slashPopoverEl.style.display = "none";
    this.slashListEl = this.slashPopoverEl.createDiv({
      cls: "tag-tally-ai-mention-list",
    });
    this.inputEl = this.inputWrapEl.createEl("textarea", {
      cls: "tag-tally-ai-input",
    });
    this.inputEl.placeholder =
      "Message… @ for notes · / for prompts · Enter send · Shift+Enter newline";
    this.inputEl.addEventListener("input", () => this.onComposerInput());
    this.inputEl.addEventListener("click", () => this.onComposerInput());
    this.inputEl.addEventListener("keyup", () => this.onComposerInput());
    this.inputEl.addEventListener("keydown", (e) => {
      if (this.handleSlashKeydown(e)) return;
      if (this.handleMentionKeydown(e)) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void this.send();
      }
    });
    this.inputWrapEl.createEl(
      "button",
      { text: "Send", cls: "tag-tally-button" },
      (b) => {
        b.addEventListener("click", () => void this.send());
      },
    );
  }

  async onClose(): Promise<void> {
    this.unsubscribeGm?.();
    this.unsubscribeGm = null;
  }

  private renderGmOptions(): void {
    const entries = this.plugin.gmPromptManager.listSync();
    const previous = this.gmPersonality;
    this.gmSelectEl.empty();
    const def = this.gmSelectEl.createEl("option", {
      text: "System Default",
      value: "",
    });
    def.title = "No GM personality — use default system prompt only";
    for (const entry of entries) {
      const display = entry.label || entry.name;
      this.gmSelectEl.createEl("option", { text: display, value: entry.name });
    }
    const stillExists = entries.some((e) => e.name === previous);
    this.gmSelectEl.value = stillExists ? previous : "";
    this.gmPersonality = this.gmSelectEl.value;
  }

  private onComposerInput(): void {
    const text = this.inputEl.value;
    const caret = this.inputEl.selectionStart ?? 0;

    const slashRange = getActivePromptSlashRange(text, caret);
    if (slashRange) {
      this.hideMentionPopover();
      if (`${slashRange.start}:${slashRange.query}` === this.slashClosedKey) {
        this.hideSlashPopover();
        return;
      }
      const sig = `${slashRange.start}|${slashRange.query}`;
      if (sig !== this.slashQuerySig) {
        this.slashQuerySig = sig;
        this.slashSelectedIndex = 0;
      }
      const cands = getPromptSlashCandidates(
        this.plugin.promptManager,
        slashRange.query,
      );
      this.slashSelectedIndex = Math.min(
        this.slashSelectedIndex,
        Math.max(0, cands.length - 1),
      );
      this.renderSlashCandidates(cands);
      this.slashPopoverEl.style.display = "block";
      return;
    }
    this.hideSlashPopover();
    this.slashClosedKey = null;

    const range = getActiveMentionRange(text, caret);
    if (!range) {
      this.hideMentionPopover();
      this.mentionClosedKey = null;
      return;
    }
    if (`${range.start}:${range.query}` === this.mentionClosedKey) {
      this.hideMentionPopover();
      return;
    }
    const sig = `${range.start}|${range.query}`;
    if (sig !== this.mentionQuerySig) {
      this.mentionQuerySig = sig;
      this.mentionSelectedIndex = 0;
    }
    const scope = new VaultScope(this.plugin.aiSettings);
    const cands = getMentionCandidates(this.plugin.app, scope, range.query);
    this.mentionSelectedIndex = Math.min(
      this.mentionSelectedIndex,
      Math.max(0, cands.length - 1),
    );
    this.renderMentionCandidates(cands);
    this.mentionPopoverEl.style.display = "block";
  }

  private hideSlashPopover(): void {
    this.slashPopoverEl.style.display = "none";
    this.slashListEl.empty();
    this.slashQuerySig = "";
  }

  private renderSlashCandidates(cands: PromptSlashCandidate[]): void {
    this.slashListEl.empty();
    if (cands.length === 0) {
      this.slashListEl.createDiv({
        cls: "tag-tally-ai-mention-empty",
        text: "No matching prompts in system prompt folder",
      });
      return;
    }
    cands.forEach((c, i) => {
      const row = this.slashListEl.createDiv({
        cls: "tag-tally-ai-mention-item",
      });
      if (i === this.slashSelectedIndex) {
        row.addClass("tag-tally-ai-mention-item--selected");
      }
      row.createDiv({
        cls: "tag-tally-ai-mention-item-label",
        text: `/${c.name}`,
      });
      if (c.label) {
        row.createDiv({
          cls: "tag-tally-ai-mention-item-path",
          text: c.label,
        });
      }
      row.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        this.applySlashPick(c.name);
      });
    });
  }

  private applySlashPick(promptName: string): void {
    const text = this.inputEl.value;
    const caret = this.inputEl.selectionStart ?? 0;
    const range = getActivePromptSlashRange(text, caret);
    if (!range) return;
    const { value, caret: newCaret } = insertPromptSlash(
      text,
      range,
      caret,
      promptName,
    );
    this.inputEl.value = value;
    this.inputEl.setSelectionRange(newCaret, newCaret);
    this.slashClosedKey = null;
    this.hideSlashPopover();
  }

  /** Returns true if the event was consumed (slash UI). */
  private handleSlashKeydown(e: KeyboardEvent): boolean {
    const text = this.inputEl.value;
    const caret = this.inputEl.selectionStart ?? 0;
    const range = getActivePromptSlashRange(text, caret);
    if (!range) {
      this.hideSlashPopover();
      return false;
    }
    const cands = getPromptSlashCandidates(
      this.plugin.promptManager,
      range.query,
    );

    if (e.key === "Escape") {
      this.slashClosedKey = `${range.start}:${range.query}`;
      this.hideSlashPopover();
      e.preventDefault();
      return true;
    }
    if (e.key === "ArrowDown" && cands.length > 0) {
      e.preventDefault();
      this.slashSelectedIndex = Math.min(
        this.slashSelectedIndex + 1,
        cands.length - 1,
      );
      this.renderSlashCandidates(cands);
      return true;
    }
    if (e.key === "ArrowUp" && cands.length > 0) {
      e.preventDefault();
      this.slashSelectedIndex = Math.max(this.slashSelectedIndex - 1, 0);
      this.renderSlashCandidates(cands);
      return true;
    }
    if (e.key === "Enter" && !e.shiftKey && cands.length > 0) {
      e.preventDefault();
      const pick = cands[this.slashSelectedIndex];
      if (pick) this.applySlashPick(pick.name);
      return true;
    }
    if (e.key === "Tab" && cands.length > 0) {
      e.preventDefault();
      const pick = cands[this.slashSelectedIndex];
      if (pick) this.applySlashPick(pick.name);
      return true;
    }
    return false;
  }

  private hideMentionPopover(): void {
    this.mentionPopoverEl.style.display = "none";
    this.mentionListEl.empty();
    this.mentionQuerySig = "";
  }

  private renderMentionCandidates(cands: MentionCandidate[]): void {
    this.mentionListEl.empty();
    if (cands.length === 0) {
      this.mentionListEl.createDiv({
        cls: "tag-tally-ai-mention-empty",
        text: "No matching markdown files",
      });
      return;
    }
    cands.forEach((c, i) => {
      const row = this.mentionListEl.createDiv({
        cls: "tag-tally-ai-mention-item",
      });
      if (i === this.mentionSelectedIndex) {
        row.addClass("tag-tally-ai-mention-item--selected");
      }
      row.createDiv({ cls: "tag-tally-ai-mention-item-label", text: c.label });
      row.createDiv({ cls: "tag-tally-ai-mention-item-path", text: c.path });
      row.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        this.applyMentionPick(c.path);
      });
    });
  }

  private applyMentionPick(vaultPath: string): void {
    const text = this.inputEl.value;
    const caret = this.inputEl.selectionStart ?? 0;
    const range = getActiveMentionRange(text, caret);
    if (!range) return;
    const { value, caret: newCaret } = insertMentionPath(
      text,
      range,
      caret,
      vaultPath,
    );
    this.inputEl.value = value;
    this.inputEl.setSelectionRange(newCaret, newCaret);
    this.mentionClosedKey = null;
    this.hideMentionPopover();
  }

  /** Returns true if the event was consumed (mention UI). */
  private handleMentionKeydown(e: KeyboardEvent): boolean {
    const text = this.inputEl.value;
    const caret = this.inputEl.selectionStart ?? 0;
    const range = getActiveMentionRange(text, caret);
    if (!range) {
      this.hideMentionPopover();
      return false;
    }

    const scope = new VaultScope(this.plugin.aiSettings);
    const cands = getMentionCandidates(this.plugin.app, scope, range.query);

    if (e.key === "Escape") {
      this.mentionClosedKey = `${range.start}:${range.query}`;
      this.hideMentionPopover();
      e.preventDefault();
      return true;
    }

    if (e.key === "ArrowDown" && cands.length > 0) {
      e.preventDefault();
      this.mentionSelectedIndex = Math.min(
        this.mentionSelectedIndex + 1,
        cands.length - 1,
      );
      this.renderMentionCandidates(cands);
      return true;
    }

    if (e.key === "ArrowUp" && cands.length > 0) {
      e.preventDefault();
      this.mentionSelectedIndex = Math.max(this.mentionSelectedIndex - 1, 0);
      this.renderMentionCandidates(cands);
      return true;
    }

    if (e.key === "Enter" && !e.shiftKey && cands.length > 0) {
      e.preventDefault();
      const pick = cands[this.mentionSelectedIndex];
      if (pick) this.applyMentionPick(pick.path);
      return true;
    }

    return false;
  }

  private clearChat(): void {
    this.prior = [];
    this.sessionId = crypto.randomUUID();
    this.messagesEl.empty();
    this.hideWorkingStatus();
    this.hideMentionPopover();
    this.hideSlashPopover();
    this.gmPersonality = "";
    if (this.gmSelectEl) this.gmSelectEl.value = "";
    new Notice("Chat cleared.");
  }

  private stopGeneration(): void {
    this.abort?.abort();
    this.abort = null;
    this.hideWorkingStatus();
  }

  private hideWorkingStatus(): void {
    this.stopThinkingClock();
    this.statusRowEl.style.display = "none";
    this.statusRowEl.removeClass("tag-tally-ai-status-row--active");
  }

  private stopThinkingClock(): void {
    if (this.thinkingTimerId != null) {
      window.clearInterval(this.thinkingTimerId);
      this.thinkingTimerId = null;
    }
  }

  /** Wall-clock from first LM/tool work for this send (for footer line). */
  private startThinkingClock(): void {
    this.thinkingT0 = performance.now();
    this.stopThinkingClock();
    const tick = (): void => {
      const sec = (performance.now() - this.thinkingT0) / 1000;
      this.statusElapsedEl.setText(formatDuration(sec));
    };
    tick();
    this.thinkingTimerId = window.setInterval(tick, 200);
  }

  private showWorkingStatus(message: string): void {
    this.statusMsgEl.setText(message);
    this.statusRowEl.style.display = "flex";
    this.statusRowEl.addClass("tag-tally-ai-status-row--active");
  }

  private beginWorkingStatus(message: string): void {
    this.startThinkingClock();
    this.showWorkingStatus(message);
  }

  /** Keep the scrollable transcript pinned to the latest content after layout. */
  private scrollMessagesToBottom(): void {
    if (this.scrollMessagesRafId != null) return;
    this.scrollMessagesRafId = window.requestAnimationFrame(() => {
      this.scrollMessagesRafId = null;
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
  }

  private clearMarkdownDebounce(): void {
    if (this.markdownDebounceTimer != null) {
      window.clearTimeout(this.markdownDebounceTimer);
      this.markdownDebounceTimer = null;
    }
  }

  private async flushAssistantMarkdown(
    body: HTMLDivElement,
    markdown: string,
  ): Promise<void> {
    await renderAssistantMarkdownBody(this.plugin.app, this, body, markdown);
    this.scrollMessagesToBottom();
  }

  private scheduleMarkdownRender(body: HTMLDivElement, markdown: string): void {
    this.clearMarkdownDebounce();
    this.markdownDebounceTimer = window.setTimeout(() => {
      this.markdownDebounceTimer = null;
      void this.flushAssistantMarkdown(body, markdown);
    }, ASSISTANT_MARKDOWN_DEBOUNCE_MS);
  }

  /** Plain multiline text (errors / cancel); not parsed as markdown. */
  private setAssistantPlain(body: HTMLDivElement, message: string): void {
    body.empty();
    body.createDiv({ cls: "tag-tally-ai-msg-plain", text: message });
    this.scrollMessagesToBottom();
  }

  private appendUserBubble(text: string): void {
    const wrap = this.messagesEl.createDiv({
      cls: "tag-tally-ai-msg tag-tally-ai-msg-user",
    });
    wrap.createDiv({ cls: "tag-tally-ai-msg-role", text: "You" });
    const body = wrap.createDiv({ cls: "tag-tally-ai-msg-body" });
    void renderAssistantMarkdownBody(
      this.plugin.app,
      this,
      body,
      toChatMarkdown(text),
    );
  }

  private async resolveAssistantRoleLabel(): Promise<string> {
    if (!this.gmPersonality) return "Assistant";
    const entry = await this.plugin.gmPromptManager.get(this.gmPersonality);
    if (!entry) return "Assistant";
    return entry.label || entry.name;
  }

  private appendAssistantShell(roleLabel: string): {
    body: HTMLDivElement;
    meta: HTMLDivElement;
    toolResults: HTMLDivElement;
  } {
    const wrap = this.messagesEl.createDiv({ cls: "tag-tally-ai-msg" });
    wrap.createDiv({ cls: "tag-tally-ai-msg-role", text: roleLabel });
    const toolResults = wrap.createDiv({ cls: "tag-tally-ai-tool-results" });
    const body = wrap.createDiv({ cls: "tag-tally-ai-msg-body" });
    const meta = wrap.createDiv({ cls: "tag-tally-ai-msg-meta" });
    return { body, meta, toolResults };
  }

  private async appendToolResult(
    container: HTMLElement,
    name: string,
    argsJson: string,
    output: string,
  ): Promise<void> {
    const details = container.createEl("details", {
      cls: "tag-tally-ai-tool-result",
    });
    if (!COLLAPSED_BY_DEFAULT.has(name)) details.setAttr("open", "");
    const summary = details.createEl("summary", {
      cls: "tag-tally-ai-tool-result-summary",
    });
    summary.createSpan({
      cls: "tag-tally-ai-tool-result-label",
      text: name,
    });
    const preview = buildToolSummary(name, argsJson);
    if (preview) {
      summary.createSpan({
        cls: "tag-tally-ai-tool-result-preview",
        text: preview,
      });
    }
    const body = details.createDiv({
      cls: "markdown-preview-view markdown-rendered tag-tally-ai-md-root tag-tally-ai-tool-result-body",
    });
    await MarkdownRenderer.render(
      this.plugin.app,
      output,
      body,
      MARKDOWN_RENDER_SOURCE_PATH,
      this,
    );
    enhanceCodeBlocks(body);
    this.scrollMessagesToBottom();
  }

  private serializeToolResults(
    results: Array<{ name: string; output: string }>,
  ): string {
    if (results.length === 0) return "";
    return results
      .map(({ name, output }) => {
        const quoted = output
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
        return `> [!tool]- ${name}\n${quoted}`;
      })
      .join("\n\n");
  }

  private async send(): Promise<void> {
    const raw = this.inputEl.value.trim();
    if (!raw) return;

    let apiUserText: string;
    try {
      apiUserText = await buildAugmentedUserText(
        this.plugin.app,
        this.plugin.aiSettings,
        raw,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new Notice(msg);
      return;
    }

    this.inputEl.value = "";
    this.hideMentionPopover();
    this.hideSlashPopover();
    this.appendUserBubble(raw);
    const roleLabel = await this.resolveAssistantRoleLabel();
    const { body, meta, toolResults } = this.appendAssistantShell(roleLabel);
    this.scrollMessagesToBottom();
    this.hideWorkingStatus();

    this.abort = new AbortController();
    let acc = "";
    const collectedToolResults: Array<{ name: string; output: string }> = [];
    const turnT0 = performance.now();
    try {
      this.beginWorkingStatus("Thinking…");
      const { assistantText } = await runAgentTurn({
        app: this.plugin.app,
        plugin: this.plugin,
        settings: this.plugin.aiSettings,
        prior: this.prior,
        userText: apiUserText,
        signal: this.abort.signal,
        gmPersonalityName: this.gmPersonality || null,
        onStreamRoundStart: () => {
          this.clearMarkdownDebounce();
          acc = "";
          body.empty();
          this.scrollMessagesToBottom();
        },
        onAssistantTextChunk: (chunk) => {
          const wasEmpty = acc.length === 0;
          acc += chunk;
          if (wasEmpty) {
            this.clearMarkdownDebounce();
            void this.flushAssistantMarkdown(body, acc);
          } else {
            this.scheduleMarkdownRender(body, acc);
          }
        },
        onStatus: (s) => this.showWorkingStatus(s),
        onToolResult: (name, argsJson, output) => {
          collectedToolResults.push({ name, output });
          void this.appendToolResult(toolResults, name, argsJson, output);
        },
      });
      this.clearMarkdownDebounce();
      const finalMd = acc.length > 0 ? acc : assistantText;
      await this.flushAssistantMarkdown(body, finalMd);
      const elapsedSec = (performance.now() - turnT0) / 1000;
      meta.setText(`Thought for ${formatDuration(elapsedSec)}`);
      this.scrollMessagesToBottom();
      const toolBlock = this.serializeToolResults(collectedToolResults);
      const persistedAssistant = toolBlock
        ? `${toolBlock}\n\n${assistantText}`
        : assistantText;
      this.prior.push({ role: "user", content: raw });
      this.prior.push({ role: "assistant", content: persistedAssistant });
      try {
        await this.persistConversationFile();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        new Notice(`Tag and Tally AI: could not save chat log — ${msg}`);
        console.error("Tag and Tally AI: failed to save conversation", e);
      }
    } catch (e) {
      this.clearMarkdownDebounce();
      const elapsedSec = (performance.now() - turnT0) / 1000;
      if (e instanceof Error && e.name === "AbortError") {
        this.setAssistantPlain(
          body,
          acc ? `${acc}\n\n[Cancelled]` : "[Cancelled]",
        );
        meta.setText(`Stopped after ${formatDuration(elapsedSec)} (cancelled)`);
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        this.setAssistantPlain(body, `Error: ${msg}`);
        meta.setText(`Failed after ${formatDuration(elapsedSec)}`);
      }
      this.scrollMessagesToBottom();
    } finally {
      this.abort = null;
      this.hideWorkingStatus();
    }
  }

  private async persistConversationFile(): Promise<void> {
    const raw = this.plugin.aiSettings.conversationFolder;
    const folder =
      (typeof raw === "string" ? raw : String(raw ?? "")).trim() || "_chat";
    const base = normalizePath(folder);
    const path = normalizePath(`${base}/session-${this.sessionId}.md`);

    const title =
      this.prior.find((t) => t.role === "user")?.content.slice(0, 80) ||
      "Conversation";

    const lines: string[] = [
      "---",
      `id: ${this.sessionId}`,
      `created: ${new Date().toISOString()}`,
      `title: ${JSON.stringify(title)}`,
      `model: ${this.plugin.aiSettings.model}`,
      "---",
      "",
    ];

    for (const t of this.prior) {
      lines.push(
        `## ${t.role === "user" ? "User" : "Assistant"}`,
        "",
        t.content,
        "",
        "---",
        "",
      );
    }

    const body = lines.join("\n");

    await ensureFolderExists(this.plugin.app.vault, base);
    const existing = this.plugin.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.plugin.app.vault.modify(existing, body);
    } else {
      await this.plugin.app.vault.create(path, body);
    }
  }
}
