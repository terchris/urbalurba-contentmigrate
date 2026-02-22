/**
 * orchestrator.ts
 *
 * Config-driven extraction engine — reads all site-specific configuration
 * from a site-config.yaml file via the SiteConfig facade.
 *
 * Reads Crawl4AI JSON files from crawl-output/, feeds clean Markdown
 * to the configured LLM via Ollama for metadata extraction, and writes .md
 * files with YAML front matter to content/.
 *
 * Complex pages (events, debates, conferences) get a forced content type
 * hint based on URL pattern matching from the config, which skips the
 * classification pass and goes straight to the archetype-specific schema.
 *
 * Migration metadata (timing, method, confidence) is written to
 * reports/extraction-log.json separately from the content files.
 *
 * Usage:
 *   npx tsx scripts/orchestrator.ts --config site-config.yaml [options]
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
import { extractWithOllama, type ExtractionResult, type ExtractionContext } from "../lib/ollama-client.js";

// ─────────────────────────────────────────────────────────────────────────────
// SCRIPT METADATA
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT_ID = "orchestrator";
const SCRIPT_NAME = "Extract Content";
const SCRIPT_VER = "0.1.0";
const SCRIPT_DESCRIPTION = "Extract structured content from crawled pages using Ollama LLM.";
const SCRIPT_CATEGORY = "MIGRATION";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_CONFIG_PATH = "./site-config.yaml";
const DEFAULT_CONCURRENCY = 2;

const PATHS = {
  projectRoot: PROJECT_ROOT,
  crawlOutput: path.join(PROJECT_ROOT, "crawl-output"),
  crawlManifest: path.join(PROJECT_ROOT, "reports", "crawl-manifest.json"),
  content: path.join(PROJECT_ROOT, "content"),
  images: path.join(PROJECT_ROOT, "images"),
  reports: path.join(PROJECT_ROOT, "reports"),
} as const;

const ERROR_PAGE_MARKERS = [
  "page not found",
  "404",
  "service unavailable",
  "503 error",
  "denne siden finnes ikke",
  "finner ikke siden",
];

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
  npx tsx scripts/${SCRIPT_ID}.ts [options]

Options:
  --config PATH      Path to site-config.yaml (default: ${DEFAULT_CONFIG_PATH})
  --limit N          Process only N pages (for testing)
  --concurrency N    Parallel requests (default: ${DEFAULT_CONCURRENCY})
  --dry-run          Show what would be processed without extracting
  -h, --help         Show this help message

Prerequisites:
  - Ollama must be running (ollama serve)
  - Required model must be pulled (e.g. ollama pull gemma3:4b)
  - Crawl output must exist in crawl-output/

Metadata:
  ID:       ${SCRIPT_ID}
  Category: ${SCRIPT_CATEGORY}
`.trim();
  console.error(text);
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// ARGUMENT PARSING
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): {
  configPath: string;
  limit?: number;
  dryRun: boolean;
  concurrency: number;
} {
  const args = process.argv.slice(2);

  // Check for help flag first
  if (args.includes("-h") || args.includes("--help")) {
    showHelp();
    process.exit(0);
  }

  let configPath = DEFAULT_CONFIG_PATH;
  let limit: number | undefined;
  let dryRun = false;
  let concurrency = DEFAULT_CONCURRENCY;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config" && args[i + 1]) {
      configPath = args[++i];
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    } else if (args[i] === "--concurrency" && args[i + 1]) {
      concurrency = parseInt(args[++i], 10);
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  return { configPath, limit, dryRun, concurrency };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: formatting
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: load crawl pages
// ─────────────────────────────────────────────────────────────────────────────

function loadCrawlPages(): CrawlPage[] {
  const crawlDir = PATHS.crawlOutput;
  if (!fs.existsSync(crawlDir)) {
    logError(`ERR001: Crawl output not found: ${crawlDir}`);
    logInfo("Run the crawl first: cd crawl && python crawl_site.py");
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

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: filter duplicates and error pages
// ─────────────────────────────────────────────────────────────────────────────

function filterDuplicates(pages: CrawlPage[]): CrawlPage[] {
  const seen = new Map<string, CrawlPage>();

  for (const page of pages) {
    const urlPath = page.url_path || new URL(page.url).pathname;
    if (!seen.has(urlPath)) {
      seen.set(urlPath, page);
    } else if (page.url.startsWith("https://")) {
      seen.set(urlPath, page);
    }
  }

  return Array.from(seen.values());
}

function isErrorPage(page: CrawlPage): boolean {
  const md = page.markdown.toLowerCase();
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

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: post-processing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Post-process extracted data. Site URL comes from config, not hardcoded.
 */
