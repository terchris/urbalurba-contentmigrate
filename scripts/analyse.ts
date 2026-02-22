/**
 * analyse.ts
 *
 * The analyse command — the core unique value of the tool.
 * Given a URL, it crawls a sample, uses a cloud LLM to discover content
 * types, and generates a complete site-config.yaml ready for extraction.
 *
 * Two-tier LLM economics: spend ~$2-5 once on Claude to generate all
 * configuration, then spend ~$0 on Ollama to extract hundreds of pages.
 *
 * Uses the Claude Code CLI (`claude --print`) with the user's Max/Pro
 * subscription — no ANTHROPIC_API_KEY needed.
 *
 * Output structure:
 *   output/<site-slug>/site-config.yaml      — generated config
 *   output/<site-slug>/crawl-output/*.json    — crawled page data
 *   output/<site-slug>/reports/               — analyse log
 *
 * Usage:
 *   npx tsx scripts/analyse.ts --url https://www.example.com [options]
 *
 * Follow the standard: docs/ai-developer/rules/script-standard.md
 * TypeScript specifics: docs/ai-developer/rules/typescript.md
 */

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stringify as yamlStringify } from "yaml";
import { samplePages, loadCrawlOutput, type SamplePage } from "../src/analyse/sample-crawler.js";
import { discoverContentTypes } from "../src/analyse/discover-types.js";
import {
  generateSchemaAndPrompt,
  generateCleanupRules,
  type GeneratedTypeConfig,
} from "../src/analyse/generate-config.js";
import { assembleConfig, deriveSiteSlug } from "../src/analyse/assemble-config.js";

// ─────────────────────────────────────────────────────────────────────────────
// SCRIPT METADATA
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT_ID = "analyse";
const SCRIPT_NAME = "Analyse Site";
const SCRIPT_VER = "0.2.0";
const SCRIPT_DESCRIPTION = "Analyse a website and generate site-config.yaml for content migration.";
const SCRIPT_CATEGORY = "MIGRATION";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_ROOT = path.join(PROJECT_ROOT, "output");
const DEFAULT_SAMPLE_SIZE = 30;
const MAX_PAGES_FOR_CLEANUP = 5;
const MAX_PAGES_PER_TYPE = 3;

// ─────────────────────────────────────────────────────────────────────────────
// LOGGING
// ─────────────────────────────────────────────────────────────────────────────

