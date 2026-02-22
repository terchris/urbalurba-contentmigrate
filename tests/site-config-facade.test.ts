/**
 * site-config-facade.test.ts
 *
 * Integration test: verify the config-driven SiteConfigFacade produces
 * equivalent results to the hardcoded modules in lib/.
 *
 * This test loads the smartebyernorge reference config and checks:
 * - Schemas match hardcoded schemas (property names, types)
 * - Routing matches hardcoded classifyPage/SECTION_DIRS
 * - Prompts are loaded for every content type
 * - Cleanup removes the same boilerplate as hardcoded cleanBody
 * - Output dirs match hardcoded SECTION_DIRS
 */

import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";

import { loadSiteConfig, createSiteConfigFacade } from "../src/config/index.js";

// Hardcoded modules for comparison
import { SECTION_DIRS, ARCHETYPES } from "../lib/config.js";
import { SCHEMAS, REQUIRED_FIELDS } from "../lib/schemas.js";
import { cleanBody as hardcodedCleanBody } from "../lib/clean-body.js";

const REFERENCE_CONFIG_PATH = resolve(
  import.meta.dirname ?? ".",
  "../site-config.smartebyernorge.yaml"
);

// ---------------------------------------------------------------------------
// Facade creation
// ---------------------------------------------------------------------------

describe("createSiteConfigFacade", () => {
  it("creates a facade from the reference config", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const site = createSiteConfigFacade(config);

    expect(site).toBeDefined();
    expect(site.siteUrl).toBe("https://www.smartebyernorge.no");
    expect(site.siteName).toBe("Smarte Byer Norge");
  });

  it("exposes all content type names", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const site = createSiteConfigFacade(config);

    expect(site.contentTypeNames).toHaveLength(9);
    for (const archetype of ARCHETYPES) {
      expect(site.contentTypeNames).toContain(archetype);
    }
  });

  it("exposes LLM settings", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const site = createSiteConfigFacade(config);

    expect(site.llm.extractionModel).toBe("gemma3:4b");
    expect(site.llm.analysisModel).toBe("claude-sonnet-4-20250514");
    expect(site.llm.extractionContextSize).toBe(8192);
    expect(site.llm.extractionMaxChars).toBe(4000);
  });
});

// ---------------------------------------------------------------------------
// Schema equivalence
// ---------------------------------------------------------------------------

describe("facade schemas match hardcoded SCHEMAS", () => {
  it("all 9 content types have schemas", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const site = createSiteConfigFacade(config);

    for (const archetype of ARCHETYPES) {
      expect(site.schemas).toHaveProperty(archetype);
    }
  });

  it("each schema has the same properties as hardcoded", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const site = createSiteConfigFacade(config);

    for (const archetype of ARCHETYPES) {
      const genJson = zodToJsonSchema(site.schemas[archetype]) as any;
      const hcJson = zodToJsonSchema(SCHEMAS[archetype]) as any;

      const genProps = Object.keys(genJson.properties).sort();
      const hcProps = Object.keys(hcJson.properties).sort();

      expect(genProps).toEqual(hcProps);
    }
  });
});

// ---------------------------------------------------------------------------
// Output directory equivalence
// ---------------------------------------------------------------------------

describe("facade outputDirs match hardcoded SECTION_DIRS", () => {
  it("produces identical mapping", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const site = createSiteConfigFacade(config);

    for (const [contentType, outputDir] of Object.entries(SECTION_DIRS)) {
      expect(site.outputDirs[contentType]).toBe(outputDir);
    }
  });
});

// ---------------------------------------------------------------------------
// Routing — classifyPage
// ---------------------------------------------------------------------------

