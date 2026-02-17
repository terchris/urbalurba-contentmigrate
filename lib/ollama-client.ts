/**
 * ollama-client.ts
 *
 * Ollama extraction client with structured output — schema v2.
 *
 * Input: clean Markdown from Crawl4AI (not raw HTML).
 * Two-pass extraction: classify with BaseSchema, then extract with
 * the archetype-specific schema.
 */

import { Ollama } from "ollama";
import { zodToJsonSchema } from "zod-to-json-schema";
import { BaseSchema, SCHEMAS, type ContentType } from "./schemas.js";
import { OLLAMA_SYSTEM_PROMPT, makeUserPrompt } from "./prompts.js";
import { OLLAMA_HOST, MODELS } from "./config.js";
import { cleanBody } from "./clean-body.js";

const ollama = new Ollama({
  host: OLLAMA_HOST,
  // 5 minute timeout for large pages
  fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(300_000) }),
});

/**
 * Trim Crawl4AI markdown for LLM metadata extraction.
 * Uses the shared `cleanBody()` for boilerplate removal, then caps at 4K.
 *
 * The 4K cap is safe for metadata — analysis of 919 pages shows title, author,
 * date, featured image, and tags appear in the first 2K chars on 95%+ of pages.
 * The cap only limits what the LLM sees; the full body goes to the .md file
 * via the orchestrator.
 */
function trimForExtraction(markdown: string): string {
  let text = cleanBody(markdown);

  // Cap at ~4000 chars — enough for metadata extraction
  if (text.length > 4000) {
    text = text.slice(0, 4000) + "\n\n[... truncated for metadata extraction]";
  }

  return text;
}

/**
 * Extract structured data from Markdown content using Ollama.
 *
 * Uses a two-pass approach:
 * 1. First pass with BaseSchema to classify content_type
 * 2. If archetype has extra fields (event, person, etc.), second pass
 *    with the full archetype schema
 *
 * If `contentTypeHint` is provided, skip pass 1 and go straight to the
 * archetype schema. This is used for pages where the content type is
 * known from URL pattern matching (e.g. debate/panel pages → "event").
 *
 * @param markdown - Clean Markdown content from Crawl4AI
 * @param urlPath - The original URL path (for context in the prompt)
 * @param contentTypeHint - Optional forced content type (skips classification)
 * @returns Extracted data as a plain object, or null if extraction failed
 */
export interface ExtractionResult {
  data: Record<string, unknown>;
  elapsed: number;
  promptTokens: number;
  completionTokens: number;
}

