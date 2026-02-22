import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { buildRouter, buildOutputDirMap } from "../src/config/routing-builder.js";
import { loadSiteConfig } from "../src/config/config-loader.js";
import { SECTION_DIRS } from "../lib/config.js";

const REFERENCE_CONFIG_PATH = resolve(
  import.meta.dirname ?? ".",
  "../site-config.smartebyernorge.yaml"
);

// ---------------------------------------------------------------------------
// buildRouter — URL path classification
// ---------------------------------------------------------------------------

describe("buildRouter", () => {
  it("classifies blog URLs", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const classify = buildRouter(config);

    const result = classify("/blogg/foreningen-smarte-byer-norge");
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("blog");
    expect(result!.outputDir).toBe("blogg");
  });

  it("classifies news URLs", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const classify = buildRouter(config);

    const result = classify("/nyheter/ny-rapport-om-smartby");
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("news");
    expect(result!.outputDir).toBe("nyheter");
  });

  it("classifies English news URLs", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const classify = buildRouter(config);

    const result = classify("/english-news/smart-cities-report");
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("english_news");
    expect(result!.outputDir).toBe("english-news");
  });

  it("classifies event URLs (arendalsuka-blog)", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const classify = buildRouter(config);

    const result = classify("/arendalsuka-blog/smartbydebatten-2024");
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("event");
    expect(result!.outputDir).toBe("arendalsuka");
  });

  it("classifies event URLs (smartbydebatten pattern)", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const classify = buildRouter(config);

    const result = classify("/some/path/smartbydebatten");
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("event");
  });

  it("classifies event URLs (evolve2021 program)", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const classify = buildRouter(config);

    const result = classify("/evolve2021content/program/debatt-1");
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("event");
  });

  it("classifies conference landing pages", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const classify = buildRouter(config);

    const arendalsuka = classify("/arendalsuka");
    expect(arendalsuka).not.toBeNull();
    expect(arendalsuka!.contentType).toBe("conference");

    const evolve = classify("/evolve2021");
    expect(evolve).not.toBeNull();
    expect(evolve!.contentType).toBe("conference");
  });

  it("classifies person URLs", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const classify = buildRouter(config);

    const person = classify("/person/ola-nordmann");
    expect(person).not.toBeNull();
    expect(person!.contentType).toBe("person");
    expect(person!.outputDir).toBe("personer");

    const people = classify("/people/kari-nordmann");
    expect(people).not.toBeNull();
    expect(people!.contentType).toBe("person");
  });

  it("classifies tech URLs", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const classify = buildRouter(config);

    const tech = classify("/tech/smart-sensor");
    expect(tech).not.toBeNull();
    expect(tech!.contentType).toBe("tech");

    const concept = classify("/concept/digital-twin");
    expect(concept).not.toBeNull();
    expect(concept!.contentType).toBe("tech");
  });

  it("classifies press URLs", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const classify = buildRouter(config);

    const result = classify("/press/eiendomswatch-article");
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("press");
    expect(result!.outputDir).toBe("presse");
  });

  it("classifies homepage", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const classify = buildRouter(config);

    const result = classify("/");
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("page");
    expect(result!.outputDir).toBe("sider");
  });

  it("returns null for unmatched URLs", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const classify = buildRouter(config);

    const result = classify("/unknown/path/that/matches/nothing");
    expect(result).toBeNull();
  });

  it("returns the full content type definition", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const classify = buildRouter(config);

    const result = classify("/blogg/test");
    expect(result).not.toBeNull();
    expect(result!.definition).toBeDefined();
    expect(result!.definition.name).toBe("blog");
    expect(result!.definition.extraction_prompt.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildOutputDirMap — matches hardcoded SECTION_DIRS
// ---------------------------------------------------------------------------

describe("buildOutputDirMap", () => {
  it("produces the same mapping as hardcoded SECTION_DIRS", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const generatedDirs = buildOutputDirMap(config);

    // Compare to hardcoded SECTION_DIRS
    for (const [contentType, outputDir] of Object.entries(SECTION_DIRS)) {
      expect(generatedDirs[contentType]).toBe(outputDir);
    }
  });

  it("has an entry for every content type", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const generatedDirs = buildOutputDirMap(config);

    expect(Object.keys(generatedDirs)).toHaveLength(9);
    for (const ct of config.content_types) {
      expect(generatedDirs).toHaveProperty(ct.name);
    }
  });
});
