import Anthropic from "@anthropic-ai/sdk";
import type { Scene } from "./scene/types";
import { parseSceneJson } from "./scene/validate";

// Server-only. The API key is read from ANTHROPIC_API_KEY and never sent to the browser.
let client: Anthropic | null = null;
export function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export const GENERATE_MODEL = process.env.CLAUDE_GENERATE_MODEL || "claude-opus-5-5";
export const REFINE_MODEL = process.env.CLAUDE_REFINE_MODEL || "claude-opus-5-5";
type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const GENERATE_EFFORT = (process.env.CLAUDE_GENERATE_EFFORT || "medium") as Effort;
export const REFINE_EFFORT = (process.env.CLAUDE_REFINE_EFFORT || "medium") as Effort;

export class ClaudeRefusal extends Error {}

export interface PromptImage {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  data: string; // base64, no data: prefix
}

/** Converts browser data: URLs into image blocks; anything else is dropped. */
export function imagesFromDataUrls(urls: string[]): PromptImage[] {
  const out: PromptImage[] = [];
  for (const u of urls.slice(0, 6)) {
    const m = u.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
    if (m) out.push({ mediaType: m[1] as PromptImage["mediaType"], data: m[2] });
  }
  return out;
}

/**
 * Streams a request and returns the final text.
 * Server-side fallbacks re-run the request on another model if a safety
 * classifier declines it (a false positive is possible on design prompts).
 * With webFetch, Claude can open reference links the user shared.
 */
export async function complete(opts: {
  model: string;
  effort: Effort;
  system: string;
  prompt: string;
  images?: PromptImage[];
  webFetch?: boolean;
  maxTokens?: number;
}): Promise<string> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...(opts.images ?? []).map(
      (img): Anthropic.Beta.BetaContentBlockParam => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } }),
    ),
    { type: "text", text: opts.prompt },
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];
  let text = "";
  // A server tool (web fetch) can pause a long turn; resume it a few times.
  for (let turn = 0; turn < 4; turn++) {
    const stream = getClient().beta.messages.stream({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opts.effort },
      // The system prompt is identical across requests, so cache it.
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      ...(opts.webFetch ? { tools: [{ type: "web_fetch_20260209" as const, name: "web_fetch" as const, max_uses: 4 }] } : {}),
      messages,
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      throw new ClaudeRefusal("Claude declined this request. Try rephrasing it.");
    }
    for (const block of message.content) {
      if (block.type === "text") text += block.text;
    }
    if (message.stop_reason === "max_tokens") {
      throw new Error("The response was cut off before it finished. Try a simpler request.");
    }
    if (message.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: message.content as Anthropic.Beta.BetaContentBlockParam[] });
  }
  return text;
}

function tag(text: string, name: string): string {
  const m = text.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : "";
}

/** Parses the tagged response format defined in the system prompt. */
export function parseSceneResponse(text: string): { name: string; rationale: string; scene: Scene } {
  const start = text.indexOf("<scene>");
  const end = text.lastIndexOf("</scene>");
  const body = start >= 0 && end > start ? text.slice(start + 7, end) : text;
  return { name: tag(text, "name") || "Untitled design", rationale: tag(text, "rationale"), scene: parseSceneJson(body) };
}

export function errorMessage(err: unknown): { message: string; status: number } {
  if (err instanceof ClaudeRefusal) return { message: err.message, status: 422 };
  if (err instanceof Anthropic.AuthenticationError)
    return { message: "The Anthropic API key is missing or invalid. Set ANTHROPIC_API_KEY on the server.", status: 500 };
  if (err instanceof Anthropic.RateLimitError) return { message: "Rate limited by the Anthropic API. Try again in a minute.", status: 429 };
  if (err instanceof Anthropic.APIError) return { message: `Anthropic API error (${err.status}): ${err.message}`, status: 502 };
  if (err instanceof Error && /authentication method/i.test(err.message))
    return { message: "No Anthropic API key found. Add ANTHROPIC_API_KEY to .env.local (or your Vercel project settings) and restart.", status: 500 };
  if (err instanceof SyntaxError) return { message: "Claude returned a design that couldn't be read. Please try again.", status: 502 };
  if (err instanceof Error) return { message: err.message, status: 500 };
  return { message: "Unknown error", status: 500 };
}
