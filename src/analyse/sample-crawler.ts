/**
 * sample-crawler.ts
 *
 * Phase 1 of the analyse command: crawl a diverse sample of pages
 * from the target website using the Python Crawl4AI crawler.
 *
 * Invokes crawl/crawl_site.py with --limit N, then reads the
 * resulting JSON files from crawl-output/.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SamplePage {
  url: string;
  url_path: string;
  slug: string;
  markdown: string;
  markdown_length: number;
}

// ---------------------------------------------------------------------------
// Sample crawler
// ---------------------------------------------------------------------------

/**
 * Crawl a sample of pages from the given URL.
 *
 * Spawns the Python crawl_site.py script with --limit to get a breadth-first
 * sample, then reads the JSON output files.
 *
 * @param siteUrl - Base URL to crawl (e.g. "https://www.example.com")
 * @param sampleSize - Number of pages to sample
 * @param projectRoot - Path to project root directory
 * @returns Array of sample pages with markdown content
 */
export async function samplePages(
  siteUrl: string,
  sampleSize: number,
  projectRoot: string
): Promise<SamplePage[]> {
  const crawlScript = path.join(projectRoot, "crawl", "crawl_site.py");
  const crawlOutputDir = path.join(projectRoot, "crawl-output");

  // Check that crawl_site.py exists
  if (!fs.existsSync(crawlScript)) {
    throw new Error(
      `Crawl script not found: ${crawlScript}\n` +
        `Make sure the crawl/ directory exists with crawl_site.py`
    );
  }

  // Clean previous crawl output to avoid stale data
  if (fs.existsSync(crawlOutputDir)) {
    const existingFiles = fs.readdirSync(crawlOutputDir).filter((f) => f.endsWith(".json"));
    for (const file of existingFiles) {
      fs.unlinkSync(path.join(crawlOutputDir, file));
    }
    console.log(`  Cleaned ${existingFiles.length} existing crawl output files`);
  }

  // Run the Python crawler
  console.log(`  Crawling ${siteUrl} (sample: ${sampleSize} pages)...`);
  console.log(`  This may take a few minutes...\n`);

  try {
    execSync(`python3 "${crawlScript}" --url "${siteUrl}" --limit ${sampleSize}`, {
      cwd: projectRoot,
      stdio: "inherit",
      timeout: 300_000, // 5 minute timeout
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Crawl failed: ${msg}\nMake sure crawl4ai is installed: pip install -r crawl/requirements.txt`);
  }

  // Read crawl output
  return loadCrawlOutput(crawlOutputDir);
}

/**
 * Load crawl output JSON files from the given directory.
 */
export function loadCrawlOutput(crawlOutputDir: string): SamplePage[] {
  if (!fs.existsSync(crawlOutputDir)) {
    return [];
  }

  const files = fs.readdirSync(crawlOutputDir).filter((f) => f.endsWith(".json"));
  const pages: SamplePage[] = [];

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(crawlOutputDir, file), "utf-8"));
      if (raw.success && raw.markdown) {
        pages.push({
          url: raw.url,
          url_path: raw.url_path || new URL(raw.url).pathname,
          slug: raw.slug,
          markdown: raw.markdown,
          markdown_length: raw.markdown_length || raw.markdown.length,
        });
      }
    } catch {
      // Skip invalid files
    }
  }

  console.log(`  Loaded ${pages.length} pages from crawl output`);
  return pages;
}
