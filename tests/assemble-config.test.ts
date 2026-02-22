/**
 * assemble-config.test.ts
 *
 * Tests for the config assembly logic — the final stage of the analyse
 * pipeline that combines discovered types + generated schemas + cleanup
 * rules into a complete site-config.yaml structure.
 */

import { describe, it, expect } from "vitest";
import { assembleConfig } from "../src/analyse/assemble-config.js";
import type { DiscoveredType } from "../src/analyse/discover-types.js";
import type { GeneratedTypeConfig, GeneratedCleanupRule } from "../src/analyse/generate-config.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SAMPLE_TYPES: DiscoveredType[] = [
  {
    name: "blog",
    label: "Blog Posts",
    description: "Blog articles",
    url_patterns: ["^/blog/"],
    output_dir: "blog",
    representative_urls: ["/blog/my-first-post", "/blog/second-post"],
  },
  {
    name: "team",
    label: "Team Members",
    description: "Staff profiles",
    url_patterns: ["^/team/", "^/people/"],
    output_dir: "team",
    representative_urls: ["/team/john-doe"],
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

const SAMPLE_TYPE_CONFIGS: GeneratedTypeConfig[] = [
  {
    name: "blog",
    extras: {},
    extraction_prompt: "Extract blog post metadata. Language: English.",
    required_fields: ["title", "slug", "date"],
  },
  {
    name: "team",
    extras: {
      full_name: {
        type: "string",
        description: "Full name of the team member",
        required: true,
      },
      job_title: {
        type: "string",
        description: "Job title",
      },
      photo: {
        type: "image",
        description: "Profile photo",
      },
    },
    extraction_prompt: "Extract team member profiles. Look for name, title, and photo.",
    required_fields: ["title", "slug", "full_name"],
  },
  {
    name: "page",
    extras: {},
    extraction_prompt: "Extract page metadata.",
    required_fields: ["title", "slug"],
  },
];

const SAMPLE_CLEANUP_RULES: GeneratedCleanupRule[] = [
  { name: "nav_menu", regex: "^\\s*\\[Home\\].*$", flags: "gm" },
  { name: "footer", regex: "^\\s*\\u00a9 2024.*$", flags: "gm" },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("assembleConfig", () => {
  it("produces a complete config with version, site, content_types, cleanup, llm", () => {
    const config = assembleConfig(
      "https://www.example.com",
      SAMPLE_TYPES,
      SAMPLE_TYPE_CONFIGS,
      SAMPLE_CLEANUP_RULES,
      "claude-sonnet-4-20250514"
    );

    expect(config.version).toBe(1);
    expect(config.site.url).toBe("https://www.example.com");
    expect(config.site.name).toBe("Example");
    expect(config.content_types).toHaveLength(3);
    expect(config.cleanup.patterns).toHaveLength(2);
    expect(config.llm.analysis_model).toBe("claude-sonnet-4-20250514");
    expect(config.llm.extraction_model).toBe("gemma3:4b");
    expect(config.llm.extraction_context_size).toBe(8192);
    expect(config.llm.extraction_max_chars).toBe(4000);
  });

  it("includes default crawl skip patterns", () => {
    const config = assembleConfig(
      "https://www.example.com",
      SAMPLE_TYPES,
      SAMPLE_TYPE_CONFIGS,
      [],
      "claude-sonnet-4-20250514"
    );

    expect(config.crawl.skip_patterns.length).toBeGreaterThan(0);
    expect(config.crawl.skip_patterns).toContain("\\?");
    expect(config.crawl.skip_patterns).toContain("/cart");
  });

  it("maps content types correctly with schema extras", () => {
    const config = assembleConfig(
      "https://www.example.com",
      SAMPLE_TYPES,
      SAMPLE_TYPE_CONFIGS,
      [],
      "claude-sonnet-4-20250514"
    );

    const blog = config.content_types.find((ct) => ct.name === "blog");
    expect(blog).toBeDefined();
    expect(blog!.url_patterns).toEqual(["^/blog/"]);
    expect(blog!.output_dir).toBe("blog");
    expect(blog!.schema.base).toBe(true);
    expect(Object.keys(blog!.schema.extras)).toHaveLength(0);
    expect(blog!.required_fields).toEqual(["title", "slug", "date"]);

    const team = config.content_types.find((ct) => ct.name === "team");
    expect(team).toBeDefined();
    expect(team!.url_patterns).toEqual(["^/team/", "^/people/"]);
    expect(team!.schema.extras).toHaveProperty("full_name");
    expect(team!.schema.extras).toHaveProperty("job_title");
    expect(team!.schema.extras).toHaveProperty("photo");
    expect(team!.schema.extras.photo.type).toBe("image");
  });

  it("uses extraction prompt from generated config", () => {
    const config = assembleConfig(
      "https://www.example.com",
      SAMPLE_TYPES,
      SAMPLE_TYPE_CONFIGS,
      [],
      "claude-sonnet-4-20250514"
    );

    const blog = config.content_types.find((ct) => ct.name === "blog");
    expect(blog!.extraction_prompt).toBe("Extract blog post metadata. Language: English.");
  });

  it("falls back to default prompt when config is missing", () => {
    // Only provide config for "blog", not "team" or "page"
    const partialConfigs: GeneratedTypeConfig[] = [SAMPLE_TYPE_CONFIGS[0]];
    const config = assembleConfig(
      "https://www.example.com",
      SAMPLE_TYPES,
      partialConfigs,
      [],
      "claude-sonnet-4-20250514"
    );

    const team = config.content_types.find((ct) => ct.name === "team");
    expect(team!.extraction_prompt).toContain("Example");
    expect(team!.extraction_prompt).toContain("team members");
    expect(team!.required_fields).toEqual(["title", "slug"]);
  });

  it("derives site name from URL correctly", () => {
    // Test various URL formats
    const tests = [
      { url: "https://www.example.com", expected: "Example" },
      { url: "https://www.my-site.org", expected: "My Site" },
      { url: "https://docs.example.com", expected: "Docs" },
    ];

    for (const { url, expected } of tests) {
      const config = assembleConfig(url, SAMPLE_TYPES, SAMPLE_TYPE_CONFIGS, [], "claude-sonnet-4-20250514");
      expect(config.site.name).toBe(expected);
    }
  });

  it("includes cleanup rules in config", () => {
    const config = assembleConfig(
      "https://www.example.com",
      SAMPLE_TYPES,
      SAMPLE_TYPE_CONFIGS,
      SAMPLE_CLEANUP_RULES,
      "claude-sonnet-4-20250514"
    );

    expect(config.cleanup.patterns).toHaveLength(2);
    expect(config.cleanup.patterns[0].name).toBe("nav_menu");
    expect(config.cleanup.patterns[1].name).toBe("footer");
  });

  it("handles empty cleanup rules", () => {
    const config = assembleConfig(
      "https://www.example.com",
      SAMPLE_TYPES,
      SAMPLE_TYPE_CONFIGS,
      [],
      "claude-sonnet-4-20250514"
    );

    expect(config.cleanup.patterns).toEqual([]);
  });

  it("all content types have base: true", () => {
    const config = assembleConfig(
      "https://www.example.com",
      SAMPLE_TYPES,
      SAMPLE_TYPE_CONFIGS,
      [],
      "claude-sonnet-4-20250514"
    );

    for (const ct of config.content_types) {
      expect(ct.schema.base).toBe(true);
    }
  });
});