describe("facade classifyPage routing", () => {
  const testCases: Array<{ path: string; expected: string }> = [
    { path: "/blogg/test-post", expected: "blog" },
    { path: "/nyheter/ny-rapport", expected: "news" },
    { path: "/english-news/smart-cities", expected: "english_news" },
    { path: "/arendalsuka-blog/debatt-2024", expected: "event" },
    { path: "/arendalsuka", expected: "conference" },
    { path: "/evolve2021", expected: "conference" },
    { path: "/person/ola-nordmann", expected: "person" },
    { path: "/tech/smart-sensor", expected: "tech" },
    { path: "/press/media-coverage", expected: "press" },
    { path: "/", expected: "page" },
  ];

  it.each(testCases)(
    "classifies $path as $expected",
    async ({ path, expected }) => {
      const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
      const site = createSiteConfigFacade(config);

      const result = site.classifyPage(path);
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe(expected);
    }
  );
});

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

describe("facade prompts", () => {
  it("has a prompt for every content type", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const site = createSiteConfigFacade(config);

    for (const archetype of ARCHETYPES) {
      const prompt = site.getPrompt(archetype);
      expect(prompt.length).toBeGreaterThan(10);
    }
  });

  it("throws for unknown content type", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const site = createSiteConfigFacade(config);

    expect(() => site.getPrompt("nonexistent")).toThrow(
      /No extraction prompt found/
    );
  });
});

// ---------------------------------------------------------------------------
// Cleanup — compare to hardcoded cleanBody
// ---------------------------------------------------------------------------

describe("facade cleanBody vs hardcoded cleanBody", () => {
  // Sample Squarespace boilerplate that both cleaners should remove
  const BOILERPLATE_SAMPLE = `# [![Smarte Byer Norge](https://images.squarespace-cdn.com/logo.png)](/)

[Hjem](/)
[Arrangement](/arrangement)
[Om oss](/om-oss)

Testartikkel — Smarte Byer Norge

## Testartikkel

Innholdet i artikkelen starter her. Dette er den ekte teksten.

### MELD DEG PÅ VÅRT NYHETSBREV

Email Address

SEND
Takk! Vi har sendt deg en e-post.

Vi arbeider etter Vær Varsom-plakatens regler for god presseskikk.

Smarte Byer Norge, c/o Næringsforeningen, Postboks 250, 4066 Stavanger

[ ](https://www.facebook.com/smartebyernorge) [ ](https://www.linkedin.com/company/smartebyernorge)`;

  it("removes the same boilerplate patterns", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const site = createSiteConfigFacade(config);

    const configCleaned = site.cleanBody(BOILERPLATE_SAMPLE);
    const hardcodedCleaned = hardcodedCleanBody(BOILERPLATE_SAMPLE);

    // Both should preserve the article content
    expect(configCleaned).toContain("Testartikkel");
    expect(configCleaned).toContain("Innholdet i artikkelen starter her");

    // Both should remove boilerplate
    expect(configCleaned).not.toContain("MELD DEG PÅ");
    expect(configCleaned).not.toContain("Vær Varsom");
    expect(configCleaned).not.toContain("facebook.com");

    // The hardcoded version also removes these
    expect(hardcodedCleaned).not.toContain("MELD DEG PÅ");
    expect(hardcodedCleaned).not.toContain("Vær Varsom");
    expect(hardcodedCleaned).not.toContain("facebook.com");
  });

  it("both preserve pure article content unchanged", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const site = createSiteConfigFacade(config);

    const pureContent =
      "## Smarte byer\n\nNorge satser på smarte byer for fremtiden.";

    const configCleaned = site.cleanBody(pureContent);
    const hardcodedCleaned = hardcodedCleanBody(pureContent);

    expect(configCleaned).toBe(pureContent);
    expect(hardcodedCleaned).toBe(pureContent);
  });
});

// ---------------------------------------------------------------------------
// Crawl skip patterns
// ---------------------------------------------------------------------------

describe("facade crawlSkipPatterns", () => {
  it("has skip patterns loaded", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const site = createSiteConfigFacade(config);

    expect(site.crawlSkipPatterns.length).toBeGreaterThan(0);
    // Should include common patterns
    expect(site.crawlSkipPatterns.some((p) => p.includes("\\?"))).toBe(true);
    expect(site.crawlSkipPatterns.some((p) => p.includes("/category/"))).toBe(
      true
    );
  });
});
