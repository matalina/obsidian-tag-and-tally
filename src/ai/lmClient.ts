import * as http from "http";
import * as https from "https";
import { URL } from "url";

async function readIncomingMessageText(
  res: http.IncomingMessage,
): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of res) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * POST JSON and return the response stream (Node http, not fetch — avoids browser CORS in Obsidian).
 */
function postJsonStream(
  urlStr: string,
  headers: Record<string, string>,
  body: string,
  signal: AbortSignal,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      return;
    }

    const u = new URL(urlStr);
    const isHttps = u.protocol === "https:";
    const lib = isHttps ? https : http;
    const defaultPort = isHttps ? 443 : 80;
    const port = u.port ? Number(u.port) : defaultPort;

    let req: http.ClientRequest;

    const onReqAbort = () => {
      req.destroy();
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    };

    req = lib.request(
      {
        hostname: u.hostname,
        port,
        path: `${u.pathname}${u.search}`,
        method: "POST",
        headers,
      },
      async (res) => {
        signal.removeEventListener("abort", onReqAbort);

        const code = res.statusCode ?? 0;
        if (code >= 400) {
          const errText = await readIncomingMessageText(res);
          let detail = errText;
          try {
            const j = JSON.parse(errText) as { error?: { message?: string } };
            if (j?.error?.message) detail = j.error.message;
          } catch {
            /* use raw */
          }
          reject(new Error(`LM Studio error ${code}: ${detail}`));
          return;
        }

        resolve(res);
      },
    );

    req.on("error", (err) => {
      signal.removeEventListener("abort", onReqAbort);
      reject(err);
    });

    signal.addEventListener("abort", onReqAbort, { once: true });

    req.write(body, "utf8");
    req.end();
  });
}

/** Build OpenAI-compatible chat completions URL from a base like http://host:1234/v1 */

export function chatCompletionsUrl(baseUrl: string): string {
  const t = baseUrl.trim().replace(/\/+$/, "");
  return `${t}/chat/completions`;
}

export type ChatMessage =
  | {
      role: "system" | "user" | "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
    }
  | {
      role: "tool";
      content: string;
      tool_call_id: string;
    };

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface StreamResult {
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason: string | null;
}

/**
 * One streaming request; aggregates assistant message and optional tool_calls.
 */
export async function streamChatCompletion(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools: unknown[];
  signal: AbortSignal;
  onAssistantTextChunk?: (chunk: string) => void;
}): Promise<StreamResult> {
  const url = chatCompletionsUrl(options.baseUrl);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.apiKey.trim()) {
    headers.Authorization = `Bearer ${options.apiKey.trim()}`;
  }

  const body = {
    model: options.model,
    messages: options.messages,
    tools: options.tools,
    stream: true,
    temperature: 0.2,
  };

  const payload = JSON.stringify(body);
  const reqHeaders: Record<string, string> = {
    ...headers,
    "Content-Length": String(Buffer.byteLength(payload, "utf8")),
  };

  // Use Node http(s) so requests are not subject to browser CORS (Obsidian origin is app://).
  const incoming = await postJsonStream(
    url,
    reqHeaders,
    payload,
    options.signal,
  );

  const onStreamAbort = () => incoming.destroy();
  options.signal.addEventListener("abort", onStreamAbort);

  const decoder = new TextDecoder();
  let buffer = "";

  let content = "";
  const toolMerge = new Map<
    number,
    { id?: string; name?: string; arguments: string }
  >();
  let finishReason: string | null = null;

  try {
    for await (const chunk of incoming) {
      buffer += decoder.decode(chunk as Buffer, { stream: true });

      let lineBreak: number;
      while ((lineBreak = buffer.indexOf("\n")) >= 0) {
        let line = buffer.slice(0, lineBreak);
        buffer = buffer.slice(lineBreak + 1);
        line = line.replace(/\r$/, "");
        if (!line.trim()) continue;
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          let json: {
            choices?: Array<{
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  index?: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
              finish_reason?: string | null;
            }>;
          };
          try {
            json = JSON.parse(data) as typeof json;
          } catch {
            continue;
          }
          const choice = json.choices?.[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;

          const delta = choice?.delta;
          if (delta?.content) {
            content += delta.content;
            options.onAssistantTextChunk?.(delta.content);
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              let slot = toolMerge.get(idx);
              if (!slot) {
                slot = { arguments: "" };
                toolMerge.set(idx, slot);
              }
              if (tc.id) slot.id = tc.id;
              if (tc.function?.name) slot.name = tc.function.name;
              if (tc.function?.arguments)
                slot.arguments += tc.function.arguments;
            }
          }
        }
      }
    }
  } finally {
    options.signal.removeEventListener("abort", onStreamAbort);
  }

  const toolCalls: ToolCall[] = [];
  const indices = [...toolMerge.keys()].sort((a, b) => a - b);
  for (const idx of indices) {
    const slot = toolMerge.get(idx);
    if (!slot?.name) continue;
    toolCalls.push({
      id: slot.id ?? `call_${idx}`,
      type: "function",
      function: {
        name: slot.name,
        arguments: slot.arguments,
      },
    });
  }

  return {
    message: {
      role: "assistant",
      content: content.length ? content : null,
      tool_calls: toolCalls.length ? toolCalls : undefined,
    },
    finish_reason: finishReason,
  };
}
