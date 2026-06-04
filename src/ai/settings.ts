export type AccessMode = "whole_vault" | "folders" | "files";

export interface AiPluginSettings {
  lmStudioBaseUrl: string;
  model: string;
  apiKey: string;
  accessMode: AccessMode;
  allowedFolders: string[];
  allowedFiles: string[];
  conversationFolder: string;
  maxToolOutputChars: number;
  maxSearchMatches: number;
  summaryPromptFile: string;
  evalPromptFile: string;
  askPromptFile: string;
  rulePromptFile: string;
}

export const DEFAULT_AI_SETTINGS: AiPluginSettings = {
  lmStudioBaseUrl: "http://127.0.0.1:1234/v1",
  model: "google/gemma-4-26b-a4b",
  apiKey: "",
  accessMode: "whole_vault",
  allowedFolders: [],
  allowedFiles: [],
  conversationFolder: "_chat",
  maxToolOutputChars: 120_000,
  maxSearchMatches: 40,
  summaryPromptFile: "summary",
  evalPromptFile: "eval",
  askPromptFile: "ask",
  rulePromptFile: "rule",
};

export function mergeAiSettings(raw: unknown): AiPluginSettings {
  const data = raw as Partial<AiPluginSettings> | undefined;
  return { ...DEFAULT_AI_SETTINGS, ...data };
}
