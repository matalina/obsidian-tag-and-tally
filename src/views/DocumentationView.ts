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
        container.setCssStyles({ width: "100%" });
        container.setCssStyles({ height: "100vh" });
        container.setCssStyles({ minHeight: "100vh" });
        container.setCssStyles({ maxHeight: "100%" });
        container.setCssStyles({ display: "flex" });
        container.setCssStyles({ flexDirection: "column" });
        container.setCssStyles({ boxSizing: "border-box" });
        container.setCssStyles({ overflow: "hidden" });
        // Keep hamburger and content below Obsidian's tab/title bar
        container.setCssStyles({ paddingTop: "3rem" });

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
