/**
 * generate-config.ts
 *
 * Phase 3 of the analyse command: for each discovered content type,
 * use Claude to generate the schema extras, extraction prompt, and
 * required fields. Also generates cleanup rules from boilerplate analysis.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { SamplePage } from "./sample-crawler.js";
import type { DiscoveredType } from "./discover-types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedFieldDefinition {
  type: "string" | "number" | "boolean" | "string[]" | "image" | "object";
  description?: string;
  required?: boolean;
  items?: Record<string, GeneratedFieldDefinition>;
}

export interface GeneratedTypeConfig {
  /** Content type name (matches DiscoveredType.name) */
  name: string;
  /** Extra fields beyond the base schema */
  extras: Record<string, GeneratedFieldDefinition>;
  /** Extraction prompt for the LLM */
  extraction_prompt: string;
  /** Required fields that must be non-empty */
  required_fields: string[];
}

export interface GeneratedCleanupRule {
  name: string;
  regex: string;
  flags: string;
}

// ---------------------------------------------------------------------------
// Schema + prompt generation prompt
// ---------------------------------------------------------------------------

function buildSchemaPrompt(
  siteUrl: string,
  contentType: DiscoveredType,
  pages: SamplePage[]
): string {
  const pageContent = pages
    .map((p) => {
      // Send first 2000 chars of each representative page
      const content = p.markdown.slice(0, 2000);
      return `=== PAGE: ${p.url_path} ===\n${content}\n`;
    })
    .join("\n");

  return `You are an expert at content extraction schemas. I'm building a config-driven content migration tool.

Website: ${siteUrl}
Content type: "${contentType.name}" — ${contentType.description}
URL patterns: ${contentType.url_patterns.join(", ")}

Here are ${pages.length} representative pages of this type:

${pageContent}

The system already provides these BASE fields for every content type:
- content_type (string, enum of all type names)
- title (string)
- slug (string, from URL)
- url_path (string)
- language (string, "nb" or "en")
- date (string, YYYY-MM-DD)
- description (string)
- author (string)
- source_url (string, full URL)
- featured_image (optional object with src, alt)
- tags (string array)

Your task:
1. Identify any EXTRA fields specific to this content type that aren't covered by the base fields
2. Write an extraction prompt that will help a local LLM (like Gemma 3) extract all fields from pages of this type
3. Identify which fields are REQUIRED (must be non-empty) for this type

Rules for extra fields:
- Only add fields that carry meaningful type-specific information
- Use these types: "string", "number", "boolean", "string[]", "image", "object"
- For "object" type with array semantics (like a list of people), provide "items" with sub-fields
- For "image" type, it creates an optional {src, alt} object
- Don't duplicate base fields (no "title", "date", etc.)
- Field names should be snake_case

Rules for the extraction prompt:
- Write it as a system prompt for an LLM doing metadata extraction
- Mention the site name and content type
- Give specific instructions about where to find data in the content
- Mention the language (detect from sample pages)
- Keep it under 500 words

Rules for required_fields:
- Always include "title" and "slug"
- Add other fields that should never be empty for this content type
- Be conservative — only require fields that are consistently present in the samples`;
}

// ---------------------------------------------------------------------------
// Tool schema for schema generation
// ---------------------------------------------------------------------------

