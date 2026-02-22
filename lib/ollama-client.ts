/**
 * ollama-client.ts
 *
 * Ollama extraction client with structured output — config-driven.
 *
 * Input: clean Markdown from Crawl4AI (not raw HTML).
 * Two-pass extraction: classify with BaseSchema, then extract with
 * the archetype-specific schema.
 *
 * All site-specific configuration (schemas, prompts, models, cleanup)
 * comes from the ExtractionContext parameter.
 */

import { Ollama } from "ollama";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Context required for extraction — passed from the orchestrator.
 * All site-specific values come from SiteConfigFacade.
 */
export interface ExtractionContext {
  /** Zod schemas keyed by content type name */
  schemas: Record<string, z.ZodObject<any>>;

  /** Extraction prompt per content type (or a shared prompt for all) */
  prompts: Record<string, string>;

  /** Content type names that have extra fields (need two-pass) */
  typesWithExtras: string[];

  /** All content type names (for building base schema content_type enum) */
  contentTypeNames: string[];

  /** Model name (e.g. "gemma3:4b") */
  model: string;

  /** Ollama context window size */
  contextSize: number;

  /** Max chars to send to LLM */
  maxChars: number;

  /** Body cleanup function */
  cleanBody: (markdown: string) => string;
}

export interface ExtractionResult {
  data: Record<string, unknown>;
  elapsed: number;
  promptTokens: number;
  completionTokens: number;
}

// ---------------------------------------------------------------------------
// Ollama connection
// ---------------------------------------------------------------------------

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";

const ollama = new Ollama({
  host: OLLAMA_HOST,
  // 5 minute timeout for large pages
  fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(300_000) }),
});

// ---------------------------------------------------------------------------
// Trim for extraction
// ---------------------------------------------------------------------------

/**
 * Trim Crawl4AI markdown for LLM metadata extraction.
 * Uses the provided cleanup function for boilerplate removal, then caps at maxChars.
 */
export function trimForExtraction(
  markdown: string,
  cleanBody: (md: string) => string,
  maxChars: number
): string {
  let text = cleanBody(markdown);

  if (text.length > maxChars) {
    text = text.slice(0, maxChars) + "\n\n[... truncated for metadata extraction]";
  }

  return text;
}

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

function makeUserPrompt(markdown: string): string {
  return `Extract structured data from this Markdown content:\n\n${markdown}`;
}

// ---------------------------------------------------------------------------
// Build base schema dynamically
// ---------------------------------------------------------------------------

function buildBaseSchemaForExtraction(contentTypeNames: string[]): z.ZodObject<any> {
  return z.object({
    content_type: z
      .enum(contentTypeNames as [string, ...string[]])
      .describe("Content archetype"),
    title: z.string().describe("Page title (H1 or <title>)"),
    slug: z.string().describe("URL slug derived from path"),
    url_path: z.string().describe("Original full URL path"),
    language: z.enum(["nb", "en"]).describe("ISO 639-1: 'nb' for Norwegian bokmål, 'en' for English"),
    date: z.string().describe("Published date ISO 8601: 'YYYY-MM-DD' or empty string"),
    description: z.string().describe("Meta description or first paragraph excerpt, max 300 chars"),
    author: z.string().describe("Author name or empty string"),
    source_url: z.string().describe("Full original URL"),
    featured_image: z
      .object({
        src: z.string().describe("Original image URL"),
        alt: z.string().describe("Alt text or empty string"),
      })
      .optional()
      .describe("Hero/featured image — omit if none"),
    tags: z.array(z.string()).describe("Free-form tags"),
  });
}

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

/**
 * Extract structured data from Markdown content using Ollama.
 *
 * Uses a two-pass approach:
 * 1. First pass with BaseSchema to classify content_type
 * 2. If archetype has extra fields, second pass with full schema
 *
 * If `contentTypeHint` is provided, skip pass 1 and go straight to
 * the archetype schema.
 *
 * @param markdown - Clean Markdown content from Crawl4AI
 * @param urlPath - The original URL path (for context in the prompt)
 * @param contentTypeHint - Optional forced content type (skips classification)
 * @param ctx - Extraction context with schemas, prompts, and config
 * @returns Extracted data or null if extraction failed
 */