function logTime(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}
function logInfo(msg: string): void {
  console.error(`[${logTime()}] INFO  ${msg}`);
}
function logSuccess(msg: string): void {
  console.error(`[${logTime()}] OK    ${msg}`);
}
function logError(msg: string): void {
  console.error(`[${logTime()}] ERROR ${msg}`);
}
function logWarning(msg: string): void {
  console.error(`[${logTime()}] WARN  ${msg}`);
}
function logStart(): void {
  logInfo(`Starting: ${SCRIPT_NAME} Ver: ${SCRIPT_VER}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELP
// ─────────────────────────────────────────────────────────────────────────────

function showHelp(): void {
  const text = `
${SCRIPT_NAME} (v${SCRIPT_VER})
${SCRIPT_DESCRIPTION}

Usage:
  npx tsx scripts/${SCRIPT_ID}.ts --url <URL> [options]

Options:
  --url URL           Site URL to analyse (required)
  --sample N          Number of sample pages to crawl (default: ${DEFAULT_SAMPLE_SIZE})
  --model MODEL       Claude model to use (optional, uses CLI default)
  --dry-run           Show what would be generated without writing files
  --skip-crawl        Skip crawling, reuse existing crawl-output/ files
  -h, --help          Show this help message

Output:
  All output goes to output/<site-slug>/ where site-slug is derived
  from the URL hostname (e.g. smartebyernorge-no).

Prerequisites:
  - Claude Code CLI (claude) must be installed and authenticated
  - Python 3.10+ with crawl4ai (pip install crawl4ai) unless using --skip-crawl

Examples:
  npx tsx scripts/analyse.ts --url https://www.example.com
  npx tsx scripts/analyse.ts --url https://www.example.com --sample 50 --dry-run
  npx tsx scripts/analyse.ts --url https://www.example.com --skip-crawl

Metadata:
  ID:       ${SCRIPT_ID}
  Category: ${SCRIPT_CATEGORY}
`.trim();
  console.error(text);
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface AnalyseArgs {
  url: string;
  sample: number;
  model?: string;
  dryRun: boolean;
  skipCrawl: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// ARGUMENT PARSING
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): AnalyseArgs {
  const args = process.argv.slice(2);

  // Check for help flag first
  if (args.includes("-h") || args.includes("--help")) {
    showHelp();
    process.exit(0);
  }

  let url = "";
  let sample = DEFAULT_SAMPLE_SIZE;
  let model: string | undefined;
  let dryRun = false;
  let skipCrawl = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && args[i + 1]) {
      url = args[++i];
    } else if (args[i] === "--sample" && args[i + 1]) {
      sample = parseInt(args[++i], 10);
    } else if (args[i] === "--model" && args[i + 1]) {
      model = args[++i];
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--skip-crawl") {
      skipCrawl = true;
    }
  }

  if (!url) {
    logError("ERR001: --url is required");
    logInfo("Usage: npx tsx scripts/analyse.ts --url https://www.example.com [--sample 30]");
    process.exit(1);
  }

  return { url, sample, model, dryRun, skipCrawl };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: command checks
// ─────────────────────────────────────────────────────────────────────────────

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function checkPrerequisites(skipCrawl: boolean): void {
  // Claude CLI is always required
  if (!commandExists("claude")) {
    logError("ERR002: Claude Code CLI (claude) is required but not found");
    logInfo("Install it from: https://docs.anthropic.com/en/docs/claude-code");
    process.exit(1);
  }

  // Python + crawl4ai only needed if crawling
  if (!skipCrawl) {
    const venvPython = path.join(PROJECT_ROOT, "crawl", ".venv", "bin", "python3");
    if (!fs.existsSync(venvPython) && !commandExists("python3")) {
      logError("ERR003: python3 is required for crawling but not found");
      logInfo("Install Python 3.10+ or use --skip-crawl with existing crawl-output/");
      process.exit(1);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: compute site paths
// ─────────────────────────────────────────────────────────────────────────────

interface SitePaths {
  siteDir: string;        // output/<slug>/
  crawlOutputDir: string; // output/<slug>/crawl-output/
  reportsDir: string;     // output/<slug>/reports/
  configPath: string;     // output/<slug>/site-config.yaml
}

function computeSitePaths(siteUrl: string): SitePaths {
  const slug = deriveSiteSlug(siteUrl);
  const siteDir = path.join(OUTPUT_ROOT, slug);
  return {
    siteDir,
    crawlOutputDir: path.join(siteDir, "crawl-output"),
    reportsDir: path.join(siteDir, "reports"),
    configPath: path.join(siteDir, "site-config.yaml"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: select diverse sample (group by URL depth/pattern, pick from each)
// ─────────────────────────────────────────────────────────────────────────────

function selectDiverseSample(pages: SamplePage[], maxCount: number): SamplePage[] {
  if (pages.length <= maxCount) return pages;

  // Group pages by first URL segment
  const groups = new Map<string, SamplePage[]>();
  for (const page of pages) {
    const segments = page.url_path.split("/").filter(Boolean);
    const key = segments[0] || "_root";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(page);
  }

  // Round-robin pick from each group
  const selected: SamplePage[] = [];
  const groupEntries = Array.from(groups.entries());
  let round = 0;

  while (selected.length < maxCount) {
    let addedAny = false;
    for (const [, groupPages] of groupEntries) {
      if (round < groupPages.length && selected.length < maxCount) {
        selected.push(groupPages[round]);
        addedAny = true;
      }
    }
    if (!addedAny) break;
    round++;
  }

  return selected;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  logStart();

  // Check prerequisites before doing any work
  checkPrerequisites(opts.skipCrawl);

  const startTime = Date.now();

  // Compute output paths
  const sitePaths = computeSitePaths(opts.url);
  const siteSlug = deriveSiteSlug(opts.url);

  logInfo(`URL:     ${opts.url}`);
  logInfo(`Site:    ${siteSlug}`);
  logInfo(`Sample:  ${opts.sample} pages`);
  logInfo(`Model:   ${opts.model || "(CLI default)"}`);
  logInfo(`Output:  ${sitePaths.siteDir}`);
  if (opts.dryRun) logInfo("Mode:    DRY RUN");

  // Create output directories
  if (!opts.dryRun) {
    fs.mkdirSync(sitePaths.crawlOutputDir, { recursive: true });
    fs.mkdirSync(sitePaths.reportsDir, { recursive: true });
  }

  // ── Phase 1: Sample crawl ──────────────────────────────────────────────
  logInfo("Phase 1: Crawling sample pages");

  let pages: SamplePage[];
  if (opts.skipCrawl) {
    logInfo(`Skipping crawl — loading existing files from ${sitePaths.crawlOutputDir}`);
    pages = loadCrawlOutput(sitePaths.crawlOutputDir);
    if (pages.length === 0) {
      // Fall back to legacy crawl-output/ at project root
      const legacyCrawlDir = path.join(PROJECT_ROOT, "crawl-output");
      pages = loadCrawlOutput(legacyCrawlDir);
      if (pages.length > 0) {
        logWarning(`No files in ${sitePaths.crawlOutputDir}, loaded ${pages.length} from legacy crawl-output/`);
      } else {
        logError("ERR004: No crawl output found. Run without --skip-crawl first.");
        process.exit(1);
      }
    }
    logInfo(`Loaded ${pages.length} pages`);
  } else {
    pages = await samplePages(opts.url, opts.sample, PROJECT_ROOT, sitePaths.crawlOutputDir, sitePaths.reportsDir);
  }

  // Select diverse sample for analysis (up to opts.sample)
  const sample = selectDiverseSample(pages, opts.sample);
  logInfo(`Selected ${sample.length} diverse pages for analysis`);

  // ── Phase 2: Discover content types ────────────────────────────────────
  logInfo("Phase 2: Discovering content types");

  const discoveredTypes = discoverContentTypes(opts.url, sample, opts.model);
  logSuccess(`Found ${discoveredTypes.length} content types`);
  for (const dt of discoveredTypes) {
    logInfo(`  ${dt.name} (${dt.representative_urls.length} representative pages)`);
  }

  // ── Phase 3: Generate schemas and prompts ──────────────────────────────
  logInfo("Phase 3: Generating schemas and extraction prompts");

  const typeConfigs: GeneratedTypeConfig[] = [];
  for (const dt of discoveredTypes) {
    logInfo(`Generating config for "${dt.name}"...`);
    const representativePages = sample.filter((p) =>
      dt.representative_urls.some((url) => p.url_path === url || p.url.includes(url))
    );

    // If no exact matches, try partial matching by URL patterns
    const pagesForType =
      representativePages.length > 0
        ? representativePages
        : sample.filter((p) =>
            dt.url_patterns.some((pattern) => {
              try {
                return new RegExp(pattern).test(p.url_path);
              } catch {
                return p.url_path.includes(pattern.replace(/[\\^$]/g, ""));
              }
            })
          );

    const pagesToSend = pagesForType.slice(0, MAX_PAGES_PER_TYPE);
    if (pagesToSend.length === 0) {
      logWarning(`No representative pages found for "${dt.name}", using first sample page`);
      pagesToSend.push(sample[0]);
    }

    const config = generateSchemaAndPrompt(opts.url, dt, pagesToSend, opts.model);
    typeConfigs.push(config);
    logSuccess(`${dt.name}: ${Object.keys(config.extras).length} extra fields`);
  }

  // Generate cleanup rules
  logInfo("Generating cleanup rules...");
  const cleanupPages = sample.slice(0, MAX_PAGES_FOR_CLEANUP);
  const cleanupRules = generateCleanupRules(opts.url, cleanupPages, opts.model);
  logSuccess(`${cleanupRules.length} cleanup patterns`);

  // ── Phase 4: Assemble and write config ─────────────────────────────────
  logInfo("Phase 4: Assembling site-config.yaml");

  const modelLabel = opts.model || "claude-cli-default";
  const siteConfig = assembleConfig(opts.url, discoveredTypes, typeConfigs, cleanupRules, modelLabel);
  const yamlContent = yamlStringify(siteConfig, {
    lineWidth: 120,
    defaultKeyType: "PLAIN",
    defaultStringType: "PLAIN",
  });

  // Prepend comment header
  const siteName = siteConfig.site.name;
  const header = [
    `# site-config.yaml — ${siteName}`,
    `#`,
    `# Auto-generated by: contentmigrate analyse --url ${opts.url}`,
    `# Generated at: ${new Date().toISOString()}`,
    `# Model: ${modelLabel}`,
    `#`,
    `# Review this file before running extraction.`,
    `# See docs for format: https://github.com/urbalurba/contentmigrate`,
    ``,
  ].join("\n");

  const finalYaml = header + yamlContent;

  if (opts.dryRun) {
    logInfo("DRY RUN — would write the following config:");
    console.log(finalYaml);
  } else {
    fs.writeFileSync(sitePaths.configPath, finalYaml, "utf-8");
    if (!fs.existsSync(sitePaths.configPath)) {
      logError("ERR005: Failed to write config file");
      process.exit(1);
    }
    logSuccess(`Written to: ${sitePaths.configPath}`);
  }

  // Save analysis log
  const logFilePath = path.join(sitePaths.reportsDir, "analyse-log.json");
  const log = {
    timestamp: new Date().toISOString(),
    url: opts.url,
    siteSlug: siteSlug,
    model: modelLabel,
    sample_count: sample.length,
    discovered_types: discoveredTypes,
    type_configs: typeConfigs.map((tc) => ({
      name: tc.name,
      extras_count: Object.keys(tc.extras).length,
    })),
    cleanup_rules_count: cleanupRules.length,
    elapsed_ms: Date.now() - startTime,
  };
  if (!opts.dryRun) {
    fs.writeFileSync(logFilePath, JSON.stringify(log, null, 2), "utf-8");
  }

  // Summary
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  logSuccess("Analysis complete!");
  logInfo(`Content types:  ${discoveredTypes.length}`);
  for (const dt of discoveredTypes) {
    const matchedPages = sample.filter((p) =>
      dt.url_patterns.some((pattern) => {
        try {
          return new RegExp(pattern).test(p.url_path);
        } catch {
          return false;
        }
      })
    );
    logInfo(`  ${dt.name.padEnd(20)} ${matchedPages.length} pages matched`);
  }
  logInfo(`Cleanup rules:  ${cleanupRules.length}`);
  logInfo(`Time:           ${elapsedSec}s`);
  if (!opts.dryRun) {
    logInfo(`Analysis log:   ${logFilePath}`);
    logInfo(`Config file:    ${sitePaths.configPath}`);
    logInfo("Next steps:");
    logInfo(`  1. Review ${sitePaths.configPath}`);
    logInfo(`  2. Extract: npx tsx scripts/orchestrator.ts --config ${sitePaths.configPath}`);
    logInfo(`  3. Validate: npx tsx scripts/validate.ts --config ${sitePaths.configPath}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECT RUN GUARD
// ─────────────────────────────────────────────────────────────────────────────

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("analyse.ts") ||
   process.argv[1].endsWith("analyse.js"));

if (isDirectRun) {
  main().catch((err) => {
    logError(`Unexpected error: ${err}`);
    process.exit(1);
  });
}
