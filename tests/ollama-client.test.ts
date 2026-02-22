/**
 * ollama-client.test.ts
 *
 * Tests the unit-testable parts of the ollama client:
 * - trimForExtraction: cleanup + truncation
 *
 * Does NOT require a running Ollama instance.
 */

import { describe, it, expect } from "vitest";
import { trimForExtraction } from "../lib/ollama-client.js";

describe("trimForExtraction", () => {
  const identityClean = (md: string) => md;
  const mockCleanBody = (md: string) => md.replace(/BOILERPLATE/g, "");

  it("returns cleaned content when under maxChars", () => {
    const result = trimForExtraction(
      "Some BOILERPLATE content here",
      mockCleanBody,
      4000
    );
    expect(result).toBe("Some  content here");
    expect(result).not.toContain("BOILERPLATE");
  });

  it("truncates content when over maxChars", () => {
    const longContent = "A".repeat(5000);
    const result = trimForExtraction(longContent, identityClean, 4000);

    expect(result.length).toBeLessThan(5000);
    expect(result).toContain("[... truncated for metadata extraction]");
  });

  it("does not truncate when exactly at maxChars", () => {
    const exactContent = "A".repeat(4000);
    const result = trimForExtraction(exactContent, identityClean, 4000);

    expect(result).toBe(exactContent);
    expect(result).not.toContain("truncated");
  });

  it("applies cleanup before measuring length", () => {
    // Content with boilerplate exceeds 100 chars, but after cleanup it's under
    const boilerplate = "BOILERPLATE".repeat(20); // 220 chars
    const content = `Short content. ${boilerplate}`;
    const result = trimForExtraction(content, mockCleanBody, 100);

    // After cleanup: "Short content. " (16 chars) — no truncation needed
    expect(result).toBe("Short content. ");
    expect(result).not.toContain("truncated");
  });

  it("handles empty input", () => {
    const result = trimForExtraction("", identityClean, 4000);
    expect(result).toBe("");
  });
});
