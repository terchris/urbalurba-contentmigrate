/**
 * classify-pages.ts
 *
 * Reads the filtered page manifest and produces a detailed classification
 * report showing which pages go to which tier and their detected archetype.
 *
 * Usage: npm run classify
 */

import fs from "node:fs";
import path from "node:path";
import { PATHS, classifyPage, type Archetype } from "../lib/config.js";

// ---------------------------------------------------------------------------
// Archetype detection from URL path
// ---------------------------------------------------------------------------

function detectArchetype(urlPath: string): Archetype {
  if (urlPath === "/") return "page";
  if (urlPath.startsWith("/blogg/")) return "blog";
  if (urlPath.startsWith("/nyheter/")) return "news";
  if (urlPath.startsWith("/english-news/")) return "english_news";
  if (urlPath.startsWith("/arendalsuka-blog/")) return "event";
  if (urlPath === "/arendalsuka" || urlPath === "/evolve2021") return "conference";
  if (urlPath.startsWith("/evolve2021content/")) {
    // Sub-pages can be persons, events, or other content
    if (urlPath.includes("/person/")) return "person";
    return "event";
  }
  if (urlPath.startsWith("/person/") || urlPath.startsWith("/people/") || urlPath.startsWith("/ressurspersoner/")) return "person";
  if (urlPath.startsWith("/tech/") || urlPath.startsWith("/concept/") || urlPath.startsWith("/product/") || urlPath.startsWith("/tjeneste/")) return "tech";
  if (urlPath.startsWith("/press/")) return "press";

  // Default: static/institutional page
  return "page";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log("=".repeat(60));
  console.log("  Classify pages by archetype and extraction tier");
  console.log("=".repeat(60));

  const manifestPath = path.join(PATHS.reports, "filtered-pages.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`\n❌ Filtered pages manifest not found.`);
    console.error(`   Run: npm run filter`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const pages: { filePath: string; urlPath: string; tier: string }[] = manifest.pages;

  // Classify each page
  const classified = pages.map((page) => ({
    ...page,
    archetype: detectArchetype(page.urlPath),
    tier: classifyPage(page.urlPath).tier,
  }));

  // Group by archetype
  const byArchetype: Record<string, typeof classified> = {};
  for (const page of classified) {
    if (!byArchetype[page.archetype]) byArchetype[page.archetype] = [];
    byArchetype[page.archetype].push(page);
  }

  // Print summary
  console.log(`\n📊 Classification by archetype:\n`);
  for (const [archetype, pages] of Object.entries(byArchetype).sort()) {
    const ollamaCount = pages.filter((p) => p.tier === "ollama").length;
    const claudeCount = pages.filter((p) => p.tier === "claude").length;
    const tierInfo =
      claudeCount > 0
        ? ` (${ollamaCount} Ollama, ${claudeCount} Claude)`
        : "";
    console.log(`  ${archetype.padEnd(15)} ${String(pages.length).padStart(4)} pages${tierInfo}`);
  }

  console.log(`\n  ${"─".repeat(40)}`);
  console.log(`  ${"TOTAL".padEnd(15)} ${String(classified.length).padStart(4)} pages`);

  // Write detailed classification report
  const reportPath = path.join(PATHS.reports, "classification.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        summary: Object.fromEntries(
          Object.entries(byArchetype).map(([k, v]) => [k, v.length])
        ),
        pages: classified,
      },
      null,
      2
    )
  );

  console.log(`\n📄 Classification report: ${reportPath}`);
  console.log();
}

main();
