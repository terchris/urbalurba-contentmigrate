/**
 * cleanup-builder.ts
 *
 * Builds a body cleanup function from site-config.yaml cleanup rules.
 * Replaces the hardcoded cleanBody() from lib/clean-body.ts.
 *
 * Each cleanup rule is a named regex pattern. The builder pre-compiles
 * all patterns and returns a function that applies them in order.
 */

import type { SiteConfig, CleanupRule } from "./site-config.schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompiledCleanupRule {
  name: string;
  regex: RegExp;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a body cleanup function from a SiteConfig.
 * Pre-compiles all regex patterns for performance.
 *
 * The returned function applies all cleanup rules in order, then
 * collapses multiple blank lines and trims whitespace.
 *
 * @param config - The validated SiteConfig
 * @returns A function that cleans boilerplate from markdown
 */
export function buildCleanupFunction(
  config: SiteConfig
): (markdown: string) => string {
  const rules = compileCleanupRules(config.cleanup.patterns);

  return function cleanBody(markdown: string): string {
    let text = markdown;

    for (const rule of rules) {
      text = text.replace(rule.regex, "");
    }

    // Collapse multiple blank lines and trim
    text = text.replace(/\n{3,}/g, "\n\n").trim();

    return text;
  };
}

/**
 * Compile cleanup rules from YAML definitions to RegExp objects.
 * Exported for testing.
 *
 * @param rules - Array of cleanup rule definitions from YAML
 * @returns Array of compiled rules with RegExp objects
 */
export function compileCleanupRules(
  rules: CleanupRule[]
): CompiledCleanupRule[] {
  return rules.map((rule) => ({
    name: rule.name,
    regex: new RegExp(rule.regex, rule.flags),
  }));
}
