/**
 * assemble-config.ts
 *
 * Phase 4 of the analyse command: assemble all discovered types,
 * generated schemas, prompts, and cleanup rules into a complete
 * site-config.yaml structure.
 */

import type { DiscoveredType } from "./discover-types.js";
import type { GeneratedTypeConfig, GeneratedCleanupRule } from "./generate-config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The assembled config matches SiteConfig structure from site-config.schema.ts */
export interface AssembledConfig {
  version: number;
  site: {
    url: string;
    name: string;
  };
  crawl: {
    skip_patterns: string[];
  };
  content_types: AssembledContentType[];
  cleanup: {
    patterns: GeneratedCleanupRule[];
  };
  llm: {
    analysis_model: string;
    extraction_model: string;
    extraction_context_size: number;
    extraction_max_chars: number;
  };
}

interface AssembledContentType {
  name: string;
  url_patterns: string[];
  output_dir: string;
  schema: {
    base: boolean;
    extras: Record<string, any>;
  };
  extraction_prompt: string;
  required_fields: string[];
}

// ---------------------------------------------------------------------------
// Default crawl skip patterns
// ---------------------------------------------------------------------------

const DEFAULT_SKIP_PATTERNS = [
  "\\?",                    // Query parameters
  "/category/",             // Category listing pages
  "/tag/",                  // Tag listing pages
  "/author/",               // Author listing pages
  "\\?format=rss",          // RSS feeds
  "/cart",                  // Shopping cart
  "/search",                // Search pages
  "/login",                 // Login pages
  "\\.pdf$",                // PDF files
  "\\.jpg$|\\.png$|\\.gif$", // Image files
];

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

/**
 * Derive a human-readable site name from the URL.
 *
 * Examples:
 *   "https://www.smartebyernorge.no" → "Smartebyernorge"
 *   "https://example.com" → "Example"
 *   "https://www.my-site.org" → "My Site"
 */
export function deriveSiteName(siteUrl: string): string {
  try {
    const url = new URL(siteUrl);
    let hostname = url.hostname;

    // Remove www. prefix
    hostname = hostname.replace(/^www\./, "");

    // Take just the first segment of the hostname (before the first dot)
    // This handles: example.com → "Example", docs.example.com → "Docs",
    // my-site.org → "My Site", smartebyernorge.no → "Smartebyernorge"
    const firstSegment = hostname.split(".")[0];

    // Capitalize and convert hyphens to spaces
    const name = firstSegment
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    return name;
  } catch {
    return "Website";
  }
}

/**
 * Assemble a complete site-config structure from all analysis outputs.
 *
 * @param siteUrl - The site URL
 * @param discoveredTypes - Content types from Phase 2
 * @param typeConfigs - Generated schemas/prompts from Phase 3
 * @param cleanupRules - Generated cleanup rules from Phase 3
 * @param analysisModel - Claude model used for analysis
 * @returns A complete config object ready for YAML serialization
 */
export function assembleConfig(
  siteUrl: string,
  discoveredTypes: DiscoveredType[],
  typeConfigs: GeneratedTypeConfig[],
  cleanupRules: GeneratedCleanupRule[],
  analysisModel: string
): AssembledConfig {
  const siteName = deriveSiteName(siteUrl);

  // Create a map of type configs by name for quick lookup
  const configByName = new Map<string, GeneratedTypeConfig>();
  for (const tc of typeConfigs) {
    configByName.set(tc.name, tc);
  }

  // Assemble content types
  const contentTypes: AssembledContentType[] = discoveredTypes.map((dt) => {
    const tc = configByName.get(dt.name);

    return {
      name: dt.name,
      url_patterns: dt.url_patterns,
      output_dir: dt.output_dir,
      schema: {
        base: true,
        extras: tc?.extras ?? {},
      },
      extraction_prompt: tc?.extraction_prompt ?? buildDefaultPrompt(siteName, dt),
      required_fields: tc?.required_fields ?? ["title", "slug"],
    };
  });

  return {
    version: 1,
    site: {
      url: siteUrl,
      name: siteName,
    },
    crawl: {
      skip_patterns: DEFAULT_SKIP_PATTERNS,
    },
    content_types: contentTypes,
    cleanup: {
      patterns: cleanupRules,
    },
    llm: {
      analysis_model: analysisModel,
      extraction_model: "gemma3:4b",
      extraction_context_size: 8192,
      extraction_max_chars: 4000,
    },
  };
}

/**
 * Build a fallback extraction prompt if Claude didn't generate one.
 */
function buildDefaultPrompt(siteName: string, contentType: DiscoveredType): string {
  return (
    `You are a content extraction engine for ${siteName}.\n` +
    `Extract metadata from ${contentType.label.toLowerCase()}.\n` +
    `Dates in ISO 8601 format (YYYY-MM-DD). Tags are lowercase.\n` +
    `Slug is derived from the URL path.\n`
  );
}