export async function extractWithOllama(
  markdown: string,
  urlPath: string,
  contentTypeHint?: ContentType | null
): Promise<ExtractionResult | null> {
  const startTime = Date.now();
  const trimmed = trimForExtraction(markdown);

  try {
    let contentType: ContentType;
    let baseResponse: Record<string, unknown> | null = null;

    if (contentTypeHint) {
      // --- Forced content type — skip classification pass ---
      contentType = contentTypeHint;
    } else {
      // --- Pass 1: Classify + extract base fields ---
      const baseJsonSchema = zodToJsonSchema(BaseSchema);

      const baseResp = await ollama.chat({
        model: MODELS.ollama,
        messages: [
          { role: "system", content: OLLAMA_SYSTEM_PROMPT },
          {
            role: "user",
            content: makeUserPrompt(
              `URL: ${urlPath}\n\n${trimmed}`
            ),
          },
        ],
        format: baseJsonSchema as Record<string, unknown>,
        options: {
          temperature: 0,
          num_ctx: 8192,
        },
        keep_alive: "10m",
      });

      baseResponse = baseResp as unknown as Record<string, unknown>;
      const baseRaw = JSON.parse(baseResp.message.content);
      const baseParsed = BaseSchema.parse(baseRaw);
      contentType = baseParsed.content_type as ContentType;

      // Simple archetype (blog, news, page, english_news) — base is enough
      const archetypesWithExtras = ["event", "person", "conference", "tech", "press"];
      if (!archetypesWithExtras.includes(contentType)) {
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
    const archetypeSchema = SCHEMAS[contentType];
    const fullJsonSchema = zodToJsonSchema(archetypeSchema);

    const fullResponse = await ollama.chat({
      model: MODELS.ollama,
      messages: [
        { role: "system", content: OLLAMA_SYSTEM_PROMPT },
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
        num_ctx: 8192,
      },
      keep_alive: "10m",
    });

    const fullRaw = JSON.parse(fullResponse.message.content);
    const fullParsed = archetypeSchema.parse(fullRaw);
    const elapsed = Date.now() - startTime;

    // Token counts: for two-pass, sum both passes; for forced, only the full pass
    const fr = fullResponse as unknown as Record<string, unknown>;
    let promptTokens = (fr.prompt_eval_count as number) || 0;
    let completionTokens = (fr.eval_count as number) || 0;
    if (!contentTypeHint) {
      // Two-pass: add base response tokens
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
 * Check if Ollama is reachable and the model is available.
 */
export async function checkOllamaReady(): Promise<boolean> {
  try {
    const response = await ollama.list();
    const modelNames = response.models.map((m) => m.name);
    return modelNames.some(
      (name) =>
        name === MODELS.ollama ||
        name.startsWith(`${MODELS.ollama.split(":")[0]}:`)
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Legacy HTML stripping (kept for potential fallback use)
// ---------------------------------------------------------------------------

/**
 * Extract only the useful content from Squarespace HTML.
 * Pulls meta tags (for og:title, og:image, dates) and the <article> content.
 *
 * @deprecated No longer used in the main pipeline — Crawl4AI provides clean markdown.
 */
export function stripHtmlBoilerplate(html: string): string {
  const parts: string[] = [];

  const metaTags = html.match(/<meta[^>]+(property|name|itemprop)="[^"]*"[^>]*>/gi) || [];
  const usefulMeta = metaTags.filter((tag) => {
    const lower = tag.toLowerCase();
    return (
      lower.includes('og:title') ||
      lower.includes('og:description') ||
      lower.includes('og:image') ||
      lower.includes('og:type') ||
      lower.includes('og:url') ||
      lower.includes('description') ||
      lower.includes('author') ||
      lower.includes('article:') ||
      lower.includes('datePublished') ||
      lower.includes('dateModified')
    );
  });
  if (usefulMeta.length > 0) {
    parts.push('<!-- META -->\n' + usefulMeta.join('\n'));
  }

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) {
    parts.push(`<title>${titleMatch[1]}</title>`);
  }

  const timeTags = html.match(/<time[^>]*>[^<]*<\/time>/gi) || [];
  if (timeTags.length > 0) {
    parts.push('<!-- DATES -->\n' + timeTags.join('\n'));
  }

  const jsonLd = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi) || [];
  if (jsonLd.length > 0) {
    parts.push('<!-- JSON-LD -->\n' + jsonLd.join('\n'));
  }

  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
  if (articleMatch) {
    let article = articleMatch[0];
    article = article.replace(/<script[\s\S]*?<\/script>/gi, '');
    article = article.replace(/<style[\s\S]*?<\/style>/gi, '');
    article = article.replace(/<svg[\s\S]*?<\/svg>/gi, '');
    article = article.replace(/<!--[\s\S]*?-->/g, '');
    article = article.replace(/\s+data-[a-z-]+="[^"]*"/gi, '');
    article = article.replace(/\s+style="[^"]*"/gi, '');
    article = article.replace(/\s+class="[^"]*sqs-[^"]*"/gi, '');
    article = article.replace(/\n\s*\n/g, '\n');
    article = article.replace(/  +/g, ' ');
    parts.push('<!-- ARTICLE -->\n' + article);
  }

  if (!articleMatch) {
    const mainMatch = html.match(/<main[\s\S]*?<\/main>/i);
    if (mainMatch) {
      let main = mainMatch[0];
      main = main.replace(/<script[\s\S]*?<\/script>/gi, '');
      main = main.replace(/<style[\s\S]*?<\/style>/gi, '');
      main = main.replace(/<svg[\s\S]*?<\/svg>/gi, '');
      main = main.replace(/<!--[\s\S]*?-->/g, '');
      main = main.replace(/\s+data-[a-z-]+="[^"]*"/gi, '');
      main = main.replace(/\s+style="[^"]*"/gi, '');
      main = main.replace(/\n\s*\n/g, '\n');
      main = main.replace(/  +/g, ' ');
      parts.push('<!-- MAIN -->\n' + main);
    }
  }

  if (parts.length <= 2) {
    let stripped = html;
    stripped = stripped.replace(/<head[\s\S]*?<\/head>/gi, '');
    stripped = stripped.replace(/<script[\s\S]*?<\/script>/gi, '');
    stripped = stripped.replace(/<style[\s\S]*?<\/style>/gi, '');
    stripped = stripped.replace(/<nav[\s\S]*?<\/nav>/gi, '');
    stripped = stripped.replace(/<footer[\s\S]*?<\/footer>/gi, '');
    stripped = stripped.replace(/<header[\s\S]*?<\/header>/gi, '');
    stripped = stripped.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
    stripped = stripped.replace(/<!--[\s\S]*?-->/g, '');
    stripped = stripped.replace(/<svg[\s\S]*?<\/svg>/gi, '');
    stripped = stripped.replace(/\s+data-[a-z-]+="[^"]*"/gi, '');
    stripped = stripped.replace(/\s+style="[^"]*"/gi, '');
    stripped = stripped.replace(/\n\s*\n/g, '\n');
    stripped = stripped.replace(/  +/g, ' ');
    return stripped.trim();
  }

  return parts.join('\n\n');
}
