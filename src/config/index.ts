/**
 * src/config/index.ts
 *
 * SiteConfig facade — the single entry point for all config-driven functionality.
 *
 * Usage:
 *   import { createSiteConfigFacade, loadSiteConfig } from "./config/index.js";
 *
 *   const raw = await loadSiteConfig("./site-config.yaml");
 *   const site = createSiteConfigFacade(raw);
 *
 *   // Route a URL
 *   const route = site.classifyPage("/blogg/my-post");
 *   // route.contentType === "blog", route.outputDir === "blogg"
 *
 *   // Get schema for extraction
 *   const schema = site.schemas["blog"];
 *
 *   // Get prompt for extraction
 *   const prompt = site.getPrompt("blog");
 *
 *   // Clean body
 *   const cleaned = site.cleanBody(rawMarkdown);
 */

import { z } from "zod";
import type { SiteConfig } from "./site-config.schema.js";
import { buildAllSchemas } from "./schema-builder.js";
import { buildRouter, buildOutputDirMap, type RouteResult } from "./routing-builder.js";
import { buildCleanupFunction } from "./cleanup-builder.js";
import { buildPromptMap, getPrompt } from "./prompt-loader.js";

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export { loadSiteConfig, parseSiteConfig } from "./config-loader.js";
export type { SiteConfig } from "./site-config.schema.js";
export type { RouteResult } from "./routing-builder.js";

// ---------------------------------------------------------------------------
// SiteConfig facade
// ---------------------------------------------------------------------------

export interface SiteConfigFacade {
  /** The raw validated config */
  readonly config: SiteConfig;

  /** Site URL (e.g. "https://www.smartebyernorge.no") */
  readonly siteUrl: string;

  /** Site name (e.g. "Smarte Byer Norge") */
  readonly siteName: string;

  /** All content type names */
  readonly contentTypeNames: string[];

  /** Zod schemas keyed by content type name */
  readonly schemas: Record<string, z.ZodObject<any>>;

  /** Output directory map: content type → output dir */
  readonly outputDirs: Record<string, string>;

  /** Extraction prompts keyed by content type name */
  readonly prompts: Record<string, string>;

  /** LLM settings */
  readonly llm: {
    analysisModel: string;
    extractionModel: string;
    extractionContextSize: number;
    extractionMaxChars: number;
  };

  /** Crawl skip patterns (regex strings) */
  readonly crawlSkipPatterns: string[];

  /**
   * Classify a URL path into a content type.
   * Returns null if no pattern matches.
   */
  classifyPage(urlPath: string): RouteResult | null;

  /**
   * Get the extraction prompt for a content type.
   * Throws if content type not found.
   */
  getPrompt(contentType: string): string;

  /**
   * Clean boilerplate from markdown body.
   */
  cleanBody(markdown: string): string;
}

/**
 * Create a fully initialized SiteConfig facade from a validated config.
 * All schemas, routes, and functions are pre-compiled for performance.
 *
 * @param config - A validated SiteConfig (from loadSiteConfig or parseSiteConfig)
 * @returns A facade object with all config-driven functionality
 */
export function createSiteConfigFacade(config: SiteConfig): SiteConfigFacade {
  const schemas = buildAllSchemas(config);
  const classifyPage = buildRouter(config);
  const outputDirs = buildOutputDirMap(config);
  const prompts = buildPromptMap(config);
  const cleanBody = buildCleanupFunction(config);

  return {
    config,
    siteUrl: config.site.url,
    siteName: config.site.name,
    contentTypeNames: config.content_types.map((ct) => ct.name),
    schemas,
    outputDirs,
    prompts,
    llm: {
      analysisModel: config.llm.analysis_model,
      extractionModel: config.llm.extraction_model,
      extractionContextSize: config.llm.extraction_context_size,
      extractionMaxChars: config.llm.extraction_max_chars,
    },
    crawlSkipPatterns: config.crawl.skip_patterns,
    classifyPage,
    getPrompt: (contentType: string) => getPrompt(prompts, contentType),
    cleanBody,
  };
}
