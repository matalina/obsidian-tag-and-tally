# Tag and Tally

A plugin for [Obsidian](https://obsidian.md) that adds support for **Tag and Tally** games — a rules-light tabletop RPG system. The plugin provides in-vault tools for running sessions: dice rolling and resolution, an in-vault rulebook with search, NPC generation, card decks, and lookup tables.

## Features

- **Resolution roller** — inline rolls with full Tag and Tally resolution mechanics (advantage, disadvantage, tag bonuses, qualifiers).
- **Rulebook** — the complete Tag and Tally rulebook bundled with the plugin, searchable from the sidebar.
- **Tables and decks** — built-in random tables and card decks for prep and improv at the table.
- **NPC generator** — procedurally generates NPC appearance, traits, and hooks.
- **Dice roller** — standard polyhedral dice with quick presets.
- **Sidebar panel** — keeps tools and references within one click while you write or run a session.
- **AI assistant (optional, bring-your-own model)** — an opt-in chat sidebar for prep and at-the-table help. **Off by default** and does nothing until you point it at your own local model server (see below).

## Installation

### From the Obsidian community plugin directory

Once approved, the plugin will be available under **Settings → Community plugins → Browse → "Tag and Tally"**.

### Manual installation

1. Download `manifest.json`, `main.js`, and `styles.css` from the [latest release](https://github.com/matalina/obsidian-tag-and-tally/releases).
2. Copy them into `<your vault>/.obsidian/plugins/tag-and-tally/` (create the folder if needed).
3. Reload Obsidian and enable **Tag and Tally** under Settings → Community plugins.

## Usage

After enabling the plugin, open the **Tag and Tally** sidebar from the ribbon icon. The rulebook is browsable from the **Rulebook** tab and searchable via the `/docs` command in a chat-style input.

For inline dice resolution, use the resolution syntax described in the in-vault rulebook (Resolution chapter).

## AI assistant (optional)

Tag and Tally ships with an optional AI chat sidebar that can help with prep, lookups, and improv at the table. It is **not active out of the box** and the plugin does **not** bundle or download any AI model.

To enable it, you provide your own local model:

1. Install a local OpenAI-compatible model server such as [LM Studio](https://lmstudio.ai/) (other servers that expose the OpenAI chat-completions API also work).
2. Download an open-weights model into that server. The plugin has been developed against Gemma-class local models (the default model name in settings is `google/gemma-4-26b-a4b`), but any compatible chat model will work.
3. Start the local server. By default the plugin expects `http://127.0.0.1:1234/v1`; change the URL in **Settings → Tag and Tally → AI** to match wherever you are running it.

Until those steps are completed, the AI sidebar simply has nothing to talk to and will remain idle. The plugin never sends AI requests to any remote service — all chat traffic goes to the local URL you configure.

You also choose how much of your vault the AI is allowed to see, via **AI settings → Access mode**:

- **Whole vault** — the AI's search and `@mention` tools may look at any markdown file.
- **Specific folders** — restrict access to one or more folders you pick.
- **Specific files** — restrict access to an explicit list of files.

## Permissions and privacy

The plugin reuses Obsidian's vault API for all file access and stays within the rules an Obsidian community plugin is expected to follow. A few specifics that may show up in plugin reviews or security scans:

- **Vault file enumeration.** The plugin lists markdown files in your vault for three things:
  - the AI assistant's `@mention` autocomplete, vault search, and folder-listing tools (all gated by the Access mode you choose, and **inert until you configure a local model**);
  - the Travel map feature, which finds notes carrying a `mapId` in their frontmatter so it can plot them;
  - the sidebar's note-picker modal, which lets you choose a markdown file to display.
- **Clipboard write.** The plugin only writes to the system clipboard, and only when you explicitly click a copy action: copying an AI code block, copying a Travel-map location as markdown, or copying a dice/resolution result or random-table row from the Documentation and Tables UI so you can paste it into your notes. The plugin never reads the clipboard.
- **No filesystem access outside the vault.** All file I/O goes through Obsidian's `vault` API — the plugin does not use Node's `fs` module or any other path that would reach outside your vault.
- **No remote network calls for AI.** AI requests are sent only to the local URL you configure in AI settings. If that URL points to `127.0.0.1` / `localhost` (the default), traffic never leaves your machine.
- **Local persistence.** Plugin data is stored with Obsidian's built-in `loadData()` / `saveData()` API, not `localStorage` or `sessionStorage`.

## Compatibility

Requires Obsidian 1.4.0 or newer. Works on desktop and mobile.

## License

[MIT](LICENSE) — copyright (c) 2026 Alicia Wilkerson.
