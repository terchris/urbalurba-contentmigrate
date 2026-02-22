/**
 * config.ts
 *
 * Shared configuration for the content migration pipeline.
 *
 * This file contains both generic pipeline config (paths, models, Ollama
 * connection) and site-specific config (URL patterns, content types, output
 * directories). When migrating a new site, update the site-specific sections.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Paths — all output is within this project directory
// ---------------------------------------------------------------------------

export const PATHS = {
  /** Root of the project directory */
  projectRoot: PROJECT_ROOT,

  /** Crawl4AI output — JSON files with clean markdown per page */
  crawlOutput: path.join(PROJECT_ROOT, "crawl-output"),

  /** Crawl manifest — summary of all crawled pages */
  crawlManifest: path.join(PROJECT_ROOT, "reports", "crawl-manifest.json"),

  /** Extraction output — Markdown files with YAML front matter */
  content: path.join(PROJECT_ROOT, "content"),

  /** Image output */
  images: path.join(PROJECT_ROOT, "images"),

  /** Reports output — extraction logs, verification reports */
  reports: path.join(PROJECT_ROOT, "reports"),
} as const;

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export const MODELS = {
  /** Ollama model for bulk extraction (gemma3:4b — fast, good multilingual, no thinking overhead) */
  ollama: "gemma3:4b",

  /** Claude model for site analysis and complex extraction */
  claude: "claude-sonnet-4-20250514",
} as const;

// ---------------------------------------------------------------------------
// Ollama connection
// ---------------------------------------------------------------------------

export const OLLAMA_HOST =
  process.env.OLLAMA_HOST || "http://localhost:11434";

// ---------------------------------------------------------------------------
// Page routing — which URL patterns go to which extraction tier
// ---------------------------------------------------------------------------

export type ExtractionTier = "ollama" | "claude";

/**
 * Content type hint — tells the LLM what archetype to extract.
 * This replaces the unreliable classification pass for pages where we
 * already know the content type from the URL pattern.
 *
 * SITE-SPECIFIC: Update these types when migrating a new site.
 */
export type ContentTypeHint = "event" | "conference" | "page" | null;

/**
 * URL path patterns that need a forced content type hint.
 * Pages matching these patterns skip the LLM classification pass and go
 * straight to the archetype-specific schema.
 *
 * SITE-SPECIFIC: These patterns are for smartebyernorge.no.
 * Replace with patterns for your target site.
 */
export const COMPLEX_PATTERNS: Array<{ pattern: RegExp; contentType: ContentTypeHint }> = [
  // Conference landing pages (composite layouts)
  { pattern: /^\/arendalsuka$/, contentType: "conference" },
  { pattern: /^\/evolve2021$/, contentType: "conference" },
  { pattern: /^\/$/, contentType: "page" },                     // Homepage

  // Debate/panel pages — these have panelists in free text
  { pattern: /smartbydebatten/, contentType: "event" },
  { pattern: /\/debatt-/, contentType: "event" },
  { pattern: /\/program\/debatt/, contentType: "event" },

  // Conference program blocks with structured session data
  { pattern: /^\/evolve2021content\/bolk\//, contentType: "event" },
  { pattern: /^\/evolve2021content\/program\//, contentType: "event" },
  { pattern: /^\/evolve2021content\/workshop\//, contentType: "event" },

  // Specific complex event pages
  { pattern: /workshop-smarte-byer/, contentType: "event" },
  { pattern: /slik-foregar-smartbydebatten/, contentType: "event" },
  { pattern: /smarte-losninger-for-smarte-samfunn/, contentType: "event" },
  { pattern: /hvem-kommer/, contentType: "event" },
  { pattern: /digitale-trusler/, contentType: "event" },
  { pattern: /klima-miljokriser/, contentType: "event" },
  { pattern: /matsikkerhet/, contentType: "event" },
  { pattern: /lansering-av-smartbyavtalen/, contentType: "event" },
];

// Legacy alias for backward compatibility
export const CLAUDE_PATTERNS: RegExp[] = COMPLEX_PATTERNS.map((p) => p.pattern);

/**
 * URL patterns that should always auto-classify, even if they match
 * a complex pattern. Person profiles, company pages, pitch pages, etc.
 *
 * SITE-SPECIFIC: These overrides are for smartebyernorge.no.
 */
export const OLLAMA_OVERRIDES: RegExp[] = [
  /\/person\//,              // Person profiles (any path)
  /\/virksomhet\//,          // Company profiles
  /\/pitch-/,                // Pitch descriptions
  /\/program\/bolk\d+-pause/, // Pause/break items in program
  /\/program\/velkommen/,    // Welcome items
  /\/program\/mobilitet-pitchakucha/, // Simple program items
];

/**
 * Determine which tier should handle a given URL path and what content type
 * to force. Returns { tier, contentTypeHint }.
 */
export function classifyPage(urlPath: string): {
  tier: ExtractionTier;
  contentTypeHint: ContentTypeHint;
} {
  // Check overrides first — these are always simple auto-classify pages
  for (const override of OLLAMA_OVERRIDES) {
    if (override.test(urlPath)) {
      return { tier: "ollama", contentTypeHint: null };
    }
  }

  // Check complex patterns — these get a content type hint
  for (const { pattern, contentType } of COMPLEX_PATTERNS) {
    if (pattern.test(urlPath)) {
      return { tier: "ollama", contentTypeHint: contentType };
    }
  }

  return { tier: "ollama", contentTypeHint: null };
}

// ---------------------------------------------------------------------------
// Content archetypes
// ---------------------------------------------------------------------------

/**
 * SITE-SPECIFIC: Content archetypes for smartebyernorge.no.
 * Update this list when migrating a new site.
 */
export const ARCHETYPES = [
  "blog",
  "news",
  "event",
  "conference",
  "person",
  "tech",
  "press",
  "page",
  "english_news",
] as const;

export type Archetype = (typeof ARCHETYPES)[number];

// ---------------------------------------------------------------------------
// Content type → output directory mapping
// ---------------------------------------------------------------------------

/**
 * Maps content_type to the output directory under content/.
 *
 * SITE-SPECIFIC: These directory names are for smartebyernorge.no.
 * Update when migrating a new site.
 */
export const SECTION_DIRS: Record<string, string> = {
  blog: "blogg",
  news: "nyheter",
  event: "arendalsuka",
  conference: "konferanser",
  person: "personer",
  tech: "tech",
  press: "presse",
  page: "sider",
  english_news: "english-news",
};
