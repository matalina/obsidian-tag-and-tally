import type { App } from "obsidian";
import type TextMapperPlugin from "../../main";
import type { AiPluginSettings } from "../settings";
import type { VaultScope } from "../vaultScope";

export interface ToolContext {
  app: App;
  plugin: TextMapperPlugin;
  scope: VaultScope;
  settings: AiPluginSettings;
}

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

export interface ToolModule {
  schema: ToolSchema;
  handler: (
    args: Record<string, unknown>,
    ctx: ToolContext,
  ) => Promise<string>;
}
