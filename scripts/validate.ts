/**
 * validate.ts
 *
 * Validates all extracted .md files from a run folder.
 * Checks required frontmatter fields per archetype, format correctness,
 * and flags issues for review.
 *
 * Config-driven: loads required fields from site-config.yaml.
 * Multi-run aware: finds the latest run folder or accepts --run flag.
 *
 * Usage:
 *   npx tsx scripts/validate.ts --config output/<slug>/site-config.yaml
 *   npx tsx scripts/validate.ts --config output/<slug>/site-config.yaml --run 2026-02-22T18-00
 *
 * Follow the standard: docs/ai-developer/rules/script-standard.md
 * TypeScript specifics: docs/ai-developer/rules/typescript.md
 */

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { loadSiteConfig, createSiteConfigFacade, type SiteConfigFacade } from "../src/config/index.js";
import { logInfo, logSuccess, logError, logWarning, logStart, enableFileLogging, closeFileLogging } from "../lib/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// SCRIPT METADATA
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT_ID = "validate";
const SCRIPT_NAME = "Validate Content";
const SCRIPT_VER = "0.1.0";
const SCRIPT_DESCRIPTION = "Validate extracted .md files against site-config.yaml required fields.";
const SCRIPT_CATEGORY = "MIGRATION";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_CONFIG_PATH = "./site-config.yaml";

/**
 * Find the latest timestamped run folder under output/<slug>/runs/.
 * Returns the full path, or null if no runs exist.
 */
function findLatestRun(siteDir: string): string | null {
  const runsDir = path.join(siteDir, "runs");
  if (!fs.existsSync(runsDir)) return null;

  const entries = fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()          // ISO-style timestamps sort lexicographically
    .reverse();      // newest first

  if (entries.length === 0) return null;
  return path.join(runsDir, entries[0]);
}

/**
 * Derive all working paths from the config file location and optional run name.
 *
 * When config is at output/<slug>/site-config.yaml:
 *   siteDir  = output/<slug>/
 *   runDir   = output/<slug>/runs/<timestamp>/  (latest or specified)
 *   content  = output/<slug>/runs/<timestamp>/content/
 *   reports  = output/<slug>/runs/<timestamp>/reports/
 */
function computeValidatePaths(configPath: string, runName?: string) {
  const siteDir = path.dirname(path.resolve(configPath));

  let runDir: string | null;
  if (runName) {
    runDir = path.join(siteDir, "runs", runName);
  } else {
    runDir = findLatestRun(siteDir);
  }

  if (!runDir || !fs.existsSync(runDir)) {
    return null; // No run found
  }

  return {
    projectRoot: PROJECT_ROOT,
    siteDir,
    runDir,
    content: path.join(runDir, "content"),
    reports: path.join(runDir, "reports"),
  };
}

// Logging: imported from lib/logger.ts

// ─────────────────────────────────────────────────────────────────────────────
// HELP
// ─────────────────────────────────────────────────────────────────────────────

function showHelp(): void {
  const text = `
${SCRIPT_NAME} (v${SCRIPT_VER})
${SCRIPT_DESCRIPTION}

Usage:
  npx tsx scripts/${SCRIPT_ID}.ts --config output/<slug>/site-config.yaml [options]

Options:
  --config PATH  Path to site-config.yaml (default: ${DEFAULT_CONFIG_PATH})
  --run NAME     Specific run folder name (default: latest)
  -h, --help     Show this help message

Prerequisites:
  - Extracted .md files must exist in a run folder
  - A valid site-config.yaml must exist

Metadata:
  ID:       ${SCRIPT_ID}
  Category: ${SCRIPT_CATEGORY}
`.trim();
  console.error(text);
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  file: string;
  severity: "error" | "warning";
  message: string;
}

export interface ValidationResult {
  file: string;
  archetype: string;
  issues: ValidationIssue[];
  valid: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// ARGUMENT PARSING
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): { configPath: string; runName?: string } {
  const args = process.argv.slice(2);

  // Check for help flag first
  if (args.includes("-h") || args.includes("--help")) {
    showHelp();
    process.exit(0);
  }

  let configPath = DEFAULT_CONFIG_PATH;
  let runName: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config" && args[i + 1]) {
      configPath = args[++i];
    } else if (args[i] === "--run" && args[i + 1]) {
      runName = args[++i];
    }
  }

  return { configPath, runName };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: walk content directory
// ─────────────────────────────────────────────────────────────────────────────

function walkMdFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMdFiles(fullPath));
    } else if (entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: get nested value from object by dot-path
// ─────────────────────────────────────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: validate a single file
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a single .md file against the config-driven required fields.
 * Exported for unit testing.
 */
export function validateFile(
  filePath: string,
  contentDir: string,
  requiredFieldsMap: Record<string, string[]>,
  knownContentTypes: string[]
): ValidationResult {
  const relativePath = path.relative(contentDir, filePath);
  const issues: ValidationIssue[] = [];

  // Read and parse frontmatter
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    issues.push({ file: relativePath, severity: "error", message: "Cannot read file" });
    return { file: relativePath, archetype: "unknown", issues, valid: false };
  }

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch {
    issues.push({ file: relativePath, severity: "error", message: "Invalid YAML frontmatter" });
    return { file: relativePath, archetype: "unknown", issues, valid: false };
  }

  const data = parsed.data as Record<string, unknown>;
  const body = parsed.content.trim();

  // Check content_type exists
  const archetype = data.content_type as string;
  if (!archetype) {
    issues.push({ file: relativePath, severity: "error", message: "Missing content_type" });
    return { file: relativePath, archetype: "unknown", issues, valid: false };
  }

  // Check content_type is known
  if (!knownContentTypes.includes(archetype)) {
    issues.push({
      file: relativePath,
      severity: "warning",
      message: `Unknown archetype: ${archetype}`,
    });
  }

  // Check required fields for this archetype
  const required = requiredFieldsMap[archetype];
  if (required) {
    for (const field of required) {
      if (field === "body") {
        if (!body || body.length < 10) {
          issues.push({
            file: relativePath,
            severity: "error",
            message: `Body content is empty or too short (${body.length} chars)`,
          });
        }
      } else {
        const value = getNestedValue(data, field);
        if (value === undefined || value === null || value === "") {
          issues.push({
            file: relativePath,
            severity: "error",
            message: `Required field missing or empty: ${field}`,
          });
        }
      }
    }
  }

  // Check date format
  const dateValue = data.date as string;
  if (dateValue && dateValue !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    issues.push({
      file: relativePath,
      severity: "warning",
      message: `Invalid date format: ${dateValue} (expected YYYY-MM-DD)`,
    });
  }

  // Check language
  const language = data.language as string;
  if (language && !["nb", "en"].includes(language)) {
    issues.push({
      file: relativePath,
      severity: "warning",
      message: `Invalid language: ${language} (expected "nb" or "en")`,
    });
  }

  // Check slug
  const slug = data.slug as string;
  if (slug && /[A-Z\s]/.test(slug)) {
    issues.push({
      file: relativePath,
      severity: "warning",
      message: `Slug contains uppercase or spaces: "${slug}"`,
    });
  }

  return {
    file: relativePath,
    archetype,
    issues,
    valid: issues.filter((i) => i.severity === "error").length === 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const { configPath, runName } = parseArgs();
  logStart(SCRIPT_NAME, SCRIPT_VER);

  // Load site configuration
  let site: SiteConfigFacade;
  try {
    const config = await loadSiteConfig(configPath);
    site = createSiteConfigFacade(config);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(`ERR001: Failed to load config from "${configPath}"`);
    logError(`ERR001: ${msg}`);
    process.exit(1);
  }

  // Compute paths from config file location
  const PATHS = computeValidatePaths(configPath, runName);
  if (!PATHS) {
    const siteDir = path.dirname(path.resolve(configPath));
    logError(`ERR002: No run folder found in ${path.join(siteDir, "runs")}`);
    logInfo("Run extraction first: npx tsx scripts/orchestrator.ts --config " + configPath);
    process.exit(1);
  }

  // Enable file logging now that we know the run dir
  enableFileLogging(path.join(PATHS.reports, "validate.log"), {
    scriptName: SCRIPT_NAME,
    scriptVer: SCRIPT_VER,
    extra: { Config: configPath, "Run dir": PATHS.runDir },
  });

  // Build required fields map from config
  const requiredFieldsMap: Record<string, string[]> = {};
  for (const ct of site.config.content_types) {
    requiredFieldsMap[ct.name] = ct.required_fields;
  }

  logInfo(`Site:    ${site.siteName}`);
  logInfo(`Run dir: ${PATHS.runDir}`);

  const mdFiles = walkMdFiles(PATHS.content);

  if (mdFiles.length === 0) {
    logError(`ERR003: No .md files found in ${PATHS.content}`);
    logInfo("Run extraction first: npx tsx scripts/orchestrator.ts --config " + configPath);
    process.exit(1);
  }

  logInfo(`Validating ${mdFiles.length} files...`);

  const results: ValidationResult[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let warningCount = 0;

  for (const file of mdFiles) {
    const result = validateFile(
      file,
      PATHS.content,
      requiredFieldsMap,
      site.contentTypeNames
    );
    results.push(result);

    if (result.valid) {
      validCount++;
    } else {
      invalidCount++;
    }

    const warnings = result.issues.filter((i) => i.severity === "warning").length;
    warningCount += warnings;

    if (result.issues.length > 0) {
      for (const issue of result.issues) {
        if (issue.severity === "error") {
          logError(`${result.file} (${result.archetype}): ${issue.message}`);
        } else {
          logWarning(`${result.file} (${result.archetype}): ${issue.message}`);
        }
      }
    }
  }

  // Write report
  fs.mkdirSync(PATHS.reports, { recursive: true });
  const reportPath = path.join(PATHS.reports, "validation-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        configPath,
        siteUrl: site.siteUrl,
        runDir: PATHS.runDir,
        totalFiles: mdFiles.length,
        valid: validCount,
        invalid: invalidCount,
        totalWarnings: warningCount,
        results,
      },
      null,
      2
    )
  );

  // Summary
  logSuccess("Validation complete!");
  logInfo(`Valid:    ${validCount}/${mdFiles.length}`);
  if (invalidCount > 0) {
    logError(`Invalid:  ${invalidCount}/${mdFiles.length}`);
  }
  if (warningCount > 0) {
    logWarning(`Warnings: ${warningCount}`);
  }
  logInfo(`Report:   ${reportPath}`);

  closeFileLogging();

  if (invalidCount > 0) {
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECT RUN GUARD
// ─────────────────────────────────────────────────────────────────────────────

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("validate.ts") ||
   process.argv[1].endsWith("validate.js"));

if (isDirectRun) {
  main().catch((err) => {
    logError(`Unexpected error: ${err}`);
    process.exit(1);
  });
}
