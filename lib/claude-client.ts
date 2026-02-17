/**
 * claude-client.ts
 *
 * Claude extraction client for complex pages — schema v2.
 *
 * Input: clean Markdown from Crawl4AI (not raw HTML).
 * Uses the Anthropic API with structured output via tool_use.
 * Claude handles event/debate pages, conference landing pages, and homepage.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { SCHEMAS, type ContentType } from "./schemas.js";
import { CLAUDE_SYSTEM_PROMPT, makeUserPrompt } from "./prompts.js";
import { MODELS } from "./config.js";

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

/**
 * Extract structured data from Markdown content using Claude.
 *
 * Uses tool_use to enforce structured output matching the archetype-specific
 * Zod schema. The content_type hint tells Claude which schema to expect.
 *
 * @param markdown - Clean Markdown content from Crawl4AI
 * @param urlPath - The original URL path (for context)
 * @param contentType - Pre-classified content type (from page routing)
 * @returns Extracted data as a plain object, or null if extraction failed
 */
export async function extractWithClaude(
  markdown: string,
  urlPath: string,
  contentType: ContentType = "event"
): Promise<{ data: Record<string, unknown>; elapsed: number } | null> {
  const client = getClient();
  const schema = SCHEMAS[contentType];
  const jsonSchema = zodToJsonSchema(schema);
  const startTime = Date.now();

  try {
    const response = await client.messages.create({
      model: MODELS.claude,
      max_tokens: 8192,
      system: CLAUDE_SYSTEM_PROMPT,
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

    // Validate against the archetype-specific Zod schema
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
