/**
 * schemas.ts
 *
 * Zod schemas for content extraction — v2 per-archetype design.
 *
 * v1 used a single superset schema (40+ fields) which caused Ollama to
 * hallucinate values for fields that don't apply. v2 uses a common base
 * plus archetype-specific extras. Only fields that exist for a content
 * type appear in the schema sent to the LLM.
 *
 * Migration metadata (confidence, extraction_method, needs_review) is
 * tracked in reports/extraction-log.json, not in front matter.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Content type enum — shared across all schemas
// ---------------------------------------------------------------------------

export const ContentType = z.enum([
  "blog",
  "news",
  "event",
  "conference",
  "person",
  "tech",
  "press",
  "page",
  "english_news",
]);

export type ContentType = z.infer<typeof ContentType>;

// ---------------------------------------------------------------------------
// Common base — every page has these fields
// ---------------------------------------------------------------------------

/**
 * Schema sent to the LLM for metadata extraction.
 *
 * NOTE: `body` is NOT included here. The Markdown body comes directly from
 * Crawl4AI output — no need for the LLM to regurgitate it. This is a key
 * performance optimization: removing body cuts generation output from ~1,200
 * tokens to ~150 tokens per page (~8x faster generation).
 */
export const BaseSchema = z.object({
  content_type: ContentType.describe("Content archetype"),
  title: z.string().describe("Page title (H1 or <title>)"),
  slug: z.string().describe("URL slug derived from path"),
  url_path: z.string().describe("Original full URL path, e.g. '/arendalsuka-blog/matsikkerhet'"),
  language: z.enum(["nb", "en"]).describe("ISO 639-1: 'nb' for Norwegian bokmål, 'en' for English"),
  date: z.string().describe("Published date ISO 8601: 'YYYY-MM-DD' or empty string"),
  description: z.string().describe("Meta description or first paragraph excerpt, max 300 chars"),
  author: z.string().describe("Author name, e.g. 'Terje Christensen', or empty string"),
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

export type BaseExtraction = z.infer<typeof BaseSchema>;

// ---------------------------------------------------------------------------
// Archetype-specific extras
// ---------------------------------------------------------------------------

const PanelistSchema = z.object({
  name: z.string().describe("Full name"),
  title: z.string().describe("Job title"),
  organization: z.string().describe("Organization name"),
});

export const EventExtras = z.object({
  event_date: z.string().describe("Event date YYYY-MM-DD (may differ from publish date)"),
  event_time: z.string().describe("Time range e.g. '11:00–11:45' or just start time, or empty"),
  venue: z.string().describe("Venue name, e.g. 'Arendalsuka'"),
  moderator: z.string().describe("Debate leader / ordstyrer name, or empty"),
  panelists: z.array(PanelistSchema).describe("Panel participants — empty array if none"),
});

export const PersonExtras = z.object({
  full_name: z.string().describe("Full name of the person"),
  job_title: z.string().describe("Job title"),
  organization: z.string().describe("Organization name"),
  photo: z
    .object({
      src: z.string().describe("Photo URL"),
      alt: z.string().describe("Alt text or empty"),
    })
    .optional()
    .describe("Profile photo — omit if none"),
});

export const ConferenceExtras = z.object({
  conference_name: z.string().describe("e.g. 'Evolve Arena 2021'"),
  conference_year: z.number().describe("e.g. 2021"),
  theme: z.string().describe("Conference theme, or empty"),
});

export const TechExtras = z.object({
  solution_name: z.string().describe("Product/solution name"),
  external_url: z.string().describe("Link to company website, or empty"),
});

export const PressExtras = z.object({
  source_publication: z.string().describe("e.g. 'EiendomsWatch'"),
  original_url: z.string().describe("Link to original article"),
});

// ---------------------------------------------------------------------------
// Merged schemas per archetype (base + extras)
// ---------------------------------------------------------------------------

export const BlogSchema = BaseSchema;
export const NewsSchema = BaseSchema;
export const EnglishNewsSchema = BaseSchema;
export const PageSchema = BaseSchema;

export const EventSchema = BaseSchema.merge(EventExtras);
export const PersonSchema = BaseSchema.merge(PersonExtras);
export const ConferenceSchema = BaseSchema.merge(ConferenceExtras);
export const TechSchema = BaseSchema.merge(TechExtras);
export const PressSchema = BaseSchema.merge(PressExtras);

// ---------------------------------------------------------------------------
// Schema lookup by content type
// ---------------------------------------------------------------------------

export const SCHEMAS: Record<ContentType, z.ZodObject<any>> = {
  blog: BlogSchema,
  news: NewsSchema,
  english_news: EnglishNewsSchema,
  page: PageSchema,
  event: EventSchema,
  person: PersonSchema,
  conference: ConferenceSchema,
  tech: TechSchema,
  press: PressSchema,
};

// ---------------------------------------------------------------------------
// Per-archetype required field lists (for validation)
// ---------------------------------------------------------------------------

/** Fields that must be non-empty for each archetype */
export const REQUIRED_FIELDS: Record<ContentType, string[]> = {
  blog: ["title", "slug", "date", "body"],
  news: ["title", "slug", "date", "body"],
  english_news: ["title", "slug", "date", "body"],
  page: ["title", "slug", "body"],
  event: ["title", "slug", "body", "event_date"],
  person: ["title", "slug", "full_name"],
  conference: ["title", "slug", "conference_name", "conference_year"],
  tech: ["title", "slug", "body", "solution_name"],
  press: ["title", "slug", "source_publication"],
};

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type EventExtraction = z.infer<typeof EventSchema>;
export type PersonExtraction = z.infer<typeof PersonSchema>;
export type ConferenceExtraction = z.infer<typeof ConferenceSchema>;
export type TechExtraction = z.infer<typeof TechSchema>;
export type PressExtraction = z.infer<typeof PressSchema>;
