import { MarkdownRenderer, Notice, type App, type Component } from "obsidian";

/** Virtual path for wikilink/embed resolution when rendering chat markdown. */
export const MARKDOWN_RENDER_SOURCE_PATH = "_chat/.ai-render.md";

export const ASSISTANT_MARKDOWN_DEBOUNCE_MS = 200;

/**
 * Render assistant markdown into `body` (empties it first) and add copy buttons on fenced code blocks.
 */
export async function renderAssistantMarkdownBody(
  app: App,
  component: Component,
  body: HTMLElement,
  markdown: string,
): Promise<void> {
  body.empty();
  const wrap = body.createDiv({
    cls: "markdown-preview-view markdown-rendered tag-tally-ai-md-root",
  });
  await MarkdownRenderer.render(
    app,
    markdown,
    wrap,
    MARKDOWN_RENDER_SOURCE_PATH,
    component,
  );
  enhanceCodeBlocks(wrap);
}

/** Add a Copy control to each `pre` (fenced code); leaves `<code>` content untouched. */
export function enhanceCodeBlocks(container: HTMLElement): void {
  for (const pre of container.querySelectorAll("pre")) {
    if (pre.querySelector(":scope > .tag-tally-ai-code-copy")) continue;
    const code = pre.querySelector("code");
    if (!code) continue;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tag-tally-ai-code-copy";
    btn.textContent = "Copy";
    btn.setAttribute("aria-label", "Copy code to clipboard");

    btn.addEventListener("click", () => {
      void navigator.clipboard.writeText(code.textContent ?? "").then(
        () => new Notice("Copied to clipboard"),
        () => new Notice("Could not copy"),
      );
    });

    pre.insertBefore(btn, pre.firstChild);
  }
}
