import { ItemView, WorkspaceLeaf } from "obsidian";
import { createApp } from "vue";
import * as fs from "fs";
import * as path from "path";
import { RulebookApp, createRulebookRouter } from "@tag-and-tally/shared-ui";
import type TextMapperPlugin from "../main";
import type { RulebookPayload } from "@tag-and-tally/shared-ui";
import { searchIndex } from "../docs/search-index";

export const VIEW_TYPE_DOCUMENTATION = "tag-tally-documentation";

const PLUGIN_ID = "tag-and-tally";

export class DocumentationView extends ItemView {
    private plugin: TextMapperPlugin;
    private unmountVue: (() => void) | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: TextMapperPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_DOCUMENTATION;
    }

    getDisplayText(): string {
        return "Documentation";
    }

    getIcon(): string {
        return "tally-5";
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.classList.add("tag-tally-documentation-view");
        container.empty();
        container.style.width = "100%";
        container.style.height = "100vh";
        container.style.minHeight = "100vh";
        container.style.maxHeight = "100%";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.boxSizing = "border-box";
        container.style.overflow = "hidden";
        // Keep hamburger and content below Obsidian's tab/title bar
        container.style.paddingTop = "3rem";

        let payload: RulebookPayload = { nav: [], pages: [] };
        const vaultPath = (this.app.vault.adapter as { basePath?: string }).basePath ?? "";
        if (vaultPath) {
            const rulebookPath = path.join(vaultPath, ".obsidian", "plugins", PLUGIN_ID, "rulebook.json");
            try {
                const raw = fs.readFileSync(rulebookPath, "utf-8");
                const data: RulebookPayload = JSON.parse(raw);
                payload = { nav: data.nav ?? [], pages: data.pages ?? [] };
            } catch {
                // leave payload empty; component will show error
            }
        }

        const router = createRulebookRouter();
        const app = createApp(RulebookApp, { initialPayload: payload, searchIndex });
        app.use(router);
        app.mount(container);
        this.unmountVue = () => {
            app.unmount();
            container.empty();
            this.unmountVue = null;
        };
    }

    async onClose(): Promise<void> {
        if (this.unmountVue) {
            this.unmountVue();
        }
    }
}
