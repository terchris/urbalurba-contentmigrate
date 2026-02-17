/**
 * validate.ts
 *
 * Validates all extracted .md files in content/.
 * Checks required frontmatter fields per archetype, format correctness,
 * and flags issues for review.
 *
 * Usage: npm run validate
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { PATHS } from "../lib/config.js";
import { REQUIRED_FIELDS, type ContentType } from "../lib/schemas.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ValidationIssue {
  file: string;
  severity: "error" | "warning";
  message: string;
}

interface ValidationResult {
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

function validateFile(filePath: string): ValidationResult {
  const relativePath = path.relative(PATHS.content, filePath);
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

  // Check required fields for this archetype
  const required = REQUIRED_FIELDS[archetype as ContentType];
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
  } else {
    issues.push({
      file: relativePath,
      severity: "warning",
      message: `Unknown archetype: ${archetype}`,
    });
  }

  // Check date format (v2: field is `date`, not `date_published`)
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

  // Note: migration metadata (confidence, needs_review) is now in
  // reports/extraction-log.json, not in front matter. No checks needed here.

  return {
    file: relativePath,
    archetype,
    issues,
    valid: issues.filter((i) => i.severity === "error").length === 0,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log("=".repeat(60));
  console.log("  Validate extracted content");
  console.log("=".repeat(60));

  const mdFiles = walkMdFiles(PATHS.content);

  if (mdFiles.length === 0) {
    console.error(`\n❌ No .md files found in ${PATHS.content}`);
    console.error(`   Run: npm run extract`);
    process.exit(1);
  }

  console.log(`\n📄 Validating ${mdFiles.length} files...\n`);

  const results: ValidationResult[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let warningCount = 0;

  for (const file of mdFiles) {
    const result = validateFile(file);
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

main();
