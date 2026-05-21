import { createApp, type App as VueApp } from "vue";
import { createPinia } from "pinia";
import { useSidebarStore } from "@tag-and-tally/shared-ui";
import App from "./App.vue";
import type { App as ObsidianApp } from "obsidian";

export interface SidebarMountOptions {
    container: HTMLElement;
    plugin: { loadData: () => Promise<unknown>; saveData: (data: unknown) => Promise<void> };
    obsidianApp: ObsidianApp;
}

export function mountSidebar(options: SidebarMountOptions): { unmount: () => void } {
    const { container, plugin, obsidianApp } = options;
    const pinia = createPinia();
    const app: VueApp = createApp(App);
    app.use(pinia);
    // Resolve sidebar store with pinia instance so getActivePinia() isn't needed during root setup
    const sidebarStore = useSidebarStore(pinia);
    app.provide("sidebarStore", sidebarStore);
    app.provide("obsidianPlugin", plugin);
    app.provide("obsidianApp", obsidianApp);
    app.mount(container);
    return {
        unmount: () => {
            app.unmount();
            container.empty();
        },
    };
}
