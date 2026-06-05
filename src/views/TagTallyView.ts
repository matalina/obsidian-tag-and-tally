import { ItemView, WorkspaceLeaf } from "obsidian";
import { mountSidebar } from "../sidebar/main";
import type TextMapperPlugin from "../main";

export const VIEW_TYPE_TAG_TALLY = "tag-tally-view";

export class TagTallyView extends ItemView {
    private plugin: TextMapperPlugin;
    private unmountVue: (() => void) | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: TextMapperPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_TAG_TALLY;
    }

    getDisplayText(): string {
        return "Tag and Tally";
    }

    getIcon(): string {
        return "tally-5";
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.setCssStyles({ display: "flex" });
        container.setCssStyles({ flexDirection: "column" });
        container.setCssStyles({ height: "100%" });

        const { unmount } = mountSidebar({
            container,
            plugin: this.plugin,
            obsidianApp: this.app,
        });
        this.unmountVue = unmount;
    }

    async onClose(): Promise<void> {
        if (this.unmountVue) {
            this.unmountVue();
            this.unmountVue = null;
        }
    }
}
