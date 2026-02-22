/**
 * validate.ts
 *
 * Validates all extracted .md files in content/.
 * Checks required frontmatter fields per archetype, format correctness,
 * and flags issues for review.
 *
 * Now config-driven: loads required fields from site-config.yaml
 * instead of hardcoded REQUIRED_FIELDS.
 *
 * Usage: npm run validate -- --config site-config.smartebyernorge.yaml
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { loadSiteConfig, createSiteConfigFacade, type SiteConfigFacade } from "../src/config/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const PATHS = {
  projectRoot: PROJECT_ROOT,
  content: path.join(PROJECT_ROOT, "content"),
  reports: path.join(PROJECT_ROOT, "reports"),
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Walk content directory
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Get nested value from object by dot-path
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Validate a single file
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(): { configPath: string } {
  const args = process.argv.slice(2);
  let configPath = "./site-config.yaml";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config" && args[i + 1]) {
      configPath = args[++i];
    }
  }

  return { configPath };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { configPath } = parseArgs();

  // Load site configuration
  let site: SiteConfigFacade;
  try {
    const config = await loadSiteConfig(configPath);
    site = createSiteConfigFacade(config);
  } catch (err) {
    console.error(`\n❌ Failed to load config from "${configPath}"`);
    console.error(`   ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Build required fields map from config
  const requiredFieldsMap: Record<string, string[]> = {};
  for (const ct of site.config.content_types) {
    requiredFieldsMap[ct.name] = ct.required_fields;
  }

  console.log("=".repeat(60));
  console.log(`  Validate extracted content — ${site.siteName}`);
  console.log("=".repeat(60));

  const mdFiles = walkMdFiles(PATHS.content);

  if (mdFiles.length === 0) {
    console.error(`\n❌ No .md files found in ${PATHS.content}`);
    console.error(`   Run: npm run extract -- --config ${configPath}`);
    process.exit(1);
  }

  console.log(`\n📄 Validating ${mdFiles.length} files...\n`);

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
      const icon = result.valid ? "⚠️ " : "❌";
      console.log(`  ${icon} ${result.file} (${result.archetype})`);
      for (const issue of result.issues) {
        const sev = issue.severity === "error" ? "  ERROR" : "  WARN ";
        console.log(`     ${sev}: ${issue.message}`);
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
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Validation complete!`);
  console.log(`  ✅ Valid:    ${validCount}/${mdFiles.length}`);
  console.log(`  ❌ Invalid:  ${invalidCount}/${mdFiles.length}`);
  console.log(`  ⚠️  Warnings: ${warningCount}`);
  console.log(`  📄 Report:   ${reportPath}`);
  console.log(`${"=".repeat(60)}\n`);

  if (invalidCount > 0) {
    process.exit(1);
  }
}

// Only run main() when executed directly
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("validate.ts") ||
   process.argv[1].endsWith("validate.js"));

if (isDirectRun) {
  main().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
  });
}
