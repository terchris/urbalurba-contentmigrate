/**
 * claude-cli.ts
 *
 * Wrapper around the Claude Code CLI (`claude --print`) for structured
 * output via the user's Claude Max/Pro subscription.
 *
 * This avoids needing a separate ANTHROPIC_API_KEY — the CLI uses
 * the existing OAuth session from the user's subscription.
 *
 * Uses execFileSync (not execSync) to pass arguments directly to the
 * process without shell interpretation, avoiding escaping issues with
 * large JSON schemas.
 */

import { execFileSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClaudeCliOptions {
  /** The user prompt to send */
  prompt: string;
  /** System prompt (prepended to the user prompt) */
  systemPrompt?: string;
  /** JSON Schema for structured output */
  jsonSchema: Record<string, unknown>;
  /** Model to use (optional, defaults to CLI default) */
  model?: string;
  /** Max budget in USD (optional safety limit) */
  maxBudget?: number;
  /** Timeout in milliseconds (default: 120000) */
  timeout?: number;
}

export interface ClaudeCliResult<T = unknown> {
  /** The structured output parsed from the CLI response */
  data: T;
  /** Duration in milliseconds */
  durationMs: number;
  /** Cost in USD */
  costUsd: number;
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

/**
 * Call Claude via the CLI with structured JSON output.
 *
 * Uses `claude --print --output-format json --json-schema ...` which
 * leverages the user's Max/Pro subscription (no API key needed).
 *
 * Arguments are passed directly via execFileSync (no shell), so there
 * are no escaping issues with complex JSON schemas or prompts.
 *
 * The prompt is sent via stdin to handle large/complex prompts safely.
 *
 * @throws Error if the CLI call fails or returns an error
 */
export function callClaude<T = unknown>(options: ClaudeCliOptions): ClaudeCliResult<T> {
  const {
    prompt,
    systemPrompt,
    jsonSchema,
    model,
    maxBudget,
    timeout = 120_000,
  } = options;

  // Build the full prompt (system + user)
  const fullPrompt = systemPrompt
    ? `${systemPrompt}\n\n---\n\n${prompt}`
    : prompt;

  // Build CLI arguments — passed directly, no shell escaping needed
  const cliArgs: string[] = [
    "--print",
    "--output-format", "json",
    "--json-schema", JSON.stringify(jsonSchema),
    "--no-session-persistence",
  ];

  if (model) {
    cliArgs.push("--model", model);
  }

  if (maxBudget) {
    cliArgs.push("--max-budget-usd", maxBudget.toString());
  }

  try {
    // execFileSync passes args directly to the process (no shell),
    // so JSON schemas with quotes, braces, etc. work without escaping.
    // The prompt is sent via stdin to handle large content.
    const stdout = execFileSync("claude", cliArgs, {
      input: fullPrompt,
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large responses
      encoding: "utf-8",
      env: { ...process.env, CLAUDECODE: "" }, // Unset CLAUDECODE to allow nested calls
    });

    const response = JSON.parse(stdout.trim());

    if (response.is_error) {
      throw new Error(`Claude CLI error: ${response.result || "Unknown error"}`);
    }

    if (!response.structured_output) {
      throw new Error("Claude CLI did not return structured_output");
    }

    return {
      data: response.structured_output as T,
      durationMs: response.duration_ms || 0,
      costUsd: response.total_cost_usd || 0,
    };
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      throw new Error("Claude CLI returned invalid JSON");
    }
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("ETIMEDOUT") || msg.includes("timed out")) {
      throw new Error(`Claude CLI timed out after ${timeout / 1000}s`);
    }
    throw error;
  }
}
