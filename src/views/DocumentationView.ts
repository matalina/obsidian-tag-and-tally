import { ItemView, WorkspaceLeaf } from "obsidian";
import { createApp } from "vue";
import { RulebookApp, createRulebookRouter } from "@tag-and-tally/shared-ui";
import type TextMapperPlugin from "../main";
import { searchIndex } from "../docs/search-index";
import { rulebookPayload } from "../docs/rulebook";

export const VIEW_TYPE_DOCUMENTATION = "tag-tally-documentation";

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

        const router = createRulebookRouter();
        const app = createApp(RulebookApp, { initialPayload: rulebookPayload, searchIndex });
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
