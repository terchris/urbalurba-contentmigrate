/**
 * routing-builder.ts
 *
 * Builds a URL routing function from site-config.yaml content type definitions.
 * Replaces the hardcoded classifyPage() and SECTION_DIRS from lib/config.ts.
 *
 * Given a URL path, determines which content type it belongs to and which
 * output directory to use.
 */

import type { SiteConfig, ContentTypeDefinition } from "./site-config.schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RouteResult {
  /** The content type name (e.g. "blog", "event") */
  contentType: string;

  /** The output directory (e.g. "blogg", "arendalsuka") */
  outputDir: string;

  /** The full content type definition from config */
  definition: ContentTypeDefinition;
}

// ---------------------------------------------------------------------------
// Compiled route — pre-compiled RegExp for performance
// ---------------------------------------------------------------------------

interface CompiledRoute {
  patterns: RegExp[];
  contentType: string;
  outputDir: string;
  definition: ContentTypeDefinition;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a routing function from a SiteConfig.
 * Pre-compiles all URL patterns to RegExp for performance.
 *
 * @param config - The validated SiteConfig
 * @returns A function that classifies URL paths into content types
 */
export function buildRouter(
  config: SiteConfig
): (urlPath: string) => RouteResult | null {
  // Pre-compile all patterns
  const routes: CompiledRoute[] = config.content_types.map((ct) => ({
    patterns: ct.url_patterns.map((p) => new RegExp(p)),
    contentType: ct.name,
    outputDir: ct.output_dir,
    definition: ct,
  }));

  return function classifyPage(urlPath: string): RouteResult | null {
    for (const route of routes) {
      for (const pattern of route.patterns) {
        if (pattern.test(urlPath)) {
          return {
            contentType: route.contentType,
            outputDir: route.outputDir,
            definition: route.definition,
          };
        }
      }
    }
    return null;
  };
}

/**
 * Build the content type → output directory mapping from a SiteConfig.
 * Replaces the hardcoded SECTION_DIRS from lib/config.ts.
 *
 * @param config - The validated SiteConfig
 * @returns A record mapping content type name to output directory
 */
export function buildOutputDirMap(
  config: SiteConfig
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const ct of config.content_types) {
    map[ct.name] = ct.output_dir;
  }
  return map;
}
