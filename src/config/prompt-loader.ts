/**
 * prompt-loader.ts
 *
 * Loads extraction prompts from site-config.yaml content type definitions.
 * Replaces the hardcoded OLLAMA_SYSTEM_PROMPT / CLAUDE_SYSTEM_PROMPT from lib/prompts.ts.
 *
 * Each content type in the config has its own extraction_prompt field.
 * The prompt loader builds a lookup function by content type name.
 */

import type { SiteConfig } from "./site-config.schema.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a prompt lookup map from a SiteConfig.
 *
 * @param config - The validated SiteConfig
 * @returns A record mapping content type name to its extraction prompt
 */
export function buildPromptMap(
  config: SiteConfig
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const ct of config.content_types) {
    map[ct.name] = ct.extraction_prompt;
  }
  return map;
}

/**
 * Get the extraction prompt for a given content type.
 *
 * @param promptMap - The prompt lookup map from buildPromptMap()
 * @param contentType - The content type name
 * @returns The extraction prompt string
 * @throws Error if the content type is not found
 */
export function getPrompt(
  promptMap: Record<string, string>,
  contentType: string
): string {
  const prompt = promptMap[contentType];
  if (!prompt) {
    throw new Error(
      `No extraction prompt found for content type "${contentType}". Available types: ${Object.keys(promptMap).join(", ")}`
    );
  }
  return prompt;
}
