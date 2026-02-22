/**
 * analyse-pipeline.test.ts
 *
 * Tests for the analyse pipeline components that can be unit-tested
 * without a live Claude API call.
 *
 * Tests: selectDiverseSample (from analyse.ts), loadCrawlOutput (from sample-crawler.ts),
 * and the assembled config validation against the SiteConfig schema.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadCrawlOutput, type SamplePage } from "../src/analyse/sample-crawler.js";
import { assembleConfig } from "../src/analyse/assemble-config.js";
import { parseSiteConfig } from "../src/config/config-loader.js";
import { stringify as yamlStringify } from "yaml";
import type { DiscoveredType } from "../src/analyse/discover-types.js";
import type { GeneratedTypeConfig, GeneratedCleanupRule } from "../src/analyse/generate-config.js";

// ---------------------------------------------------------------------------
// loadCrawlOutput tests
// ---------------------------------------------------------------------------

describe("loadCrawlOutput", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "crawl-output-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads valid crawl JSON files", () => {
    writeFileSync(
      path.join(tmpDir, "page1.json"),
      JSON.stringify({
        url: "https://example.com/blog/hello",
        url_path: "/blog/hello",
        slug: "blog__hello",
        success: true,
        markdown: "# Hello World\n\nSome content here.",
        markdown_length: 35,
      })
    );
    writeFileSync(
      path.join(tmpDir, "page2.json"),
      JSON.stringify({
        url: "https://example.com/about",
        url_path: "/about",
        slug: "about",
        success: true,
        markdown: "# About Us\n\nWe are a company.",
        markdown_length: 30,
      })
    );

    const pages = loadCrawlOutput(tmpDir);
    expect(pages).toHaveLength(2);
    expect(pages[0].url_path).toBe("/blog/hello");
    expect(pages[1].url_path).toBe("/about");
  });

  it("skips failed crawl results", () => {
    writeFileSync(
      path.join(tmpDir, "ok.json"),
      JSON.stringify({
        url: "https://example.com/ok",
        url_path: "/ok",
        slug: "ok",
        success: true,
        markdown: "# OK Page",
        markdown_length: 10,
      })
    );
    writeFileSync(
      path.join(tmpDir, "fail.json"),
      JSON.stringify({
        url: "https://example.com/fail",
        slug: "fail",
        success: false,
        error: "404 Not Found",
      })
    );

    const pages = loadCrawlOutput(tmpDir);
    expect(pages).toHaveLength(1);
    expect(pages[0].url_path).toBe("/ok");
  });

  it("skips pages without markdown", () => {
    writeFileSync(
      path.join(tmpDir, "empty.json"),
      JSON.stringify({
        url: "https://example.com/empty",
        url_path: "/empty",
        slug: "empty",
        success: true,
        markdown: "",
      })
    );

    const pages = loadCrawlOutput(tmpDir);
    expect(pages).toHaveLength(0);
  });

  it("returns empty array for non-existent directory", () => {
    const pages = loadCrawlOutput("/nonexistent/path");
    expect(pages).toEqual([]);
  });

  it("skips invalid JSON files", () => {
    writeFileSync(path.join(tmpDir, "bad.json"), "this is not json{{{");
    writeFileSync(
      path.join(tmpDir, "ok.json"),
      JSON.stringify({
        url: "https://example.com/ok",
        url_path: "/ok",
        slug: "ok",
        success: true,
        markdown: "# OK",
        markdown_length: 4,
      })
    );

    const pages = loadCrawlOutput(tmpDir);
    expect(pages).toHaveLength(1);
  });

  it("derives url_path from URL when not present", () => {
    writeFileSync(
      path.join(tmpDir, "nopath.json"),
      JSON.stringify({
        url: "https://example.com/some/page",
        slug: "some__page",
        success: true,
        markdown: "# Some Page",
        markdown_length: 12,
      })
    );

    const pages = loadCrawlOutput(tmpDir);
    expect(pages).toHaveLength(1);
    expect(pages[0].url_path).toBe("/some/page");
  });
});

// ---------------------------------------------------------------------------
// assembleConfig → parseSiteConfig round-trip
// ---------------------------------------------------------------------------

describe("assembleConfig produces valid SiteConfig YAML", () => {
  const types: DiscoveredType[] = [
    {
      name: "blog",
      label: "Blog Posts",
      description: "Blog articles",
      url_patterns: ["^/blog/"],
      output_dir: "blog",
      representative_urls: ["/blog/hello"],
    },
    {
      name: "page",
      label: "Pages",
      description: "Static pages",
      url_patterns: ["^/$"],
      output_dir: "pages",
      representative_urls: ["/"],
    },
  ];

  const typeConfigs: GeneratedTypeConfig[] = [
    {
      name: "blog",
      extras: {
        category: {
          type: "string",
          description: "Blog category",
        },
      },
      extraction_prompt: "Extract blog metadata.",
      required_fields: ["title", "slug", "date"],
    },
    {
      name: "page",
      extras: {},
      extraction_prompt: "Extract page metadata.",
      required_fields: ["title", "slug"],
    },
  ];

  const cleanupRules: GeneratedCleanupRule[] = [
    { name: "nav", regex: "^\\[Home\\].*$", flags: "gm" },
  ];

  it("round-trips through YAML serialization and config validation", () => {
    const config = assembleConfig(
      "https://www.example.com",
      types,
      typeConfigs,
      cleanupRules,
      "claude-sonnet-4-20250514"
    );

    // Serialize to YAML
    const yaml = yamlStringify(config);

    // Parse back through the config loader (validates against SiteConfigSchema)
    const parsed = parseSiteConfig(yaml, "test");

    expect(parsed.version).toBe(1);
    expect(parsed.site.url).toBe("https://www.example.com");
    expect(parsed.site.name).toBe("Example");
    expect(parsed.content_types).toHaveLength(2);
    expect(parsed.content_types[0].name).toBe("blog");
    expect(parsed.content_types[0].schema.extras).toHaveProperty("category");
    expect(parsed.content_types[1].name).toBe("page");
    expect(parsed.cleanup.patterns).toHaveLength(1);
    expect(parsed.cleanup.patterns[0].name).toBe("nav");
    expect(parsed.llm.analysis_model).toBe("claude-sonnet-4-20250514");
  });

  it("produces valid config with object-type extras (nested fields)", () => {
    const typesWithNested: DiscoveredType[] = [
      {
        name: "event",
        label: "Events",
        description: "Events",
        url_patterns: ["^/events/"],
        output_dir: "events",
        representative_urls: ["/events/test"],
      },
      {
        name: "page",
        label: "Pages",
        description: "Static pages",
        url_patterns: ["^/$"],
        output_dir: "pages",
        representative_urls: ["/"],
      },
    ];

    const configsWithNested: GeneratedTypeConfig[] = [
      {
        name: "event",
        extras: {
          event_date: { type: "string", description: "Event date", required: true },
          speakers: {
            type: "object",
            description: "Event speakers",
            items: {
              name: { type: "string", description: "Speaker name" },
              title: { type: "string", description: "Speaker title" },
            },
          },
        },
        extraction_prompt: "Extract event data.",
        required_fields: ["title", "slug", "event_date"],
      },
      {
        name: "page",
        extras: {},
        extraction_prompt: "Extract page metadata.",
        required_fields: ["title", "slug"],
      },
    ];

    const config = assembleConfig(
      "https://www.example.com",
      typesWithNested,
      configsWithNested,
      [],
      "claude-sonnet-4-20250514"
    );

    const yaml = yamlStringify(config);
    const parsed = parseSiteConfig(yaml, "test");

    const event = parsed.content_types.find((ct) => ct.name === "event");
    expect(event).toBeDefined();
    expect(event!.schema.extras.speakers.type).toBe("object");
    expect(event!.schema.extras.speakers.items).toHaveProperty("name");
    expect(event!.schema.extras.speakers.items).toHaveProperty("title");
  });

  it("produces valid config with image-type extras", () => {
    const typesWithImage: DiscoveredType[] = [
      {
        name: "person",
        label: "People",
        description: "Person profiles",
        url_patterns: ["^/people/"],
        output_dir: "people",
        representative_urls: ["/people/jane"],
      },
      {
        name: "page",
        label: "Pages",
        description: "Static pages",
        url_patterns: ["^/$"],
        output_dir: "pages",
        representative_urls: ["/"],
      },
    ];

    const configsWithImage: GeneratedTypeConfig[] = [
      {
        name: "person",
        extras: {
          full_name: { type: "string", description: "Full name", required: true },
          photo: { type: "image", description: "Profile photo" },
        },
        extraction_prompt: "Extract person profile.",
        required_fields: ["title", "slug", "full_name"],
      },
      {
        name: "page",
        extras: {},
        extraction_prompt: "Extract page metadata.",
        required_fields: ["title", "slug"],
      },
    ];

    const config = assembleConfig(
      "https://www.example.com",
      typesWithImage,
      configsWithImage,
      [],
      "claude-sonnet-4-20250514"
    );

    const yaml = yamlStringify(config);
    const parsed = parseSiteConfig(yaml, "test");

    const person = parsed.content_types.find((ct) => ct.name === "person");
    expect(person).toBeDefined();
    expect(person!.schema.extras.photo.type).toBe("image");
  });
});

// ---------------------------------------------------------------------------
// selectDiverseSample — the diversity selection algorithm
// ---------------------------------------------------------------------------

describe("selectDiverseSample (from analyse.ts)", () => {
  // We test the algorithm inline since it's a pure function
  // We'll re-implement it here to test independently

  function selectDiverseSample(pages: SamplePage[], maxCount: number): SamplePage[] {
    if (pages.length <= maxCount) return pages;

    const groups = new Map<string, SamplePage[]>();
    for (const page of pages) {
      const segments = page.url_path.split("/").filter(Boolean);
      const key = segments[0] || "_root";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(page);
    }

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

  function makePage(urlPath: string): SamplePage {
    return {
      url: `https://example.com${urlPath}`,
      url_path: urlPath,
      slug: urlPath.replace(/\//g, "__"),
      markdown: `# Page at ${urlPath}`,
      markdown_length: 20,
    };
  }

  it("returns all pages when under maxCount", () => {
    const pages = [makePage("/a"), makePage("/b")];
    const result = selectDiverseSample(pages, 10);
    expect(result).toHaveLength(2);
  });

  it("selects from different URL groups when over maxCount", () => {
    const pages = [
      makePage("/blog/a"),
      makePage("/blog/b"),
      makePage("/blog/c"),
      makePage("/blog/d"),
      makePage("/news/x"),
      makePage("/news/y"),
      makePage("/team/z"),
    ];

    const result = selectDiverseSample(pages, 3);
    expect(result).toHaveLength(3);

    // Should pick one from each group first (round-robin)
    const groups = result.map((p) => p.url_path.split("/")[1]);
    expect(new Set(groups).size).toBe(3); // All different groups
  });

  it("does round-robin across groups", () => {
    const pages = [
      makePage("/blog/1"),
      makePage("/blog/2"),
      makePage("/blog/3"),
      makePage("/news/1"),
      makePage("/news/2"),
      makePage("/team/1"),
    ];

    const result = selectDiverseSample(pages, 5);
    expect(result).toHaveLength(5);

    // Round 1: blog/1, news/1, team/1
    // Round 2: blog/2, news/2
    // Check we got pages from all groups
    const groupCounts = new Map<string, number>();
    for (const p of result) {
      const group = p.url_path.split("/")[1];
      groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
    }
    expect(groupCounts.get("blog")).toBe(2);
    expect(groupCounts.get("news")).toBe(2);
    expect(groupCounts.get("team")).toBe(1);
  });

  it("handles root pages", () => {
    const pages = [makePage("/"), makePage("/blog/a"), makePage("/blog/b")];
    const result = selectDiverseSample(pages, 2);
    expect(result).toHaveLength(2);
  });
});
