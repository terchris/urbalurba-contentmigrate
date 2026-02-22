/**
 * orchestrator.test.ts
 *
 * Tests the unit-testable parts of the orchestrator:
 * - postProcessExtraction: source_url fix, tag normalization, date normalization,
 *   description=title fix
 *
 * These do not require Ollama — they test data post-processing only.
 */

import { describe, it, expect } from "vitest";
import { postProcessExtraction } from "../scripts/orchestrator.js";

describe("postProcessExtraction", () => {
  it("constructs source_url from site URL and url_path", () => {
    const data: Record<string, unknown> = {
      source_url: "https://wrong-url.com/page",
      url_path: "/wrong",
    };

    postProcessExtraction(data, "/blogg/my-post", "https://www.example.com");

    expect(data.source_url).toBe("https://www.example.com/blogg/my-post");
    expect(data.url_path).toBe("/blogg/my-post");
  });

  it("clears description when it matches title", () => {
    const data: Record<string, unknown> = {
      title: "My Great Post",
      description: "My Great Post",
    };

    postProcessExtraction(data, "/test", "https://example.com");

    expect(data.description).toBe("");
  });

  it("clears description when it matches title (case insensitive)", () => {
    const data: Record<string, unknown> = {
      title: "My Great Post",
      description: "  my great post  ",
    };

    postProcessExtraction(data, "/test", "https://example.com");

    expect(data.description).toBe("");
  });

  it("keeps description when different from title", () => {
    const data: Record<string, unknown> = {
      title: "My Great Post",
      description: "A summary of the post content.",
    };

    postProcessExtraction(data, "/test", "https://example.com");

    expect(data.description).toBe("A summary of the post content.");
  });

  it("normalizes tags to lowercase and deduplicates", () => {
    const data: Record<string, unknown> = {
      tags: ["Arendalsuka", "Smart City", "arendalsuka", "  IoT  "],
    };

    postProcessExtraction(data, "/test", "https://example.com");

    expect(data.tags).toEqual(["arendalsuka", "smart city", "iot"]);
  });

  it("removes empty tags", () => {
    const data: Record<string, unknown> = {
      tags: ["valid", "", "  ", "also-valid"],
    };

    postProcessExtraction(data, "/test", "https://example.com");

    expect(data.tags).toEqual(["valid", "also-valid"]);
  });

  it("normalizes date to YYYY-MM-DD", () => {
    const data: Record<string, unknown> = {
      date: "2024-08-14T00:00:00",
    };

    postProcessExtraction(data, "/test", "https://example.com");

    expect(data.date).toBe("2024-08-14");
  });

  it("preserves valid YYYY-MM-DD date", () => {
    const data: Record<string, unknown> = {
      date: "2024-08-14",
    };

    postProcessExtraction(data, "/test", "https://example.com");

    expect(data.date).toBe("2024-08-14");
  });

  it("preserves empty date string", () => {
    const data: Record<string, unknown> = {
      date: "",
    };

    postProcessExtraction(data, "/test", "https://example.com");

    expect(data.date).toBe("");
  });

  it("handles data with no tags", () => {
    const data: Record<string, unknown> = {
      title: "Test",
    };

    // Should not throw
    postProcessExtraction(data, "/test", "https://example.com");

    expect(data.tags).toBeUndefined();
  });

  it("uses site URL from config (not hardcoded)", () => {
    const data: Record<string, unknown> = {};

    postProcessExtraction(data, "/page", "https://custom-site.no");

    expect(data.source_url).toBe("https://custom-site.no/page");
  });
});
