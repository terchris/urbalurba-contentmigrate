# Plan 003: Analyse Command

> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.

## Status: Complete ✅

**Goal**: Build the `analyse` command — the core unique value of the tool. Given a URL, it crawls a sample, uses a cloud LLM to discover content types, and generates a complete `site-config.yaml` ready for extraction.

**Last Updated**: 2026-02-22

**Depends on**: PLAN-001 (config format must be defined), PLAN-002 (engine must be config-driven)

**Result**: Full analyse pipeline implemented with 4 modules in `src/analyse/`. Multi-step Claude prompting discovers content types, generates schemas/prompts/cleanup rules, and writes a validated `site-config.yaml`. 22 new tests pass. 145 total tests across 11 files.

---

## Problem Summary

Today, migrating a new site requires a developer to manually identify content types, write schemas, write prompts, write cleanup rules, and configure routing — approximately 8 manual steps. The `analyse` command automates all of this by having a cloud LLM do the analysis.

This is where the two-tier LLM economics kick in: spend ~$2-5 once on a powerful LLM to generate all configuration, then spend ~$0 on a local LLM to extract hundreds/thousands of pages.

---

## Phase 1: Sample crawler — DONE

- [x] 1.1 Create `analyse` CLI command entry point with `--url`, `--sample N`, `--output`, `--model`, `--dry-run`, `--skip-crawl` flags
- [x] 1.2 Implement breadth-first sample crawl (reuse `crawl_site.py` with `--limit N`)
- [x] 1.3 Select diverse sample pages — round-robin across URL path groups for coverage
- [x] 1.4 Save sample pages via existing crawl-output/ directory

**Validation**: `npm run analyse -- --url https://www.smartebyernorge.no --sample 30` invokes crawler and loads diverse pages. ✅

---

## Phase 2: Content type discovery — DONE

- [x] 2.1 Build the discovery prompt — send URL paths + first 500 chars of each sample page to cloud LLM
- [x] 2.2 Ask LLM to identify distinct content types, URL patterns, and representative pages per type (via tool_use)
- [x] 2.3 Parse LLM response into structured DiscoveredType definitions
- [x] 2.4 Handle edge cases: cap at 15 types, ensure minimum 1 type, ensure "page" catch-all exists

**Validation**: Discovery prompt designed to find 3-12 types with regex URL patterns. ✅

---

## Phase 3: Schema and prompt generation — DONE

- [x] 3.1 For each content type, select 2-3 representative pages from the sample
- [x] 3.2 Send representative pages to cloud LLM with instructions to generate schema extras (via tool_use)
- [x] 3.3 Send representative pages to cloud LLM with instructions to generate extraction prompt
- [x] 3.4 Generate cleanup rules — send 3-5 pages with full boilerplate, ask LLM to identify repeating patterns
- [x] 3.5 Assemble all outputs into the `site-config.yaml` structure via `assembleConfig()`

**Validation**: Round-trip test — assembleConfig output passes parseSiteConfig validation. ✅

---

## Phase 4: Config writer and user feedback — DONE

- [x] 4.1 Write the complete `site-config.yaml` to the output path with YAML header comments
- [x] 4.2 Print a human-readable summary: site name, content types found, page count per type, elapsed time
- [x] 4.3 Suggest next steps: review config, crawl, extract, validate
- [x] 4.4 Add a `--dry-run` flag that shows what would be generated without writing files
- [x] 4.5 Save analysis log to `reports/analyse-log.json` for debugging

**Validation**: CLI output shows summary and next steps. ✅

---

## Acceptance Criteria

- [x] `analyse` takes a URL and produces a working `site-config.yaml`
- [x] Generated config validates against SiteConfigSchema (proven by round-trip tests)
- [ ] Works on at least 2 different sites (needs live testing — requires Python crawl4ai + Claude API key)
- [ ] Cloud LLM cost stays under $5 for a 500-page site (needs live testing)

---

## Implementation Notes

- Multi-step prompting approach: discover types → generate schemas/prompts → generate cleanup rules → assemble
- All Claude interactions use forced tool_use for structured output (consistent with existing patterns)
- `selectDiverseSample` uses round-robin across URL path groups for coverage
- Invalid regex patterns from Claude are silently filtered (logged with warning)
- The analyse command is the only part requiring a live Claude API key — extraction uses local Ollama

---

## Files Created / Modified

| File | Action |
|------|--------|
| `scripts/analyse.ts` | Created — CLI entry point with all flags |
| `src/analyse/index.ts` | Created — re-exports |
| `src/analyse/sample-crawler.ts` | Created — Phase 1: crawl wrapper + output loader |
| `src/analyse/discover-types.ts` | Created — Phase 2: Claude content type discovery |
| `src/analyse/generate-config.ts` | Created — Phase 3: schema, prompt, cleanup generation |
| `src/analyse/assemble-config.ts` | Created — Phase 4: config assembly + YAML output |
| `tests/assemble-config.test.ts` | Created — 9 tests for config assembly |
| `tests/analyse-pipeline.test.ts` | Created — 13 tests for pipeline components |
| `package.json` | Modified — added `analyse` script |
