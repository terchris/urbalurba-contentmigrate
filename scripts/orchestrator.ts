/**
 * orchestrator.ts
 *
 * Single-tier extraction engine — schema v2 (all Ollama).
 *
 * Reads Crawl4AI JSON files from crawl-output/, feeds clean Markdown
 * to gemma3:4b via Ollama for metadata extraction, and writes .md
 * files with YAML front matter to content/.
 *
 * Complex pages (events, debates, conferences) get a forced content type
 * hint based on URL pattern matching, which skips the classification pass
 * and goes straight to the archetype-specific schema. This produces the
 * same quality as Claude for panelist/moderator extraction at 10x less cost.
 *
 * Migration metadata (timing, method, confidence) is written to
 * reports/extraction-log.json separately from the content files.
 *
 * Usage:
 *   npm run extract
 *
 * Options:
 *   --limit N                    # Process only N pages (for testing)
 *   --concurrency N              # Parallel requests (default: 2)
 *   --dry-run                    # Show what would be processed without extracting
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { PATHS, SECTION_DIRS, classifyPage } from "../lib/config.js";
import type { ContentTypeHint } from "../lib/config.js";
import { extractWithOllama, type ExtractionResult } from "../lib/ollama-client.js";
import { cleanBody } from "../lib/clean-body.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CrawlPage {
  url: string;
  slug: string;
  url_path: string;
  success: boolean;
  markdown: string;
  metadata?: {
    images?: Array<{ src: string; alt: string; desc: string }>;
  };
}

interface ExtractionLogEntry {
  url_path: string;
  slug: string;
  tier: string;
  content_type: string;
  success: boolean;
  elapsed_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  output_path: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(): { limit?: number; dryRun: boolean; concurrency: number } {
  const args = process.argv.slice(2);
  let limit: number | undefined;
  let dryRun = false;
  let concurrency = 2; // Default: 2 parallel requests (sweet spot — see docs/performance-tuning.md)

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    } else if (args[i] === "--concurrency" && args[i + 1]) {
      concurrency = parseInt(args[++i], 10);
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  return { limit, dryRun, concurrency };
}

// ---------------------------------------------------------------------------
// Load Crawl4AI pages
// ---------------------------------------------------------------------------

function loadCrawlPages(): CrawlPage[] {
  const crawlDir = PATHS.crawlOutput;
  if (!fs.existsSync(crawlDir)) {
    console.error(`\n❌ Crawl output not found: ${crawlDir}`);
    console.error(`   Run the crawl first: cd crawl && python crawl_site.py`);
    process.exit(1);
  }

  const files = fs.readdirSync(crawlDir).filter((f) => f.endsWith(".json"));
  const pages: CrawlPage[] = [];

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(crawlDir, file), "utf-8"));
      if (raw.success && raw.markdown) {
        pages.push(raw as CrawlPage);
      }
    } catch {
      // Skip invalid files
    }
  }

  return pages;
}

// ---------------------------------------------------------------------------
// Filter HTTP duplicates
// ---------------------------------------------------------------------------

function filterDuplicates(pages: CrawlPage[]): CrawlPage[] {
  const seen = new Map<string, CrawlPage>();

  for (const page of pages) {
    const urlPath = page.url_path || new URL(page.url).pathname;
    // Prefer HTTPS over HTTP (keep the first one seen, skip duplicates)
    if (!seen.has(urlPath)) {
      seen.set(urlPath, page);
    } else if (page.url.startsWith("https://")) {
      // Replace HTTP version with HTTPS version
      seen.set(urlPath, page);
    }
  }

  return Array.from(seen.values());
}

// ---------------------------------------------------------------------------
// Filter error pages (404, 503, etc.)
// ---------------------------------------------------------------------------

const ERROR_PAGE_MARKERS = [
  "page not found",
  "404",
  "service unavailable",
  "503 error",
  "denne siden finnes ikke",
  "finner ikke siden",
];

function isErrorPage(page: CrawlPage): boolean {
  const md = page.markdown.toLowerCase();
  // Only flag as error page if the markdown is very short AND contains error markers
  // Short pages with error text are almost certainly error responses
  if (md.length > 2000) return false;
  return ERROR_PAGE_MARKERS.some((marker) => md.includes(marker));
}

function filterErrorPages(pages: CrawlPage[]): { valid: CrawlPage[]; errorCount: number } {
  const valid: CrawlPage[] = [];
  let errorCount = 0;
  for (const page of pages) {
    if (isErrorPage(page)) {
      errorCount++;
    } else {
      valid.push(page);
    }
  }
  return { valid, errorCount };
}

// ---------------------------------------------------------------------------
// Post-processing: fix common LLM extraction issues
// ---------------------------------------------------------------------------

const SITE_ORIGIN = "https://www.smartebyernorge.no";

function postProcessExtraction(
  data: Record<string, unknown>,
  urlPath: string
): void {
  // 1. Fix source_url — always construct from url_path, never trust LLM
  data.source_url = `${SITE_ORIGIN}${urlPath}`;

  // 2. Fix url_path — always use the actual url_path
  data.url_path = urlPath;

  // 3. Fix description = title (lazy LLM output)
  if (
    typeof data.description === "string" &&
    typeof data.title === "string" &&
    data.description.trim().toLowerCase() === data.title.trim().toLowerCase()
  ) {
    data.description = "";
  }

  // 4. Normalize tags: lowercase, trim whitespace
  if (Array.isArray(data.tags)) {
    data.tags = (data.tags as string[])
      .map((t) => t.toLowerCase().trim())
      .filter((t) => t.length > 0);
    // Deduplicate
    data.tags = [...new Set(data.tags as string[])];
  }

  // 5. Normalize date format — ensure YYYY-MM-DD
  if (typeof data.date === "string" && data.date.length > 0) {
    const dateStr = data.date.trim();
    // Fix common issues: trailing "T00:00:00", extra whitespace
    const isoMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) {
      data.date = isoMatch[1];
    }
  }
}

// ---------------------------------------------------------------------------
// Convert extraction result to Markdown with YAML front matter
// ---------------------------------------------------------------------------

function extractionToMarkdown(
  frontmatterData: Record<string, unknown>,
  body: string
): string {
  // LLM provides metadata only; body comes from Crawl4AI markdown
  return matter.stringify(body, frontmatterData);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { limit, dryRun, concurrency } = parseArgs();

  console.log("=".repeat(60));
  console.log("  smartebyernorge.no — Content Extraction (v2, all Ollama)");
  console.log("=".repeat(60));

  // Load Crawl4AI pages
  console.log(`\n📂 Loading Crawl4AI output from: ${PATHS.crawlOutput}`);
  let pages = loadCrawlPages();
  console.log(`   Found ${pages.length} crawled pages`);

  // Filter HTTP duplicates
  const beforeFilter = pages.length;
  pages = filterDuplicates(pages);
  const dupsRemoved = beforeFilter - pages.length;
  if (dupsRemoved > 0) {
    console.log(`   Filtered ${dupsRemoved} HTTP duplicates → ${pages.length} unique pages`);
  }

  // Filter error pages (404, 503, etc.)
  const { valid: validPages, errorCount: errorPagesRemoved } = filterErrorPages(pages);
  if (errorPagesRemoved > 0) {
    console.log(`   Filtered ${errorPagesRemoved} error pages (404/503) → ${validPages.length} valid pages`);
  }
  pages = validPages;

  // Classify each page — get content type hint for complex pages
  const classified = pages.map((page) => {
    const urlPath = page.url_path || new URL(page.url).pathname;
    const { contentTypeHint } = classifyPage(urlPath);
    return { page, urlPath, contentTypeHint };
  });

  let toProcess = classified;

  // Apply limit
  if (limit) {
    toProcess = toProcess.slice(0, limit);
    console.log(`🔧 Limit: ${limit} pages`);
  }

  if (dryRun) {
    console.log(`\n🔍 DRY RUN — would process ${toProcess.length} pages:\n`);
    for (const { urlPath, contentTypeHint } of toProcess) {
      const hint = contentTypeHint ? ` → ${contentTypeHint}` : "";
      console.log(`  [ollama${hint.padEnd(15)}] ${urlPath}`);
    }
    const hintedCount = toProcess.filter((p) => p.contentTypeHint).length;
    const autoCount = toProcess.filter((p) => !p.contentTypeHint).length;
    console.log(`\n  Auto-classify: ${autoCount}  |  Forced type: ${hintedCount}`);
    return;
  }

  // Ensure output directories exist
  fs.mkdirSync(PATHS.content, { recursive: true });
  fs.mkdirSync(PATHS.reports, { recursive: true });

  // Process pages with concurrency
  const extractionLog: ExtractionLogEntry[] = [];
  const total = toProcess.length;
  let successCount = 0;
  let failCount = 0;
  let completed = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let slugCollisions = 0;
  const startTime = Date.now();

  // Track used output paths to detect slug collisions
  const usedPaths = new Set<string>();

  console.log(`\n🚀 Extracting ${total} pages (concurrency: ${concurrency})...\n`);

  // Process a single page
  async function processOne(item: typeof toProcess[0]): Promise<void> {
    const { page, urlPath, contentTypeHint } = item;
    const idx = ++completed;
    const hintLabel = contentTypeHint ? `→${contentTypeHint}` : "auto";

    // ETA calculation (after at least 3 pages for stable average)
    let eta = "";
    if (idx > 3) {
      const elapsedSoFar = Date.now() - startTime;
      const avgMs = elapsedSoFar / (idx - 1); // -1 because current page hasn't finished yet
      const remainingMs = avgMs * (total - idx);
      eta = `  ETA ${formatDuration(remainingMs)}`;
    }
    console.log(`[${idx}/${total}]${eta}  [${hintLabel}] ${urlPath}...`);

    // All pages go through Ollama — complex pages get a forced content type
    const extraction = await extractWithOllama(page.markdown, urlPath, contentTypeHint);

    if (extraction) {
      // Post-process: fix source_url, description=title, tag casing, etc.
      postProcessExtraction(extraction.data, urlPath);

      const contentType = (extraction.data.content_type as string) || "page";
      const sectionDir = SECTION_DIRS[contentType] || "sider";
      // Sanitise slug: strip slashes so the LLM can't create nested dirs
      const rawSlug = (extraction.data.slug as string) || page.slug || path.basename(urlPath);
      let slug = path.basename(rawSlug);
      const outputDir = path.join(PATHS.content, sectionDir);
      fs.mkdirSync(outputDir, { recursive: true });

      // Detect slug collisions — disambiguate using parent segment from URL
      let outputPath = path.join(outputDir, `${slug}.md`);
      if (usedPaths.has(outputPath)) {
        slugCollisions++;
        const segments = urlPath.split("/").filter(Boolean);
        // Use the second-to-last segment as prefix (the parent dir), or first segment
        const prefix = segments.length >= 2 ? segments[segments.length - 2] : segments[0] || "dup";
        slug = `${prefix}--${slug}`;
        outputPath = path.join(outputDir, `${slug}.md`);
        // If still colliding, add a numeric suffix
        let n = 2;
        while (usedPaths.has(outputPath)) {
          outputPath = path.join(outputDir, `${prefix}--${path.basename(rawSlug)}-${n}.md`);
          slug = `${prefix}--${path.basename(rawSlug)}-${n}`;
          n++;
        }
      }
      usedPaths.add(outputPath);
      // Update front matter slug to match the actual filename
      extraction.data.slug = slug;
      // LLM provides metadata; body comes from Crawl4AI markdown, cleaned of boilerplate
      const markdown = extractionToMarkdown(extraction.data, cleanBody(page.markdown));
      fs.writeFileSync(outputPath, markdown, "utf-8");

      totalPromptTokens += extraction.promptTokens;
      totalCompletionTokens += extraction.completionTokens;

      const relOutputPath = path.relative(PATHS.projectRoot, outputPath);
      console.log(`         ✅ ${extraction.elapsed}ms → ${relOutputPath}`);

      extractionLog.push({
        url_path: urlPath,
        slug,
        tier: "ollama",
        content_type: contentType,
        success: true,
        elapsed_ms: extraction.elapsed,
        prompt_tokens: extraction.promptTokens,
        completion_tokens: extraction.completionTokens,
        output_path: relOutputPath,
        timestamp: new Date().toISOString(),
      });
      successCount++;
    } else {
      console.log(`         ❌ Failed`);
      extractionLog.push({
        url_path: urlPath,
        slug: page.slug || "",
        tier: "ollama",
        content_type: "unknown",
        success: false,
        elapsed_ms: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        output_path: "",
        timestamp: new Date().toISOString(),
      });
      failCount++;
    }
  }

  // Process in batches of `concurrency`
  for (let i = 0; i < toProcess.length; i += concurrency) {
    const batch = toProcess.slice(i, i + concurrency);
    await Promise.all(batch.map(processOne));
  }

  // Final stats
  const endTime = Date.now();
  const wallClockMs = endTime - startTime;
  const totalTokens = totalPromptTokens + totalCompletionTokens;
  const avgPerPage = successCount > 0 ? wallClockMs / successCount : 0;
  const totalElapsedMs = extractionLog.reduce((sum, e) => sum + e.elapsed_ms, 0);

  // Write extraction log (migration metadata — separate from content files)
  const logPath = path.join(PATHS.reports, "extraction-log.json");
  fs.writeFileSync(
    logPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        total,
        success: successCount,
        failed: failCount,
        wallClockMs,
        totalPromptTokens,
        totalCompletionTokens,
        totalTokens,
        entries: extractionLog,
      },
      null,
      2
    )
  );

  // Summary
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);
  const timeFmt = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Extraction complete!`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  ✅ Success: ${successCount}/${total}`);
  console.log(`  ❌ Failed:  ${failCount}/${total}`);
  if (slugCollisions > 0) {
    console.log(`  🔀 Slug collisions resolved: ${slugCollisions}`);
  }
  console.log(``);
  console.log(`  ⏱️  Started:      ${timeFmt(startDate)}`);
  console.log(`  ⏱️  Finished:     ${timeFmt(endDate)}`);
  console.log(`  ⏱️  Wall clock:   ${formatDuration(wallClockMs)}`);
  console.log(`  ⏱️  Avg per page: ${(avgPerPage / 1000).toFixed(1)}s`);
  console.log(``);
  console.log(`  🔤 Prompt tokens:     ${formatNumber(totalPromptTokens)}`);
  console.log(`  🔤 Completion tokens: ${formatNumber(totalCompletionTokens)}`);
  console.log(`  🔤 Total tokens:      ${formatNumber(totalTokens)}`);
  console.log(``);
  console.log(`  📄 Log:     ${logPath}`);
  console.log(`  📂 Content: ${PATHS.content}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
