/**
 * discover-types.ts
 *
 * Phase 2 of the analyse command: use a cloud LLM to discover
 * content types from a sample of crawled pages.
 *
 * Sends URL paths + first 500 chars of each page to Claude and asks it
 * to identify distinct content types, URL patterns, and representative
 * pages per type.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { SamplePage } from "./sample-crawler.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoveredType {
  /** Machine-readable name, e.g. "blog_post", "team_member" */
  name: string;
  /** Human-readable label, e.g. "Blog Posts" */
  label: string;
  /** Brief description of what this content type represents */
  description: string;
  /** Regex URL patterns that match this type */
  url_patterns: string[];
  /** Output directory name (e.g. "blog", "team") */
  output_dir: string;
  /** URL paths of representative pages for this type */
  representative_urls: string[];
}

// ---------------------------------------------------------------------------
// Discovery prompt
// ---------------------------------------------------------------------------

function buildDiscoveryPrompt(siteUrl: string, pages: SamplePage[]): string {
  const pageList = pages
    .map((p) => {
      const preview = p.markdown.slice(0, 500).replace(/\n/g, " ").trim();
      return `URL: ${p.url_path}\nPreview: ${preview}\n`;
    })
    .join("\n---\n");

  return `You are an expert at website content analysis. I've crawled sample pages from ${siteUrl}.

Your task: identify the distinct CONTENT TYPES on this website by analyzing the URL patterns and page content previews.

Here are the sampled pages:

${pageList}

Instructions:
1. Group pages into distinct content types based on URL path patterns and content structure
2. For each content type, provide:
   - A machine-readable name (snake_case, e.g. "blog_post", "team_member", "product_page")
   - A human-readable label (e.g. "Blog Posts")
   - A brief description of what this content type represents
   - Regex URL patterns that match pages of this type (anchored with ^ when possible)
   - A suggested output directory name (short, lowercase, no spaces)
   - 2-3 representative URL paths from the sample
3. Every page should belong to at most one content type
4. Pages that don't fit any specific type can go into a "page" catch-all type
5. Aim for 3-12 content types. Don't over-segment — if two URL groups have the same content structure, merge them
6. The catch-all "page" type should match with "^/$" for the homepage and possibly other static pages

Important:
- URL patterns should be regex strings that can be used with JavaScript RegExp
- Use anchored patterns (^/path/) when the path prefix is distinctive
- For content that appears under multiple URL prefixes with the same structure, list all patterns
- Include a "page" type as catch-all for pages that don't fit other types`;
}

// ---------------------------------------------------------------------------
// Tool schema for Claude
// ---------------------------------------------------------------------------

const DISCOVERY_TOOL = {
  name: "save_discovered_types",
  description:
    "Save the discovered content types from the website analysis. " +
    "Call this with the complete list of identified content types.",
  input_schema: {
    type: "object" as const,
    required: ["content_types"],
    properties: {
      content_types: {
        type: "array" as const,
        description: "List of discovered content types",
        items: {
          type: "object" as const,
          required: [
            "name",
            "label",
            "description",
            "url_patterns",
            "output_dir",
            "representative_urls",
          ],
          properties: {
            name: {
              type: "string" as const,
              description: "Machine-readable name in snake_case (e.g. 'blog_post')",
            },
            label: {
              type: "string" as const,
              description: "Human-readable label (e.g. 'Blog Posts')",
            },
            description: {
              type: "string" as const,
              description: "Brief description of what this content type represents",
            },
            url_patterns: {
              type: "array" as const,
              items: { type: "string" as const },
              description: "Regex URL patterns that match this type (e.g. ['^/blog/'])",
            },
            output_dir: {
              type: "string" as const,
              description: "Output directory name (short, lowercase)",
            },
            representative_urls: {
              type: "array" as const,
              items: { type: "string" as const },
              description: "2-3 URL paths of representative pages",
            },
          },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Main discovery function
// ---------------------------------------------------------------------------

/**
 * Use Claude to discover content types from sample pages.
 *
 * @param client - Anthropic client instance
 * @param model - Claude model name
 * @param siteUrl - The site being analysed
 * @param pages - Sample pages with URL paths and markdown previews
 * @returns Array of discovered content types
 */
export async function discoverContentTypes(
  client: Anthropic,
  model: string,
  siteUrl: string,
  pages: SamplePage[]
): Promise<DiscoveredType[]> {
  const userPrompt = buildDiscoveryPrompt(siteUrl, pages);

  console.log(`  Sending ${pages.length} page summaries to ${model}...`);
  const startTime = Date.now();

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system:
      "You are a website content analysis expert. Identify distinct content types " +
      "from the provided URL patterns and page previews. Be precise with URL regex patterns.",
    tools: [DISCOVERY_TOOL as Anthropic.Tool],
    tool_choice: { type: "tool" as const, name: "save_discovered_types" },
    messages: [{ role: "user", content: userPrompt }],
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  Discovery completed in ${elapsed}s`);

  // Extract tool_use result
  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return structured content type discovery");
  }

  const result = toolUse.input as { content_types: DiscoveredType[] };

  // Validate and clean up
  let types = result.content_types;

  // Cap at 15 types
  if (types.length > 15) {
    console.log(`  ⚠️  ${types.length} types discovered, capping at 15`);
    types = types.slice(0, 15);
  }

  // Ensure at least 1 type
  if (types.length === 0) {
    types = [
      {
        name: "page",
        label: "Pages",
        description: "General website pages",
        url_patterns: ["^/$"],
        output_dir: "pages",
        representative_urls: pages.slice(0, 2).map((p) => p.url_path),
      },
    ];
  }

  // Ensure a "page" catch-all exists
  const hasPageType = types.some((t) => t.name === "page");
  if (!hasPageType) {
    types.push({
      name: "page",
      label: "Pages",
      description: "Static and institutional pages",
      url_patterns: ["^/$"],
      output_dir: "pages",
      representative_urls: [],
    });
  }

  return types;
}
