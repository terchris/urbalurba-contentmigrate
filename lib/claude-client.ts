/**
 * claude-client.ts
 *
 * Claude extraction client for complex pages — config-driven.
 *
 * Input: clean Markdown from Crawl4AI (not raw HTML).
 * Uses the Anthropic API with structured output via tool_use.
 * Claude handles event/debate pages, conference landing pages, and homepage.
 *
 * All site-specific configuration (schemas, prompts, models) comes from
 * the parameters — no hardcoded imports.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Get the Anthropic client. Requires ANTHROPIC_API_KEY env var.
 */
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is required for Claude extraction.\n" +
        "Set it with: export ANTHROPIC_API_KEY=sk-ant-..."
    );
  }
  return new Anthropic({ apiKey });
}

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

function makeUserPrompt(markdown: string): string {
  return `Extract structured data from this Markdown content:\n\n${markdown}`;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Extract structured data from Markdown content using Claude.
 *
 * Uses tool_use to enforce structured output matching the provided Zod schema.
 *
 * @param markdown - Clean Markdown content from Crawl4AI
 * @param urlPath - The original URL path (for context)
 * @param contentType - Content type name (for schema lookup)
 * @param schema - Zod schema to validate against
 * @param systemPrompt - System prompt for the extraction
 * @param modelName - Claude model name (e.g. "claude-sonnet-4-20250514")
 * @returns Extracted data as a plain object, or null if extraction failed
 */
export async function extractWithClaude(
  markdown: string,
  urlPath: string,
  contentType: string,
  schema: z.ZodObject<any>,
  systemPrompt: string,
  modelName: string
): Promise<{ data: Record<string, unknown>; elapsed: number } | null> {
  const client = getClient();
  const jsonSchema = zodToJsonSchema(schema);
  const startTime = Date.now();

  try {
    const response = await client.messages.create({
      model: modelName,
      max_tokens: 8192,
      system: systemPrompt,
      tools: [
        {
          name: "save_extraction",
          description:
            "Save the extracted structured data from the Markdown content. " +
            "Call this tool with the complete extraction result.",
          input_schema: jsonSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: "save_extraction" },
      messages: [
        {
          role: "user",
          content: makeUserPrompt(
            `URL: ${urlPath}\nContent type: ${contentType}\n\n${markdown}`
          ),
        },
      ],
    });

    const elapsed = Date.now() - startTime;

    // Find the tool_use block in the response
    const toolUse = response.content.find(
      (block) => block.type === "tool_use"
    );

    if (!toolUse || toolUse.type !== "tool_use") {
      console.error(`  ❌ Claude did not return tool_use for ${urlPath}`);
      return null;
    }

    // Validate against the Zod schema
    const parsed = schema.parse(toolUse.input);

    return { data: parsed as Record<string, unknown>, elapsed };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ Claude extraction failed for ${urlPath}: ${msg}`);
    return null;
  }
}

/**
 * Check if the Anthropic API key is configured.
 */
export function checkClaudeReady(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
