import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  loadSiteConfig,
  parseSiteConfig,
  ConfigFileError,
  ConfigParseError,
  ConfigValidationError,
} from "../src/config/config-loader.js";
import type { SiteConfig } from "../src/config/site-config.schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid YAML config for tests */
const MINIMAL_VALID_YAML = `
version: 1
site:
  url: https://example.com
  name: Test Site
content_types:
  - name: blog
    url_patterns:
      - "^/blog/"
    output_dir: blog
    schema:
      base: true
      extras: {}
    extraction_prompt: "Extract blog metadata."
    required_fields:
      - title
`;

// Path to the reference config
const REFERENCE_CONFIG_PATH = resolve(
  import.meta.dirname ?? ".",
  "../site-config.smartebyernorge.yaml"
);

// ---------------------------------------------------------------------------
// parseSiteConfig — in-memory YAML parsing
// ---------------------------------------------------------------------------

describe("parseSiteConfig", () => {
  it("parses a minimal valid config", () => {
    const config = parseSiteConfig(MINIMAL_VALID_YAML);

    expect(config.version).toBe(1);
    expect(config.site.url).toBe("https://example.com");
    expect(config.site.name).toBe("Test Site");
    expect(config.content_types).toHaveLength(1);
    expect(config.content_types[0].name).toBe("blog");
  });

  it("applies defaults for optional sections", () => {
    const config = parseSiteConfig(MINIMAL_VALID_YAML);

    // crawl, cleanup, and llm should have defaults
    expect(config.crawl.skip_patterns).toEqual([]);
    expect(config.cleanup.patterns).toEqual([]);
    expect(config.llm.extraction_model).toBe("gemma3:4b");
    expect(config.llm.extraction_context_size).toBe(8192);
    expect(config.llm.extraction_max_chars).toBe(4000);
    expect(config.llm.analysis_model).toBe("claude-sonnet-4-20250514");
  });

  it("preserves explicit LLM settings", () => {
    const yaml = `
version: 1
site:
  url: https://example.com
  name: Custom LLM Site
content_types:
  - name: page
    url_patterns: ["^/$"]
    output_dir: pages
    schema:
      base: true
    extraction_prompt: "Extract page metadata."
llm:
  extraction_model: llama3:8b
  extraction_context_size: 16384
  extraction_max_chars: 8000
`;
    const config = parseSiteConfig(yaml);

    expect(config.llm.extraction_model).toBe("llama3:8b");
    expect(config.llm.extraction_context_size).toBe(16384);
    expect(config.llm.extraction_max_chars).toBe(8000);
  });

  // ---- Error cases ----

  it("throws ConfigParseError for invalid YAML syntax", () => {
    const badYaml = `
version: 1
site:
  url: https://example.com
  name: Bad Site
  invalid_indent:
    - this: is
  - broken: yaml
`;
    expect(() => parseSiteConfig(badYaml)).toThrow(ConfigParseError);
  });

  it("throws ConfigValidationError when version is missing", () => {
    const noVersion = `
site:
  url: https://example.com
  name: No Version
content_types:
  - name: blog
    url_patterns: ["^/blog/"]
    output_dir: blog
    schema:
      base: true
    extraction_prompt: "Extract."
`;
    expect(() => parseSiteConfig(noVersion)).toThrow(ConfigValidationError);
  });

  it("throws ConfigValidationError when site URL is invalid", () => {
    const badUrl = `
version: 1
site:
  url: not-a-url
  name: Bad URL Site
content_types:
  - name: blog
    url_patterns: ["^/blog/"]
    output_dir: blog
    schema:
      base: true
    extraction_prompt: "Extract."
`;
    expect(() => parseSiteConfig(badUrl)).toThrow(ConfigValidationError);
  });

  it("throws ConfigValidationError when content_types is empty", () => {
    const noTypes = `
version: 1
site:
  url: https://example.com
  name: Empty Types
content_types: []
`;
    expect(() => parseSiteConfig(noTypes)).toThrow(ConfigValidationError);
  });

  it("throws ConfigValidationError when content type is missing url_patterns", () => {
    const missingPatterns = `
version: 1
site:
  url: https://example.com
  name: Missing Patterns
content_types:
  - name: blog
    output_dir: blog
    schema:
      base: true
    extraction_prompt: "Extract."
`;
    expect(() => parseSiteConfig(missingPatterns)).toThrow(
      ConfigValidationError
    );
  });

  it("throws ConfigValidationError when content type is missing extraction_prompt", () => {
    const missingPrompt = `
version: 1
site:
  url: https://example.com
  name: Missing Prompt
content_types:
  - name: blog
    url_patterns: ["^/blog/"]
    output_dir: blog
    schema:
      base: true
`;
    expect(() => parseSiteConfig(missingPrompt)).toThrow(
      ConfigValidationError
    );
  });

  it("includes field paths in validation error messages", () => {
    const badConfig = `
version: 1
site:
  url: not-a-url
  name: Bad
content_types: []
`;
    try {
      parseSiteConfig(badConfig, "test.yaml");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      const validationErr = err as ConfigValidationError;
      expect(validationErr.message).toContain("test.yaml");
      expect(validationErr.issues.length).toBeGreaterThan(0);
    }
  });

  it("handles content types with extras (nested object fields)", () => {
    const withExtras = `
version: 1
site:
  url: https://example.com
  name: Extras Test
content_types:
  - name: event
    url_patterns: ["^/events/"]
    output_dir: events
    schema:
      base: true
      extras:
        event_date:
          type: string
          description: "Event date YYYY-MM-DD"
          required: true
        panelists:
          type: object
          description: "Panel participants"
          items:
            name:
              type: string
              description: "Full name"
            organization:
              type: string
              description: "Organization"
    extraction_prompt: "Extract event metadata."
    required_fields:
      - title
      - event_date
`;
    const config = parseSiteConfig(withExtras);
    const event = config.content_types[0];

    expect(event.schema.extras).toBeDefined();
    expect(event.schema.extras!["event_date"]).toBeDefined();
    expect(event.schema.extras!["event_date"].type).toBe("string");
    expect(event.schema.extras!["event_date"].required).toBe(true);

    expect(event.schema.extras!["panelists"]).toBeDefined();
    expect(event.schema.extras!["panelists"].type).toBe("object");
    expect(event.schema.extras!["panelists"].items).toBeDefined();
    expect(event.schema.extras!["panelists"].items!["name"].type).toBe(
      "string"
    );
  });

  it("handles cleanup rules", () => {
    const withCleanup = `
version: 1
site:
  url: https://example.com
  name: Cleanup Test
content_types:
  - name: page
    url_patterns: ["^/$"]
    output_dir: pages
    schema:
      base: true
    extraction_prompt: "Extract."
cleanup:
  patterns:
    - name: nav_links
      regex: "^\\\\s*\\\\[Hjem\\\\].*$"
      flags: gm
    - name: footer
      regex: "^Footer text.*$"
`;
    const config = parseSiteConfig(withCleanup);

    expect(config.cleanup.patterns).toHaveLength(2);
    expect(config.cleanup.patterns[0].name).toBe("nav_links");
    expect(config.cleanup.patterns[0].flags).toBe("gm");
    expect(config.cleanup.patterns[1].name).toBe("footer");
    // Default flags
    expect(config.cleanup.patterns[1].flags).toBe("gm");
  });

  it("handles crawl skip patterns", () => {
    const withCrawl = `
version: 1
site:
  url: https://example.com
  name: Crawl Test
crawl:
  skip_patterns:
    - "\\\\?"
    - "/category/"
    - "\\\\.pdf$"
content_types:
  - name: page
    url_patterns: ["^/$"]
    output_dir: pages
    schema:
      base: true
    extraction_prompt: "Extract."
`;
    const config = parseSiteConfig(withCrawl);
    expect(config.crawl.skip_patterns).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// loadSiteConfig — file-based loading
// ---------------------------------------------------------------------------

describe("loadSiteConfig", () => {
  it("throws ConfigFileError for non-existent file", async () => {
    await expect(
      loadSiteConfig("/tmp/does-not-exist-config.yaml")
    ).rejects.toThrow(ConfigFileError);
  });

  it("loads and validates the smartebyernorge reference config", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);

    // Site metadata
    expect(config.version).toBe(1);
    expect(config.site.url).toBe("https://www.smartebyernorge.no");
    expect(config.site.name).toBe("Smarte Byer Norge");

    // All 9 content types
    expect(config.content_types).toHaveLength(9);
    const typeNames = config.content_types.map((ct) => ct.name);
    expect(typeNames).toContain("blog");
    expect(typeNames).toContain("news");
    expect(typeNames).toContain("english_news");
    expect(typeNames).toContain("event");
    expect(typeNames).toContain("conference");
    expect(typeNames).toContain("person");
    expect(typeNames).toContain("tech");
    expect(typeNames).toContain("press");
    expect(typeNames).toContain("page");

    // Crawl skip patterns
    expect(config.crawl.skip_patterns.length).toBeGreaterThan(0);

    // Cleanup patterns
    expect(config.cleanup.patterns.length).toBeGreaterThan(0);

    // LLM settings
    expect(config.llm.extraction_model).toBe("gemma3:4b");
    expect(config.llm.extraction_context_size).toBe(8192);
  });

  it("loads event content type with all extras", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const event = config.content_types.find((ct) => ct.name === "event");

    expect(event).toBeDefined();
    expect(event!.schema.extras).toBeDefined();

    // Event should have these extra fields
    const extraNames = Object.keys(event!.schema.extras!);
    expect(extraNames).toContain("event_date");
    expect(extraNames).toContain("event_time");
    expect(extraNames).toContain("venue");
    expect(extraNames).toContain("moderator");
    expect(extraNames).toContain("panelists");

    // Panelists should be an object with nested items
    const panelists = event!.schema.extras!["panelists"];
    expect(panelists.type).toBe("object");
    expect(panelists.items).toBeDefined();
    expect(panelists.items!["name"]).toBeDefined();
    expect(panelists.items!["title"]).toBeDefined();
    expect(panelists.items!["organization"]).toBeDefined();
  });

  it("loads conference content type with typed extras", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const conference = config.content_types.find(
      (ct) => ct.name === "conference"
    );

    expect(conference).toBeDefined();
    expect(conference!.schema.extras!["conference_name"]).toBeDefined();
    expect(conference!.schema.extras!["conference_name"].type).toBe("string");
    expect(conference!.schema.extras!["conference_name"].required).toBe(true);

    expect(conference!.schema.extras!["conference_year"]).toBeDefined();
    expect(conference!.schema.extras!["conference_year"].type).toBe("number");
    expect(conference!.schema.extras!["conference_year"].required).toBe(true);
  });

  it("loads person content type with image field", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const person = config.content_types.find((ct) => ct.name === "person");

    expect(person).toBeDefined();
    expect(person!.schema.extras!["photo"]).toBeDefined();
    expect(person!.schema.extras!["photo"].type).toBe("image");
  });

  it("each content type has an extraction prompt", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);

    for (const ct of config.content_types) {
      expect(ct.extraction_prompt.length).toBeGreaterThan(10);
    }
  });

  it("each content type has at least one url_pattern", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);

    for (const ct of config.content_types) {
      expect(ct.url_patterns.length).toBeGreaterThan(0);
    }
  });
});
