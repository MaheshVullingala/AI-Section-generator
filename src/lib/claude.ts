import Anthropic from "@anthropic-ai/sdk";
import type { Scene } from "./scene/types";
import { applyNodePatches } from "./scene/ops";
import { normalizeScene, parseSceneJson } from "./scene/validate";

// Server-only. The API key is read from ANTHROPIC_API_KEY and never sent to the browser.
let client: Anthropic | null = null;
export function getClient(): Anthropic {
  // Streams send headers quickly, so this mostly catches requests that can't connect
  // (e.g. a blocked network or proxy) instead of hanging for many minutes.
  if (!client) client = new Anthropic({ timeout: 120_000, maxRetries: 1 });
  return client;
}

// Model routing. Sonnet writes the designs and refinements, Haiku writes the brief,
// and Opus is the optional "premium" mode for designs and refinements. All env-configurable.
export const GENERATE_MODEL = process.env.CLAUDE_GENERATE_MODEL || "claude-sonnet-5-5";
export const REFINE_MODEL = process.env.CLAUDE_REFINE_MODEL || "claude-sonnet-5-5";
export const PREMIUM_MODEL = process.env.CLAUDE_PREMIUM_MODEL || "claude-opus-5-5";
export const BRIEF_MODEL = process.env.CLAUDE_BRIEF_MODEL || "claude-haiku-5-5";
/** Briefs that need to open reference links use this model, since web fetch with filtering needs Sonnet or Opus. */
export const BRIEF_WEB_MODEL = process.env.CLAUDE_BRIEF_WEB_MODEL || "claude-sonnet-5-5";
/** Set CLAUDE_PREMIUM_ENABLED=false to hide the premium option on a server. */
export const PREMIUM_ENABLED = process.env.CLAUDE_PREMIUM_ENABLED !== "false";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const GENERATE_EFFORT = (process.env.CLAUDE_GENERATE_EFFORT || "medium") as Effort;
export const REFINE_EFFORT = (process.env.CLAUDE_REFINE_EFFORT || "medium") as Effort;

/** The model for designs or refinements, given whether the person turned on premium. */
export function designModel(kind: "generate" | "refine", premium?: boolean): string {
  if (premium && PREMIUM_ENABLED) return PREMIUM_MODEL;
  return kind === "generate" ? GENERATE_MODEL : REFINE_MODEL;
}

/** Haiku has no server-side refusal fallback, so a declined Haiku request is retried once on this model. */
const HAIKU_FALLBACK_MODEL = "claude-sonnet-5-5";
const isHaiku = (model: string) => model.startsWith("claude-haiku");

// USD per million tokens: [input, output, cache read, cache write (5 min)], checked against
// Anthropic's published prices in November 2026. Used for the usage log and the cost estimate.
const PRICES: Record<string, [number, number, number, number]> = {
  "claude-opus-5-5": [4, 20, 0.2, 5],
  "claude-opus-5": [5, 25, 0.5, 6.25],
  "claude-opus-4-8": [5, 25, 0.5, 6.25],
  "claude-sonnet-5-5": [2, 10, 0.1, 2.5],
  "claude-sonnet-5": [2, 10, 0.2, 2.5],
  "claude-haiku-5-5": [0.1, 0.5, 0.01, 0.125],
};
// Claude Haiku 5.5 charges a higher rate when the prompt is over 100K tokens.
const HAIKU_LONG: [number, number, number, number] = [0.5, 2.5, 0.05, 0.625];

export interface CallUsage {
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Estimated USD, or null for a model without a known price. */
  cost: number | null;
}

/** Token counts from a response and their estimated cost. */
export function usageOf(message: Anthropic.Beta.BetaMessage): CallUsage {
  const u = message.usage;
  const input = u.input_tokens ?? 0;
  const output = u.output_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const prompt = input + cacheRead + cacheWrite;
  const price = message.model.startsWith("claude-haiku-5-5") && prompt > 100_000 ? HAIKU_LONG : PRICES[message.model];
  const cost = price ? (input * price[0] + output * price[1] + cacheRead * price[2] + cacheWrite * price[3]) / 1e6 : null;
  return { model: message.model, input, output, cacheRead, cacheWrite, cost };
}

/** Logs one line per Claude call with its token counts and an estimated cost. */
function logUsage(label: string, message: Anthropic.Beta.BetaMessage, seconds: number): CallUsage {
  const usage = usageOf(message);
  const { input, output, cacheRead, cacheWrite, cost } = usage;
  console.log(
    `[claude] ${label} model=${message.model} in=${input} cache_read=${cacheRead} cache_write=${cacheWrite} out=${output}` +
      ` stop=${message.stop_reason} ${seconds.toFixed(1)}s${cost != null ? ` ~$${cost.toFixed(4)}` : ""}`,
  );
  return usage;
}

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
 *
 * Prompt caching: the system prompt and `cachedPrompt` (the design system and brief,
 * which repeat across the 3 designs and across refinements) sit before a cache
 * breakpoint; only `prompt` changes from request to request.
 *
 * Refusals: Sonnet and Opus use server-side fallbacks, which re-run the request on
 * another model if a safety classifier declines it (a false positive is possible on
 * design prompts). Haiku has no server-side fallback, so it is retried here on Sonnet.
 * With webFetch, Claude can open reference links the user shared.
 */