export function postProcessExtraction(
  data: Record<string, unknown>,
  urlPath: string,
  siteUrl: string
): void {
  // 1. Fix source_url — always construct from url_path, never trust LLM
  data.source_url = `${siteUrl}${urlPath}`;

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
    data.tags = [...new Set(data.tags as string[])];
  }

  // 5. Normalize date format — ensure YYYY-MM-DD
  if (typeof data.date === "string" && data.date.length > 0) {
    const dateStr = data.date.trim();
    const isoMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) {
      data.date = isoMatch[1];
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: convert extraction to markdown
// ─────────────────────────────────────────────────────────────────────────────

function extractionToMarkdown(
  frontmatterData: Record<string, unknown>,
  body: string
): string {
  return matter.stringify(body, frontmatterData);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const { configPath, limit, dryRun, concurrency } = parseArgs();
  logStart();

  // Load site configuration
  let site: SiteConfigFacade;
  try {
    const config = await loadSiteConfig(configPath);
    site = createSiteConfigFacade(config);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(`ERR002: Failed to load config from "${configPath}"`);
    logError(`ERR002: ${msg}`);
    process.exit(1);
  }

  // Build extraction context for the LLM client
  const typesWithExtras = site.config.content_types
    .filter((ct) => ct.schema.extras && Object.keys(ct.schema.extras).length > 0)
    .map((ct) => ct.name);

  const extractionCtx: ExtractionContext = {
    schemas: site.schemas,
    prompts: site.prompts,
    typesWithExtras,
    contentTypeNames: site.contentTypeNames,
    model: site.llm.extractionModel,
    contextSize: site.llm.extractionContextSize,
    maxChars: site.llm.extractionMaxChars,
    cleanBody: site.cleanBody,
  };

  logInfo(`Config: ${configPath}`);
  logInfo(`Site:   ${site.siteUrl}`);
  logInfo(`Model:  ${site.llm.extractionModel}`);

  // Load Crawl4AI pages
  logInfo(`Loading crawl output from: ${PATHS.crawlOutput}`);
  let pages = loadCrawlPages();
  logInfo(`Found ${pages.length} crawled pages`);

  // Filter HTTP duplicates
  const beforeFilter = pages.length;
  pages = filterDuplicates(pages);
  const dupsRemoved = beforeFilter - pages.length;
  if (dupsRemoved > 0) {
    logInfo(`Filtered ${dupsRemoved} HTTP duplicates -> ${pages.length} unique pages`);
  }

  // Filter error pages (404, 503, etc.)
  const { valid: validPages, errorCount: errorPagesRemoved } = filterErrorPages(pages);
  if (errorPagesRemoved > 0) {
    logInfo(`Filtered ${errorPagesRemoved} error pages (404/503) -> ${validPages.length} valid pages`);
  }
  pages = validPages;

  // Classify each page using config-driven routing
  const classified = pages.map((page) => {
    const urlPath = page.url_path || new URL(page.url).pathname;
    const route = site.classifyPage(urlPath);
    const contentTypeHint = route?.contentType ?? null;
    return { page, urlPath, contentTypeHint };
  });

  let toProcess = classified;

  // Apply limit
  if (limit) {
    toProcess = toProcess.slice(0, limit);
    logInfo(`Limit: ${limit} pages`);
  }

  if (dryRun) {
    logInfo(`DRY RUN — would process ${toProcess.length} pages:`);
    for (const { urlPath, contentTypeHint } of toProcess) {
      const hint = contentTypeHint ? ` -> ${contentTypeHint}` : "";
      logInfo(`  [ollama${hint.padEnd(15)}] ${urlPath}`);
    }
    const hintedCount = toProcess.filter((p) => p.contentTypeHint).length;
    const autoCount = toProcess.filter((p) => !p.contentTypeHint).length;
    logInfo(`Auto-classify: ${autoCount}  |  Forced type: ${hintedCount}`);
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

  const usedPaths = new Set<string>();

  logInfo(`Extracting ${total} pages (concurrency: ${concurrency})...`);

  async function processOne(item: typeof toProcess[0]): Promise<void> {
    const { page, urlPath, contentTypeHint } = item;
    const idx = ++completed;
    const hintLabel = contentTypeHint ? `-> ${contentTypeHint}` : "auto";

    let eta = "";
    if (idx > 3) {
      const elapsedSoFar = Date.now() - startTime;
      const avgMs = elapsedSoFar / (idx - 1);
      const remainingMs = avgMs * (total - idx);
      eta = `  ETA ${formatDuration(remainingMs)}`;
    }
    logInfo(`[${idx}/${total}]${eta}  [${hintLabel}] ${urlPath}`);

    const extraction = await extractWithOllama(page.markdown, urlPath, contentTypeHint, extractionCtx);

    if (extraction) {
      // Post-process using site URL from config
      postProcessExtraction(extraction.data, urlPath, site.siteUrl);

      const contentType = (extraction.data.content_type as string) || "page";
      const sectionDir = site.outputDirs[contentType] || "sider";
      const rawSlug = (extraction.data.slug as string) || page.slug || path.basename(urlPath);
      let slug = path.basename(rawSlug);
      const outputDir = path.join(PATHS.content, sectionDir);
      fs.mkdirSync(outputDir, { recursive: true });

      // Detect slug collisions
      let outputPath = path.join(outputDir, `${slug}.md`);
      if (usedPaths.has(outputPath)) {
        slugCollisions++;
        const segments = urlPath.split("/").filter(Boolean);
        const prefix = segments.length >= 2 ? segments[segments.length - 2] : segments[0] || "dup";
        slug = `${prefix}--${slug}`;
        outputPath = path.join(outputDir, `${slug}.md`);
        let n = 2;
        while (usedPaths.has(outputPath)) {
          outputPath = path.join(outputDir, `${prefix}--${path.basename(rawSlug)}-${n}.md`);
          slug = `${prefix}--${path.basename(rawSlug)}-${n}`;
          n++;
        }
      }
      usedPaths.add(outputPath);
      extraction.data.slug = slug;

      // Clean body using config-driven cleanup, then write
      const markdown = extractionToMarkdown(extraction.data, site.cleanBody(page.markdown));
      fs.writeFileSync(outputPath, markdown, "utf-8");

      totalPromptTokens += extraction.promptTokens;
      totalCompletionTokens += extraction.completionTokens;

      const relOutputPath = path.relative(PATHS.projectRoot, outputPath);
      logSuccess(`${extraction.elapsed}ms -> ${relOutputPath}`);

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
      logError(`ERR003: Extraction failed for ${urlPath}`);
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

  // Process in batches
  for (let i = 0; i < toProcess.length; i += concurrency) {
    const batch = toProcess.slice(i, i + concurrency);
    await Promise.all(batch.map(processOne));
  }

  // Final stats
  const endTime = Date.now();
  const wallClockMs = endTime - startTime;
  const totalTokens = totalPromptTokens + totalCompletionTokens;
  const avgPerPage = successCount > 0 ? wallClockMs / successCount : 0;

  const logPath = path.join(PATHS.reports, "extraction-log.json");
  fs.writeFileSync(
    logPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        configPath,
        siteUrl: site.siteUrl,
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
  logSuccess("Extraction complete!");
  logInfo(`Success: ${successCount}/${total}`);
  if (failCount > 0) {
    logError(`Failed:  ${failCount}/${total}`);
  }
  if (slugCollisions > 0) {
    logWarning(`Slug collisions resolved: ${slugCollisions}`);
  }

  const startDate = new Date(startTime);
  const endDate = new Date(endTime);
  const timeFmt = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  logInfo(`Started:      ${timeFmt(startDate)}`);
  logInfo(`Finished:     ${timeFmt(endDate)}`);
  logInfo(`Wall clock:   ${formatDuration(wallClockMs)}`);
  logInfo(`Avg per page: ${(avgPerPage / 1000).toFixed(1)}s`);
  logInfo(`Prompt tokens:     ${formatNumber(totalPromptTokens)}`);
  logInfo(`Completion tokens: ${formatNumber(totalCompletionTokens)}`);
  logInfo(`Total tokens:      ${formatNumber(totalTokens)}`);
  logInfo(`Log:     ${logPath}`);
  logInfo(`Content: ${PATHS.content}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECT RUN GUARD
// ─────────────────────────────────────────────────────────────────────────────

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("orchestrator.ts") ||
   process.argv[1].endsWith("orchestrator.js"));

if (isDirectRun) {
  main().catch((err) => {
    logError(`Unexpected error: ${err}`);
    process.exit(1);
  });
}