export async function extractWithOllama(
  markdown: string,
  urlPath: string,
  contentTypeHint: string | null | undefined,
  ctx: ExtractionContext
): Promise<ExtractionResult | null> {
  const startTime = Date.now();
  const trimmed = trimForExtraction(markdown, ctx.cleanBody, ctx.maxChars);

  // Get the prompt for the content type (use first available if no hint)
  const promptKey = contentTypeHint || Object.keys(ctx.prompts)[0];
  const systemPrompt = ctx.prompts[promptKey] || Object.values(ctx.prompts)[0];

  try {
    let contentType: string;
    let baseResponse: Record<string, unknown> | null = null;

    if (contentTypeHint) {
      contentType = contentTypeHint;
    } else {
      // --- Pass 1: Classify + extract base fields ---
      const baseSchema = buildBaseSchemaForExtraction(ctx.contentTypeNames);
      const baseJsonSchema = zodToJsonSchema(baseSchema);

      const baseResp = await ollama.chat({
        model: ctx.model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: makeUserPrompt(`URL: ${urlPath}\n\n${trimmed}`),
          },
        ],
        format: baseJsonSchema as Record<string, unknown>,
        options: {
          temperature: 0,
          num_ctx: ctx.contextSize,
        },
        keep_alive: "10m",
      });

      baseResponse = baseResp as unknown as Record<string, unknown>;
      const baseRaw = JSON.parse(baseResp.message.content);
      const baseParsed = baseSchema.parse(baseRaw);
      contentType = baseParsed.content_type as string;

      // Simple archetype (no extras) — base is enough
      if (!ctx.typesWithExtras.includes(contentType)) {
        const elapsed = Date.now() - startTime;
        console.log(`         📐 Single-pass (${contentType}), ${trimmed.length} chars (was ${markdown.length})`);
        return {
          data: baseParsed as unknown as Record<string, unknown>,
          elapsed,
          promptTokens: (baseResponse.prompt_eval_count as number) || 0,
          completionTokens: (baseResponse.eval_count as number) || 0,
        };
      }
    }

    // --- Pass 2 (or only pass if forced): Extract with archetype schema ---
    const archetypeSchema = ctx.schemas[contentType];
    if (!archetypeSchema) {
      console.error(`  ❌ No schema found for content type "${contentType}"`);
      return null;
    }

    const fullJsonSchema = zodToJsonSchema(archetypeSchema);

    // Use type-specific prompt if available
    const typePrompt = ctx.prompts[contentType] || systemPrompt;

    const fullResponse = await ollama.chat({
      model: ctx.model,
      messages: [
        { role: "system", content: typePrompt },
        {
          role: "user",
          content: makeUserPrompt(
            `URL: ${urlPath}\nContent type: ${contentType}\n\n${trimmed}`
          ),
        },
      ],
      format: fullJsonSchema as Record<string, unknown>,
      options: {
        temperature: 0,
        num_ctx: ctx.contextSize,
      },
      keep_alive: "10m",
    });

    const fullRaw = JSON.parse(fullResponse.message.content);
    const fullParsed = archetypeSchema.parse(fullRaw);
    const elapsed = Date.now() - startTime;

    const fr = fullResponse as unknown as Record<string, unknown>;
    let promptTokens = (fr.prompt_eval_count as number) || 0;
    let completionTokens = (fr.eval_count as number) || 0;
    if (!contentTypeHint && baseResponse) {
      const br = baseResponse as Record<string, unknown>;
      promptTokens += (br.prompt_eval_count as number) || 0;
      completionTokens += (br.eval_count as number) || 0;
    }

    const passLabel = contentTypeHint ? "Forced" : "Two-pass";
    console.log(`         📐 ${passLabel} (${contentType}), ${trimmed.length} chars (was ${markdown.length})`);
    return { data: fullParsed as Record<string, unknown>, elapsed, promptTokens, completionTokens };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ Ollama extraction failed for ${urlPath}: ${msg}`);
    return null;
  }
}

/**
 * Check if Ollama is reachable and a specific model is available.
 */
export async function checkOllamaReady(modelName: string): Promise<boolean> {
  try {
    const response = await ollama.list();
    const modelNames = response.models.map((m) => m.name);
    return modelNames.some(
      (name) =>
        name === modelName ||
        name.startsWith(`${modelName.split(":")[0]}:`)
    );
  } catch {
    return false;
  }
}