export async function complete(opts: {
  /** Short name for the usage log, e.g. "brief" or "design:clean". */
  label: string;
  model: string;
  effort: Effort;
  system: string;
  /** Stable context that repeats across requests. Cached. */
  cachedPrompt?: string;
  prompt: string;
  images?: PromptImage[];
  /** true: images go before the cache breakpoint (they repeat across the 3 designs). Default: after it. */
  cacheImages?: boolean;
  webFetch?: boolean;
  maxTokens?: number;
  /** Receives the token usage of every API call this request makes. */
  onUsage?: (usage: CallUsage) => void;
}): Promise<string> {
  try {
    return await run(opts);
  } catch (err) {
    if (!(err instanceof ClaudeRefusal) || !isHaiku(opts.model)) throw err;
    console.log(`[claude] ${opts.label} declined on ${opts.model}; retrying on ${HAIKU_FALLBACK_MODEL}`);
    return run({ ...opts, model: HAIKU_FALLBACK_MODEL });
  }
}

async function run(opts: Parameters<typeof complete>[0]): Promise<string> {
  const imageBlocks = (opts.images ?? []).map(
    (img): Anthropic.Beta.BetaContentBlockParam => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } }),
  );
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...(opts.cacheImages ? imageBlocks : []),
    ...(opts.cachedPrompt ? [{ type: "text" as const, text: opts.cachedPrompt, cache_control: { type: "ephemeral" as const } }] : []),
    ...(opts.cacheImages ? [] : imageBlocks),
    { type: "text", text: opts.prompt },
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];
  const haiku = isHaiku(opts.model);
  let text = "";
  // A server tool (web fetch) can pause a long turn; resume it a few times.
  for (let turn = 0; turn < 4; turn++) {
    const started = Date.now();
    const stream = getClient().beta.messages.stream({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 64000,
      // Haiku has no server-side fallback (a fallback list is rejected), so complete() retries it instead.
      ...(haiku ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
      output_config: { effort: opts.effort },
      // The system prompt is identical across requests, so cache it.
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      ...(opts.webFetch ? { tools: [{ type: "web_fetch_20260209" as const, name: "web_fetch" as const, max_uses: 4 }] } : {}),
      messages,
    });
    const message = await stream.finalMessage();
    const usage = logUsage(turn ? `${opts.label} (turn ${turn + 1})` : opts.label, message, (Date.now() - started) / 1000);
    opts.onUsage?.(usage);
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

/**
 * Parses a refinement: either a <patch> with only the changed nodes, merged into
 * the current scene, or a full <scene> when Claude rewrote most of the design.
 */
export function parseRefineResponse(text: string, current: Scene): { rationale: string; scene: Scene; patched: boolean } {
  const rationale = tag(text, "rationale");
  const patchRaw = tag(text, "patch");
  if (!patchRaw || text.includes("<scene>")) return { rationale, scene: parseSceneResponse(text).scene, patched: false };
  const patch = JSON.parse(patchRaw.slice(patchRaw.indexOf("{"), patchRaw.lastIndexOf("}") + 1)) as { nodes?: unknown; customCss?: unknown };
  const nodes = Array.isArray(patch.nodes) ? patch.nodes : [];
  const { scene, applied } = applyNodePatches(current, nodes);
  const cssChanged = typeof patch.customCss === "string";
  if (!applied && !cssChanged) throw new Error("Claude's change didn't match any element in the design. Try rephrasing it.");
  const merged = normalizeScene({ ...scene, customCss: cssChanged ? patch.customCss : scene.customCss });
  return { rationale, scene: merged, patched: true };
}

export function errorMessage(err: unknown): { message: string; status: number } {
  if (err instanceof ClaudeRefusal) return { message: err.message, status: 422 };
  if (err instanceof Anthropic.AuthenticationError)
    return { message: "The Anthropic API key is missing or invalid. Set ANTHROPIC_API_KEY on the server.", status: 500 };
  if (err instanceof Anthropic.RateLimitError) return { message: "Rate limited by the Anthropic API. Try again in a minute.", status: 429 };
  if (err instanceof Anthropic.APIConnectionTimeoutError)
    return { message: "Claude didn't respond in time. Check this computer can reach api.anthropic.com (VPN or proxy), then try again.", status: 504 };
  if (err instanceof Anthropic.APIConnectionError)
    return { message: "Couldn't reach the Anthropic API. Check your internet connection, VPN or proxy, then try again.", status: 502 };
  if (err instanceof Anthropic.APIError) return { message: `Anthropic API error (${err.status}): ${err.message}`, status: 502 };
  if (err instanceof Error && /authentication method/i.test(err.message))
    return { message: "No Anthropic API key found. Add ANTHROPIC_API_KEY to .env.local (or your Vercel project settings) and restart.", status: 500 };
  if (err instanceof SyntaxError) return { message: "Claude returned a design that couldn't be read. Please try again.", status: 502 };
  if (err instanceof Error) return { message: err.message, status: 500 };
  return { message: "Unknown error", status: 500 };
}
