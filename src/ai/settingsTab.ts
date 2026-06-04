import { Setting } from "obsidian";
import type TextMapperPlugin from "../main";
import type { AccessMode } from "./settings";

/**
 * Render the Tag and Tally AI settings section into an existing settings tab container.
 * Called from the main TextMapperSettingTab so AI settings live under the same
 * "Tag and Tally" pane in Obsidian's Settings panel (manifest name is shared
 * across all tabs for a single plugin, so two tabs would both display as
 * "Tag and Tally" — merge them into one instead).
 *
 * `rerender` is invoked when the access-mode dropdown toggles between
 * whole_vault / folders / files so the conditional inputs appear.
 */
export function renderAiSettings(
  containerEl: HTMLElement,
  plugin: TextMapperPlugin,
  rerender: () => void,
): void {
  containerEl.createEl("h2", { text: "Tag and Tally AI" });
  containerEl.createEl("p", {
    text: "Connect to a local LM Studio server (OpenAI-compatible API). Requests use Node networking (desktop), so LM Studio does not need CORS enabled.",
    cls: "setting-item-description",
  });

  new Setting(containerEl)
    .setName("LM Studio base URL")
    .setDesc("Must include /v1, e.g. http://127.0.0.1:1234/v1")
    .addText((text) =>
      text
        .setPlaceholder("http://127.0.0.1:1234/v1")
        .setValue(plugin.aiSettings.lmStudioBaseUrl)
        .onChange(async (v) => {
          plugin.aiSettings.lmStudioBaseUrl = v.trim();
          await plugin.saveAiSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Model")
    .setDesc(
      "Exact model id as shown in LM Studio (load the model there first).",
    )
    .addText((text) =>
      text.setValue(plugin.aiSettings.model).onChange(async (v) => {
        plugin.aiSettings.model = v.trim();
        await plugin.saveAiSettings();
      }),
    );

  new Setting(containerEl)
    .setName("API key (optional)")
    .setDesc(
      "LM Studio often accepts any non-empty key or none; leave blank if not required.",
    )
    .addText((text) => {
      text.inputEl.type = "password";
      text.setValue(plugin.aiSettings.apiKey).onChange(async (v) => {
        plugin.aiSettings.apiKey = v;
        await plugin.saveAiSettings();
      });
    });

  new Setting(containerEl)
    .setName("Access mode")
    .setDesc("What vault paths tools may read, write, and search.")
    .addDropdown((dd) =>
      dd
        .addOption("whole_vault", "Whole vault")
        .addOption("folders", "Specific folders only")
        .addOption("files", "Specific files only")
        .setValue(plugin.aiSettings.accessMode)
        .onChange(async (v) => {
          plugin.aiSettings.accessMode = v as AccessMode;
          await plugin.saveAiSettings();
          rerender();
        }),
    );

  if (plugin.aiSettings.accessMode === "folders") {
    new Setting(containerEl)
      .setName("Allowed folders")
      .setDesc("One vault-relative folder per line, e.g. Rules or GM/Secrets")
      .addTextArea((ta) => {
        ta.setValue(plugin.aiSettings.allowedFolders.join("\n"));
        ta.inputEl.rows = 6;
        ta.onChange(async (v) => {
          plugin.aiSettings.allowedFolders = v
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
          await plugin.saveAiSettings();
        });
      });
  }

  if (plugin.aiSettings.accessMode === "files") {
    new Setting(containerEl)
      .setName("Allowed files")
      .setDesc("One vault-relative path per line")
      .addTextArea((ta) => {
        ta.setValue(plugin.aiSettings.allowedFiles.join("\n"));
        ta.inputEl.rows = 8;
        ta.onChange(async (v) => {
          plugin.aiSettings.allowedFiles = v
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
          await plugin.saveAiSettings();
        });
      });
  }

  new Setting(containerEl)
    .setName("Conversation folder")
    .setDesc(
      "Saved chat logs go here. This folder is always readable/writable by tools for logs and when you ask about past chats.",
    )
    .addText((text) =>
      text
        .setValue(plugin.aiSettings.conversationFolder)
        .onChange(async (v) => {
          plugin.aiSettings.conversationFolder = v.trim() || "_chat";
          await plugin.saveAiSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Max chars per read_file result")
    .addText((text) =>
      text
        .setValue(String(plugin.aiSettings.maxToolOutputChars))
        .onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!Number.isNaN(n) && n > 0) {
            plugin.aiSettings.maxToolOutputChars = n;
            await plugin.saveAiSettings();
          }
        }),
    );

  new Setting(containerEl).setName("Max search matches").addText((text) =>
    text
      .setValue(String(plugin.aiSettings.maxSearchMatches))
      .onChange(async (v) => {
        const n = parseInt(v, 10);
        if (!Number.isNaN(n) && n > 0) {
          plugin.aiSettings.maxSearchMatches = n;
          await plugin.saveAiSettings();
        }
      }),
  );

  containerEl.createEl("h3", { text: "Inline AI commands" });
  containerEl.createEl("p", {
    text: "The inline `ai:*` commands always send a built-in base prompt (marker location, resolution-block format, character-context awareness, etc.). The files below supply the user-style portion (length, tone, output format) appended after the base. Files are looked up in the system prompt folder (default: _system/prompts); if a file isn't found, a built-in default user-style prompt is used.",
    cls: "setting-item-description",
  });

  new Setting(containerEl)
    .setName("Summary prompt filename")
    .setDesc(
      "Filename (without .md) inside the system prompt folder (default: _system/prompts) supplying the user-style portion of `ai:summary` (appended to the built-in base).",
    )
    .addText((text) =>
      text
        .setPlaceholder("summary")
        .setValue(plugin.aiSettings.summaryPromptFile)
        .onChange(async (v) => {
          plugin.aiSettings.summaryPromptFile = v.trim() || "summary";
          await plugin.saveAiSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Eval prompt filename")
    .setDesc(
      "Filename (without .md) inside the system prompt folder (default: _system/prompts) supplying the user-style portion of `ai:eval` (appended to the built-in base).",
    )
    .addText((text) =>
      text
        .setPlaceholder("eval")
        .setValue(plugin.aiSettings.evalPromptFile)
        .onChange(async (v) => {
          plugin.aiSettings.evalPromptFile = v.trim() || "eval";
          await plugin.saveAiSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Ask prompt filename")
    .setDesc(
      "Filename (without .md) inside the system prompt folder supplying the user-style portion of `ai:ask`. The question is the paragraph immediately above the marker; the rest of the note is sent as context.",
    )
    .addText((text) =>
      text
        .setPlaceholder("ask")
        .setValue(plugin.aiSettings.askPromptFile)
        .onChange(async (v) => {
          plugin.aiSettings.askPromptFile = v.trim() || "ask";
          await plugin.saveAiSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Rule prompt filename")
    .setDesc(
      "Filename (without .md) inside the system prompt folder supplying the user-style portion of `ai:rule`. The question is the paragraph immediately above the marker; the bundled Tag & Tally rulebook is sent as context (the rest of the note is NOT sent).",
    )
    .addText((text) =>
      text
        .setPlaceholder("rule")
        .setValue(plugin.aiSettings.rulePromptFile)
        .onChange(async (v) => {
          plugin.aiSettings.rulePromptFile = v.trim() || "rule";
          await plugin.saveAiSettings();
        }),
    );
}
