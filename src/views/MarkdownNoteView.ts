import { ItemView, WorkspaceLeaf, MarkdownRenderer, TFile, ViewStateResult } from "obsidian";
import type TextMapperPlugin from "../main";

export const VIEW_TYPE_MARKDOWN_NOTE = "tag-tally-markdown-note";

interface MarkdownNoteViewState {
    filePath?: string;
}

export class MarkdownNoteView extends ItemView {
    private plugin: TextMapperPlugin;
    private filePath: string;

    constructor(leaf: WorkspaceLeaf, plugin: TextMapperPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.filePath = "";
    }

    async onOpen(): Promise<void> {
        await this.renderContent();
    }

    async onClose(): Promise<void> {
        // Cleanup if necessary
    }

    /**
     * Override getState to persist the file path
     */
    getState(): MarkdownNoteViewState {
        return {
            filePath: this.filePath || undefined
        };
    }

    /**
     * Override setState to restore the file path
     */
    async setState(state: any, result: ViewStateResult): Promise<void> {
        // Handle state that might be wrapped in a state property
        const viewState = (state?.state || state) as MarkdownNoteViewState | null;
        if (viewState?.filePath) {
            this.filePath = viewState.filePath;
        }
        await super.setState(state, result);
        // Re-render content after state is set
        await this.renderContent();
    }

    async renderContent(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.setCssStyles({ width: "100%" });
        container.setCssStyles({ height: "100%" });
        container.setCssStyles({ overflow: "auto" });

        // If no file path is set, show placeholder
        if (!this.filePath) {
            container.createDiv({
                text: "No file selected. Use the command to open a markdown file.",
                attr: {
                    style: 'padding: 20px; text-align: center; color: var(--text-muted);'
                }
            });
            return;
        }

        try {
            // Get the file from the vault
            const file = this.plugin.app.vault.getAbstractFileByPath(this.filePath);
            
            if (!file || !(file instanceof TFile)) {
                container.createDiv({
                    text: `File not found: ${this.filePath}`,
                    attr: {
                        style: 'padding: 20px; color: var(--text-error);'
                    }
                });
                return;
            }

            // Read the markdown content
            const content = await this.plugin.app.vault.read(file);

            // Remove frontmatter if present
            let markdown = content;
            if (content.startsWith('---')) {
                const frontmatterEnd = content.indexOf('---', 3);
                if (frontmatterEnd !== -1) {
                    markdown = content.substring(frontmatterEnd + 3).trim();
                }
            }

            // Create a container for the rendered markdown
            const markdownContainer = container.createDiv({
                cls: 'markdown-preview-view markdown-rendered',
                attr: {
                    style: 'padding: 20px;'
                }
            });

            // Render the markdown using Obsidian's renderer
            await MarkdownRenderer.render(
                this.plugin.app,
                markdown,
                markdownContainer,
                this.filePath,
                this
            );
        } catch (error) {
            console.error('Error loading markdown note:', error);
            container.empty();
            container.createDiv({
                text: `Error loading note: ${error instanceof Error ? error.message : 'Unknown error'}`,
                attr: {
                    style: 'padding: 20px; color: var(--text-error);'
                }
            });
        }
    }

    getViewType(): string {
        return VIEW_TYPE_MARKDOWN_NOTE;
    }

    getDisplayText(): string {
        if (!this.filePath) {
            return "Markdown Note";
        }
        const fileName = this.filePath.split('/').pop()?.replace('.md', '') || 'Note';
        return fileName;
    }

    getIcon(): string {
        return "file-text";
    }

    /**
     * Set the file path for this view
     */
    async setFilePath(filePath: string): Promise<void> {
        this.filePath = filePath;
        await this.renderContent();
    }

    /**
     * Get the current file path
     */
    getFilePath(): string {
        return this.filePath;
    }
}
