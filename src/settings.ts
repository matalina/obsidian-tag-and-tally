import { App, PluginSettingTab, Setting } from "obsidian";
import type TextMapperPlugin from "./main";
import { renderAiSettings } from "./ai/settingsTab";
import { renderTextReplacementSettings } from "./replacements/settingsTab";

export interface TextReplacement {
    trigger: string;
    replacement: string;
}

export interface TextMapperSettings {
    saveLocation: string;
    customTablesFolder: string;
    systemPromptFolder: string;
    gmPersonalityFolder: string;
    globalPromptFolder: string;
    factionOverlaysVisible: boolean;
    textReplacementsEnabled: boolean;
    textReplacements: TextReplacement[];
}

export const DEFAULT_SETTINGS: TextMapperSettings = {
    saveLocation: "_saved-maps",
    customTablesFolder: "_tables",
    systemPromptFolder: "_system/prompts",
    gmPersonalityFolder: "_system/gm",
    globalPromptFolder: "_system/global",
    factionOverlaysVisible: true,
    textReplacementsEnabled: true,
    textReplacements: [],
};

export class TextMapperSettingTab extends PluginSettingTab {
    plugin: TextMapperPlugin;

    constructor(app: App, plugin: TextMapperPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl("h2", { text: "Text Mapper Settings" });

        new Setting(containerEl)
            .setName("Save location")
            .setDesc("Folder path where PNG exports will be saved (default: _saved-maps). Use an empty string to save in the same folder as the current note.")
            .addText((text) =>
                text
                    .setPlaceholder("_saved-maps")
                    .setValue(this.plugin.settings.saveLocation)
                    .onChange(async (value) => {
                        // Normalize the path: remove leading/trailing slashes, but keep internal structure
                        const normalized = value.trim().replace(/^\/+|\/+$/g, "");
                        this.plugin.settings.saveLocation = normalized;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Custom tables folder")
            .setDesc("Folder path where custom table markdown files are stored (default: _tables). Tables should be defined with '## table name' followed by a markdown table.")
            .addText((text) =>
                text
                    .setPlaceholder("_tables")
                    .setValue(this.plugin.settings.customTablesFolder)
                    .onChange(async (value) => {
                        // Normalize the path: remove leading/trailing slashes, but keep internal structure
                        const normalized = value.trim().replace(/^\/+|\/+$/g, "");
                        this.plugin.settings.customTablesFolder = normalized;
                        await this.plugin.saveSettings();
                        // Reload custom tables when setting changes
                        if (this.plugin.reloadCustomTables) {
                            await this.plugin.reloadCustomTables();
                        }
                    })
            );

        new Setting(containerEl)
            .setName("System prompt folder")
            .setDesc("Folder path where slash-command system prompts are stored (default: _system/prompts). Each markdown file is invokable as /<filename> at the start of a chat message; optional frontmatter 'name' and 'triggers' give it a display label and aliases.")
            .addText((text) =>
                text
                    .setPlaceholder("_system/prompts")
                    .setValue(this.plugin.settings.systemPromptFolder)
                    .onChange(async (value) => {
                        const normalized = value.trim().replace(/^\/+|\/+$/g, "");
                        this.plugin.settings.systemPromptFolder = normalized;
                        await this.plugin.saveSettings();
                        if (this.plugin.reloadSystemPrompts) {
                            await this.plugin.reloadSystemPrompts();
                        }
                    })
            );

        new Setting(containerEl)
            .setName("Global prompt folder")
            .setDesc("Folder path where always-on system prompts are stored (default: _system/global). Every markdown file in this folder is appended to the system prompt on every chat turn, after the selected GM personality. Use this for behavior rules, formatting preferences, or vault-wide instructions that should always apply.")
            .addText((text) =>
                text
                    .setPlaceholder("_system/global")
                    .setValue(this.plugin.settings.globalPromptFolder)
                    .onChange(async (value) => {
                        const normalized = value.trim().replace(/^\/+|\/+$/g, "");
                        this.plugin.settings.globalPromptFolder = normalized;
                        await this.plugin.saveSettings();
                        if (this.plugin.reloadGlobalPrompts) {
                            await this.plugin.reloadGlobalPrompts();
                        }
                    })
            );

        new Setting(containerEl)
            .setName("GM personality folder")
            .setDesc("Folder path where GM personality prompts are stored (default: _system/gm). Each markdown file becomes a selectable option in the AI chat's GM dropdown. Session defaults to 'System Default' (no personality) on new or cleared chats.")
            .addText((text) =>
                text
                    .setPlaceholder("_system/gm")
                    .setValue(this.plugin.settings.gmPersonalityFolder)
                    .onChange(async (value) => {
                        const normalized = value.trim().replace(/^\/+|\/+$/g, "");
                        this.plugin.settings.gmPersonalityFolder = normalized;
                        await this.plugin.saveSettings();
                        if (this.plugin.reloadGmPersonalities) {
                            await this.plugin.reloadGmPersonalities();
                        }
                    })
            );

        new Setting(containerEl)
            .setName("Plugin version")
            .setDesc(`Tag and Tally plugin v${this.plugin.manifest.version}`);

        renderTextReplacementSettings(containerEl, this.plugin, () => this.display());

        renderAiSettings(containerEl, this.plugin, () => this.display());
    }
}
