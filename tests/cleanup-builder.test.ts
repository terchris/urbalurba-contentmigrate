import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  buildCleanupFunction,
  compileCleanupRules,
} from "../src/config/cleanup-builder.js";
import { loadSiteConfig } from "../src/config/config-loader.js";

const REFERENCE_CONFIG_PATH = resolve(
  import.meta.dirname ?? ".",
  "../site-config.smartebyernorge.yaml"
);

// ---------------------------------------------------------------------------
// compileCleanupRules — regex compilation
// ---------------------------------------------------------------------------

describe("compileCleanupRules", () => {
  it("compiles simple rules", () => {
    const rules = [
      { name: "test_rule", regex: "^Hello$", flags: "gm" },
    ];
    const compiled = compileCleanupRules(rules);

    expect(compiled).toHaveLength(1);
    expect(compiled[0].name).toBe("test_rule");
    expect(compiled[0].regex).toBeInstanceOf(RegExp);
    expect(compiled[0].regex.flags).toContain("g");
    expect(compiled[0].regex.flags).toContain("m");
  });

  it("compiles rules with different flags", () => {
    const rules = [
      { name: "dotall", regex: "start.*end", flags: "gms" },
    ];
    const compiled = compileCleanupRules(rules);

    expect(compiled[0].regex.flags).toContain("s");
  });

  it("compiles empty array", () => {
    const compiled = compileCleanupRules([]);
    expect(compiled).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildCleanupFunction — body cleaning with smartebyernorge patterns
// ---------------------------------------------------------------------------

describe("buildCleanupFunction with smartebyernorge config", () => {
  it("removes navigation links", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const cleanBody = buildCleanupFunction(config);

    const input = `[Hjem](https://www.smartebyernorge.no/)
[Arrangement](https://www.smartebyernorge.no/arrangement)
[Kurs](https://www.smartebyernorge.no/kurs)

## Actual Article Title

This is the real content.`;

    const cleaned = cleanBody(input);

    expect(cleaned).not.toContain("[Hjem]");
    expect(cleaned).not.toContain("[Arrangement]");
    expect(cleaned).not.toContain("[Kurs]");
    expect(cleaned).toContain("Actual Article Title");
    expect(cleaned).toContain("This is the real content.");
  });

  it("removes logo line", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const cleanBody = buildCleanupFunction(config);

    const input = `# [![Smarte Byer Norge](https://images.squarespace-cdn.com/logo.png)](https://www.smartebyernorge.no)

## Article Title

Content here.`;

    const cleaned = cleanBody(input);
    expect(cleaned).not.toContain("[![Smarte Byer Norge]");
    expect(cleaned).toContain("Article Title");
  });

  it("removes page title duplicate", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const cleanBody = buildCleanupFunction(config);

    const input = `Foreningen Smarte Byer Norge — Smarte Byer Norge

## Foreningen Smarte Byer Norge

Content here.`;

    const cleaned = cleanBody(input);
    // The duplicate title with " — Smarte Byer Norge" should be removed
    expect(cleaned).not.toContain("— Smarte Byer Norge");
    expect(cleaned).toContain("## Foreningen Smarte Byer Norge");
  });

  it("removes newsletter signup block", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const cleanBody = buildCleanupFunction(config);

    const input = `Content here.

### MELD DEG PÅ VÅRT NYHETSBREV

Get the latest news!

Email Address

SEND
Takk! Vi har sendt deg en e-post.

More content.`;

    const cleaned = cleanBody(input);
    expect(cleaned).not.toContain("MELD DEG PÅ");
    expect(cleaned).not.toContain("Email Address");
    expect(cleaned).toContain("Content here.");
    expect(cleaned).toContain("More content.");
  });

  it("removes email field and send button fragments", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const cleanBody = buildCleanupFunction(config);

    const input = `Content.

Email Address

SEND

Takk! Vi har sendt deg en e-post.

More.`;

    const cleaned = cleanBody(input);
    expect(cleaned).not.toContain("Email Address");
    expect(cleaned).not.toContain("SEND");
    expect(cleaned).not.toContain("Takk! Vi har sendt deg en e-post.");
  });

  it("removes cookie/privacy footer", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const cleanBody = buildCleanupFunction(config);

    const input = `Content here.

Vi arbeider etter Vær Varsom-plakatens regler for god presseskikk. Den som mener seg rammet av urettmessig publisering, oppfordres til å ta kontakt med redaksjonen.`;

    const cleaned = cleanBody(input);
    expect(cleaned).not.toContain("Vær Varsom");
    expect(cleaned).toContain("Content here.");
  });

  it("removes address line", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const cleanBody = buildCleanupFunction(config);

    const input = `Content.

Smarte Byer Norge, c/o Næringsforeningen, Postboks 250, 4066 Stavanger

More.`;

    const cleaned = cleanBody(input);
    expect(cleaned).not.toContain("Smarte Byer Norge, c/o");
    expect(cleaned).toContain("Content.");
    expect(cleaned).toContain("More.");
  });

  it("removes social media icon links", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const cleanBody = buildCleanupFunction(config);

    const input = `Content.

[ ](https://www.facebook.com/smartebyernorge) [ ](https://www.linkedin.com/company/smartebyernorge)

More.`;

    const cleaned = cleanBody(input);
    expect(cleaned).not.toContain("facebook.com");
    expect(cleaned).not.toContain("linkedin.com");
  });

  it("removes Back to Top links", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const cleanBody = buildCleanupFunction(config);

    const input = `Content.

[Back to Top](#top)

More.`;

    const cleaned = cleanBody(input);
    expect(cleaned).not.toContain("Back to Top");
  });

  it("removes Newer/Older Post navigation", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const cleanBody = buildCleanupFunction(config);

    const input = `Content.

Newer Post[Next article](/blogg/next)
Older Post[Previous article](/blogg/prev)

More.`;

    const cleaned = cleanBody(input);
    expect(cleaned).not.toContain("Newer Post");
    expect(cleaned).not.toContain("Older Post");
  });

  it("collapses multiple blank lines", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const cleanBody = buildCleanupFunction(config);

    const input = `Line 1



Line 2




Line 3`;

    const cleaned = cleanBody(input);
    // No more than 2 consecutive newlines
    expect(cleaned).not.toMatch(/\n{3,}/);
  });

  it("preserves article content untouched", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const cleanBody = buildCleanupFunction(config);

    const input = `## Smarte løsninger for fremtidens byer

![Featured](https://images.squarespace-cdn.com/content/article-image.jpg)

Smarte Byer Norge jobber med å gjøre norske byer smartere og mer bærekraftige.

[Les mer om prosjektet](https://www.smartebyernorge.no/prosjekt)`;

    const cleaned = cleanBody(input);
    expect(cleaned).toContain("Smarte løsninger for fremtidens byer");
    expect(cleaned).toContain("smartere og mer bærekraftige");
    expect(cleaned).toContain("[Les mer om prosjektet]");
  });

  it("handles empty input", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const cleanBody = buildCleanupFunction(config);

    expect(cleanBody("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// buildCleanupFunction with no rules
// ---------------------------------------------------------------------------

describe("buildCleanupFunction with no cleanup rules", () => {
  it("still collapses blank lines and trims", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    // Override cleanup to have no patterns
    const emptyConfig = {
      ...config,
      cleanup: { patterns: [] },
    };
    const cleanBody = buildCleanupFunction(emptyConfig);

    const input = `Content.\n\n\n\nMore.`;
    const cleaned = cleanBody(input);

    // Collapses 4 newlines to 2, trims leading/trailing whitespace
    expect(cleaned).toBe("Content.\n\nMore.");
  });
});