const SCHEMA_TOOL = {
  name: "save_type_config",
  description:
    "Save the generated schema extras, extraction prompt, and required fields for a content type.",
  input_schema: {
    type: "object" as const,
    required: ["extras", "extraction_prompt", "required_fields"],
    properties: {
      extras: {
        type: "object" as const,
        description:
          "Extra fields beyond the base schema. Keys are field names (snake_case), values are field definitions.",
        additionalProperties: {
          type: "object" as const,
          required: ["type"],
          properties: {
            type: {
              type: "string" as const,
              enum: ["string", "number", "boolean", "string[]", "image", "object"],
              description: "Field type",
            },
            description: {
              type: "string" as const,
              description: "Brief description of the field",
            },
            required: {
              type: "boolean" as const,
              description: "Whether this field is required",
            },
            items: {
              type: "object" as const,
              description:
                "For object type: nested field definitions (creates array of objects)",
              additionalProperties: {
                type: "object" as const,
                properties: {
                  type: { type: "string" as const },
                  description: { type: "string" as const },
                },
              },
            },
          },
        },
      },
      extraction_prompt: {
        type: "string" as const,
        description: "System prompt for the extraction LLM (under 500 words)",
      },
      required_fields: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Fields that must be non-empty (always include 'title' and 'slug')",
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Schema + prompt generation
// ---------------------------------------------------------------------------

/**
 * Generate schema extras, extraction prompt, and required fields for a content type.
 */
export async function generateSchemaAndPrompt(
  client: Anthropic,
  model: string,
  siteUrl: string,
  contentType: DiscoveredType,
  representativePages: SamplePage[]
): Promise<GeneratedTypeConfig> {
  const userPrompt = buildSchemaPrompt(siteUrl, contentType, representativePages);

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system:
      "You are a content extraction schema designer. Generate precise field definitions " +
      "and extraction prompts for structured content migration.",
    tools: [SCHEMA_TOOL as Anthropic.Tool],
    tool_choice: { type: "tool" as const, name: "save_type_config" },
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`Claude did not return schema for content type "${contentType.name}"`);
  }

  const result = toolUse.input as {
    extras: Record<string, GeneratedFieldDefinition>;
    extraction_prompt: string;
    required_fields: string[];
  };

  // Ensure title and slug are in required_fields
  if (!result.required_fields.includes("title")) {
    result.required_fields.unshift("title");
  }
  if (!result.required_fields.includes("slug")) {
    result.required_fields.splice(1, 0, "slug");
  }

  return {
    name: contentType.name,
    extras: result.extras,
    extraction_prompt: result.extraction_prompt,
    required_fields: result.required_fields,
  };
}

// ---------------------------------------------------------------------------
// Cleanup rules generation
// ---------------------------------------------------------------------------

function buildCleanupPrompt(siteUrl: string, pages: SamplePage[]): string {
  const pageContent = pages
    .map((p) => {
      // Show full content for boilerplate detection
      return `=== PAGE: ${p.url_path} ===\n${p.markdown}\n`;
    })
    .join("\n");

  return `You are an expert at identifying repeating boilerplate in website content.

Website: ${siteUrl}

Here are ${pages.length} sample pages from this site. Your task is to identify
patterns that repeat across pages and should be removed before content extraction.

${pageContent}

Common boilerplate to look for:
- Navigation menus (header links like "Home", "About", "Contact")
- Logo/branding text or image markdown
- Newsletter signup forms
- Cookie/privacy notices
- Footer content (addresses, social links, copyright)
- "Back to top" links
- Breadcrumbs
- Share buttons
- Comments sections templates
- Page title suffixes like " — Site Name"

For each boilerplate pattern, provide:
- A descriptive name (snake_case)
- A regex pattern that matches the boilerplate text in the Markdown
- Regex flags (usually "gm" for global+multiline, "g" for global, or "gms" for global+multiline+dotall)

Rules:
- Patterns should match the Markdown format (not HTML)
- Use multiline mode (m flag) when matching line-start/end (^ and $)
- Use the s flag when matching across multiple lines
- Be specific enough to avoid false positives (don't match actual content)
- Prefer anchored patterns (^ for start-of-line) when possible
- Order matters: list patterns from most specific to most general`;
}

const CLEANUP_TOOL = {
  name: "save_cleanup_rules",
  description: "Save the identified boilerplate cleanup rules.",
  input_schema: {
    type: "object" as const,
    required: ["rules"],
    properties: {
      rules: {
        type: "array" as const,
        description: "List of cleanup rules",
        items: {
          type: "object" as const,
          required: ["name", "regex", "flags"],
          properties: {
            name: {
              type: "string" as const,
              description: "Descriptive name in snake_case",
            },
            regex: {
              type: "string" as const,
              description: "Regex pattern to match boilerplate",
            },
            flags: {
              type: "string" as const,
              description: "Regex flags (e.g. 'gm', 'g', 'gms')",
            },
          },
        },
      },
    },
  },
};

/**
 * Generate cleanup rules by analyzing boilerplate patterns across sample pages.
 */
export async function generateCleanupRules(
  client: Anthropic,
  model: string,
  siteUrl: string,
  pages: SamplePage[]
): Promise<GeneratedCleanupRule[]> {
  const userPrompt = buildCleanupPrompt(siteUrl, pages);

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system:
      "You are an expert at identifying and removing website boilerplate. " +
      "Generate precise regex patterns that match repeating non-content elements in Markdown.",
    tools: [CLEANUP_TOOL as Anthropic.Tool],
    tool_choice: { type: "tool" as const, name: "save_cleanup_rules" },
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return cleanup rules");
  }

  const result = toolUse.input as { rules: GeneratedCleanupRule[] };

  // Validate that regex patterns are valid
  const validRules: GeneratedCleanupRule[] = [];
  for (const rule of result.rules) {
    try {
      new RegExp(rule.regex, rule.flags);
      validRules.push(rule);
    } catch (err) {
      console.log(`    ⚠️  Invalid regex for "${rule.name}", skipping: ${rule.regex}`);
    }
  }

  return validRules;
}
