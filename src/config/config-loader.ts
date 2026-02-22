/**
 * config-loader.ts
 *
 * Reads a site-config.yaml file from disk and validates it against the
 * SiteConfigSchema. Returns a fully typed SiteConfig object or throws
 * a descriptive error if validation fails.
 *
 * Usage:
 *   import { loadSiteConfig } from "./config-loader.js";
 *   const config = await loadSiteConfig("./site-config.yaml");
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { ZodError } from "zod";
import { SiteConfigSchema, type SiteConfig } from "./site-config.schema.js";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/** Thrown when the config file cannot be read from disk */
export class ConfigFileError extends Error {
  constructor(path: string, cause: unknown) {
    const message =
      cause instanceof Error
        ? `Cannot read config file "${path}": ${cause.message}`
        : `Cannot read config file "${path}"`;
    super(message);
    this.name = "ConfigFileError";
    this.cause = cause;
  }
}

/** Thrown when the YAML cannot be parsed */
export class ConfigParseError extends Error {
  constructor(path: string, cause: unknown) {
    const message =
      cause instanceof Error
        ? `Invalid YAML in "${path}": ${cause.message}`
        : `Invalid YAML in "${path}"`;
    super(message);
    this.name = "ConfigParseError";
    this.cause = cause;
  }
}

/** Thrown when the config structure fails Zod validation */
export class ConfigValidationError extends Error {
  public readonly issues: ZodError["issues"];

  constructor(path: string, zodError: ZodError) {
    const issueLines = zodError.issues.map(
      (issue) => `  - ${issue.path.join(".")}: ${issue.message}`
    );
    const message = `Config validation failed for "${path}":\n${issueLines.join("\n")}`;
    super(message);
    this.name = "ConfigValidationError";
    this.issues = zodError.issues;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and validate a site-config.yaml file.
 *
 * @param configPath - Absolute or relative path to the YAML config file.
 * @returns A validated, fully typed SiteConfig object.
 * @throws {ConfigFileError} If the file cannot be read.
 * @throws {ConfigParseError} If the YAML is malformed.
 * @throws {ConfigValidationError} If the config structure is invalid.
 */
export async function loadSiteConfig(configPath: string): Promise<SiteConfig> {
  // 1. Read file
  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch (err) {
    throw new ConfigFileError(configPath, err);
  }

  // 2. Parse YAML
  return parseSiteConfig(raw, configPath);
}

/**
 * Parse and validate a YAML string directly.
 * Useful for testing without touching the filesystem.
 *
 * @param yamlContent - Raw YAML string.
 * @param sourceName - Label for error messages (default: "<string>").
 * @returns A validated SiteConfig object.
 * @throws {ConfigParseError} If the YAML is malformed.
 * @throws {ConfigValidationError} If the config structure is invalid.
 */
export function parseSiteConfig(
  yamlContent: string,
  sourceName: string = "<string>"
): SiteConfig {
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlContent);
  } catch (err) {
    throw new ConfigParseError(sourceName, err);
  }

  // 3. Validate against schema
  const result = SiteConfigSchema.safeParse(parsed);

  if (!result.success) {
    throw new ConfigValidationError(sourceName, result.error);
  }

  return result.data;
}
