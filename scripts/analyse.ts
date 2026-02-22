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
 * Usage:
 *   npm run analyse -- --url https://www.example.com
 *
 * Options:
 *   --url URL           Site URL to analyse (required)
 *   --sample N          Number of sample pages to crawl (default: 30)
 *   --output PATH       Output config file path (default: ./site-config.yaml)
 *   --model MODEL       Claude model to use (default: claude-sonnet-4-20250514)
 *   --dry-run           Show what would be generated without writing files
 *   --skip-crawl        Skip crawling, reuse existing crawl-output/ files
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { stringify as yamlStringify } from "yaml";
import { samplePages, type SamplePage } from "../src/analyse/sample-crawler.js";
import { discoverContentTypes, type DiscoveredType } from "../src/analyse/discover-types.js";
import {
  generateSchemaAndPrompt,
  generateCleanupRules,
  type GeneratedTypeConfig,
  type GeneratedCleanupRule,
} from "../src/analyse/generate-config.js";
import { assembleConfig } from "../src/analyse/assemble-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

interface AnalyseArgs {
  url: string;
  sample: number;
  output: string;
  model: string;
  dryRun: boolean;
  skipCrawl: boolean;
}

function parseArgs(): AnalyseArgs {
  const args = process.argv.slice(2);
  let url = "";
  let sample = 30;
  let output = "./site-config.yaml";
  let model = "claude-sonnet-4-20250514";
  let dryRun = false;
  let skipCrawl = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && args[i + 1]) {
      url = args[++i];
    } else if (args[i] === "--sample" && args[i + 1]) {
      sample = parseInt(args[++i], 10);
    } else if (args[i] === "--output" && args[i + 1]) {
      output = args[++i];
    } else if (args[i] === "--model" && args[i + 1]) {
      model = args[++i];
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--skip-crawl") {
      skipCrawl = true;
    }
  }

  if (!url) {
    console.error("❌ --url is required");
    console.error("Usage: npm run analyse -- --url https://www.example.com [--sample 30]");
    process.exit(1);
  }

  return { url, sample, output, model, dryRun, skipCrawl };
}

// ---------------------------------------------------------------------------
// Claude client helper
// ---------------------------------------------------------------------------

function getClaudeClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("❌ ANTHROPIC_API_KEY environment variable is required");
    console.error("   Set it with: export ANTHROPIC_API_KEY=sk-ant-...");
    process.exit(1);
  }
  return new Anthropic({ apiKey });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  const startTime = Date.now();

  console.log("=".repeat(60));
  console.log("  Content Migration — Site Analysis");
  console.log("=".repeat(60));
  console.log(`  URL:     ${opts.url}`);
  console.log(`  Sample:  ${opts.sample} pages`);
  console.log(`  Model:   ${opts.model}`);
  console.log(`  Output:  ${opts.output}`);
  if (opts.dryRun) console.log(`  Mode:    DRY RUN`);
  console.log("");

  // ── Phase 1: Sample crawl ──────────────────────────────────────────────
  console.log("─".repeat(60));
  console.log("  Phase 1: Crawling sample pages");
  console.log("─".repeat(60));

  let pages: SamplePage[];
  if (opts.skipCrawl) {
    console.log("  Skipping crawl — loading existing crawl-output/ files...");
    pages = loadExistingCrawlOutput();
    if (pages.length === 0) {
      console.error("  ❌ No crawl output found. Run without --skip-crawl first.");
      process.exit(1);
    }
    console.log(`  Loaded ${pages.length} pages from crawl-output/`);
  } else {
    pages = await samplePages(opts.url, opts.sample, PROJECT_ROOT);
  }

  // Select diverse sample for analysis (up to opts.sample)
  const sample = selectDiverseSample(pages, opts.sample);
  console.log(`  Selected ${sample.length} diverse pages for analysis\n`);

  // ── Phase 2: Discover content types ────────────────────────────────────
  console.log("─".repeat(60));
  console.log("  Phase 2: Discovering content types");
  console.log("─".repeat(60));

  const client = getClaudeClient();
  const discoveredTypes = await discoverContentTypes(client, opts.model, opts.url, sample);
  console.log(`  Found ${discoveredTypes.length} content types:`);
  for (const dt of discoveredTypes) {
    console.log(`    • ${dt.name} (${dt.representative_urls.length} representative pages)`);
  }
  console.log("");

  // ── Phase 3: Generate schemas and prompts ──────────────────────────────
  console.log("─".repeat(60));
  console.log("  Phase 3: Generating schemas and extraction prompts");
  console.log("─".repeat(60));

  const typeConfigs: GeneratedTypeConfig[] = [];
  for (const dt of discoveredTypes) {
    console.log(`  Generating config for "${dt.name}"...`);
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

    const pagesToSend = pagesForType.slice(0, 3);
    if (pagesToSend.length === 0) {
      console.log(`    ⚠️  No representative pages found, using first sample page`);
      pagesToSend.push(sample[0]);
    }

    const config = await generateSchemaAndPrompt(client, opts.model, opts.url, dt, pagesToSend);
    typeConfigs.push(config);
    console.log(`    ✅ ${dt.name}: ${Object.keys(config.extras).length} extra fields`);
  }

  // Generate cleanup rules
  console.log("\n  Generating cleanup rules...");
  const cleanupPages = sample.slice(0, 5);
  const cleanupRules = await generateCleanupRules(client, opts.model, opts.url, cleanupPages);
  console.log(`    ✅ ${cleanupRules.length} cleanup patterns\n`);

  // ── Phase 4: Assemble and write config ─────────────────────────────────
  console.log("─".repeat(60));
  console.log("  Phase 4: Assembling site-config.yaml");
  console.log("─".repeat(60));

  const siteConfig = assembleConfig(opts.url, discoveredTypes, typeConfigs, cleanupRules, opts.model);
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
    `# Model: ${opts.model}`,
    `#`,
    `# Review this file before running extraction.`,
    `# See docs for format: https://github.com/urbalurba/contentmigrate`,
    ``,
  ].join("\n");

  const finalYaml = header + yamlContent;

  if (opts.dryRun) {
    console.log("\n  DRY RUN — would write the following config:\n");
    console.log("─".repeat(60));
    console.log(finalYaml);
    console.log("─".repeat(60));
  } else {
    fs.writeFileSync(opts.output, finalYaml, "utf-8");
    console.log(`  ✅ Written to: ${opts.output}`);
  }

  // Save analysis log
  const reportsDir = path.join(PROJECT_ROOT, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const logPath = path.join(reportsDir, "analyse-log.json");
  const log = {
    timestamp: new Date().toISOString(),
    url: opts.url,
    model: opts.model,
    sample_count: sample.length,
    discovered_types: discoveredTypes,
    type_configs: typeConfigs.map((tc) => ({
      name: tc.name,
      extras_count: Object.keys(tc.extras).length,
    })),
    cleanup_rules_count: cleanupRules.length,
    elapsed_ms: Date.now() - startTime,
  };
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2), "utf-8");

  // Summary
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("");
  console.log("=".repeat(60));
  console.log("  Analysis complete!");
  console.log("=".repeat(60));
  console.log(`  Content types:  ${discoveredTypes.length}`);
  for (const dt of discoveredTypes) {
    const pages = sample.filter((p) =>
      dt.url_patterns.some((pattern) => {
        try {
          return new RegExp(pattern).test(p.url_path);
        } catch {
          return false;
        }
      })
    );
    console.log(`    • ${dt.name.padEnd(20)} ${pages.length} pages matched`);
  }
  console.log(`  Cleanup rules:  ${cleanupRules.length}`);
  console.log(`  Time:           ${elapsedSec}s`);
  console.log(`  Analysis log:   ${logPath}`);
  if (!opts.dryRun) {
    console.log(`  Config file:    ${opts.output}`);
    console.log("");
    console.log("  Next steps:");
    console.log(`    1. Review ${opts.output} — adjust content types, prompts, cleanup rules`);
    console.log(`    2. Crawl the full site: cd crawl && python crawl_site.py --url ${opts.url}`);
    console.log(`    3. Extract content: npm run extract -- --config ${opts.output}`);
    console.log(`    4. Validate output: npm run validate -- --config ${opts.output}`);
  }
  console.log("=".repeat(60));
  console.log("");
}

// ---------------------------------------------------------------------------
// Helper: load existing crawl output
// ---------------------------------------------------------------------------

function loadExistingCrawlOutput(): SamplePage[] {
  const crawlDir = path.join(PROJECT_ROOT, "crawl-output");
  if (!fs.existsSync(crawlDir)) return [];

  const files = fs.readdirSync(crawlDir).filter((f) => f.endsWith(".json"));
  const pages: SamplePage[] = [];

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(crawlDir, file), "utf-8"));
      if (raw.success && raw.markdown) {
        pages.push({
          url: raw.url,
          url_path: raw.url_path,
          slug: raw.slug,
          markdown: raw.markdown,
          markdown_length: raw.markdown_length || raw.markdown.length,
        });
      }
    } catch {
      // Skip invalid files
    }
  }

  return pages;
}

// ---------------------------------------------------------------------------
// Helper: select diverse sample (group by URL depth/pattern, pick from each)
// ---------------------------------------------------------------------------

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

// Only run main() when executed directly (not when imported for testing)
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("analyse.ts") ||
   process.argv[1].endsWith("analyse.js"));

if (isDirectRun) {
  main().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
  });
}
