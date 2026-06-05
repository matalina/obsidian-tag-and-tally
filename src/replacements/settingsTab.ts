import { Setting } from "obsidian";
import type TextMapperPlugin from "../main";

export function renderTextReplacementSettings(
  containerEl: HTMLElement,
  plugin: TextMapperPlugin,
  rerender: () => void,
): void {
  new Setting(containerEl)
    .setName("Text replacements")
    .setDesc(
      "Replace character combinations at the cursor when you invoke the 'Apply text replacement at cursor' command. Assign a hotkey in Settings → Hotkeys. Press Backspace immediately after a replacement to restore the original characters.",
    )
    .setHeading();

  new Setting(containerEl)
    .setName("Enable text replacements")
    .setDesc("Master switch — when off, the command does nothing even if rules are configured.")
    .addToggle((t) =>
      t
        .setValue(plugin.settings.textReplacementsEnabled)
        .onChange(async (v) => {
          plugin.settings.textReplacementsEnabled = v;
          await plugin.saveSettings();
        }),
    );

  plugin.settings.textReplacements.forEach((row, idx) => {
    const setting = new Setting(containerEl);
    setting.controlEl.setCssStyles({ gap: "var(--size-2-2)" });
    setting
      .addText((t) =>
        t
          .setPlaceholder("Trigger")
          .setValue(row.trigger)
          .onChange(async (v) => {
            row.trigger = v;
            await plugin.saveSettings();
          }),
      )
      .addText((t) =>
        t
          .setPlaceholder("Replacement")
          .setValue(row.replacement)
          .onChange(async (v) => {
            row.replacement = v;
            await plugin.saveSettings();
          }),
      )
      .addExtraButton((b) =>
        b
          .setIcon("trash")
          .setTooltip("Remove")
          .onClick(async () => {
            plugin.settings.textReplacements.splice(idx, 1);
            await plugin.saveSettings();
            rerender();
          }),
      );
  });

  new Setting(containerEl).addButton((b) =>
    b
      .setIcon("plus")
      .setButtonText("Add replacement")
      .onClick(async () => {
        plugin.settings.textReplacements.push({ trigger: "", replacement: "" });
        await plugin.saveSettings();
        rerender();
      }),
  );
}
