# Plan 003: Analyse Command

> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.

## Status: Backlog

**Goal**: Build the `analyse` command — the core unique value of the tool. Given a URL, it crawls a sample, uses a cloud LLM to discover content types, and generates a complete `site-config.yaml` ready for extraction.

**Last Updated**: 2026-02-23

**Depends on**: PLAN-001 (config format must be defined), PLAN-002 (engine must be config-driven)

---

## Problem Summary

Today, migrating a new site requires a developer to manually identify content types, write schemas, write prompts, write cleanup rules, and configure routing — approximately 8 manual steps. The `analyse` command automates all of this by having a cloud LLM do the analysis.

This is where the two-tier LLM economics kick in: spend ~$2-5 once on a powerful LLM to generate all configuration, then spend ~$0 on a local LLM to extract hundreds/thousands of pages.

---

## Phase 1: Sample crawler

- [ ] 1.1 Create `analyse` CLI command entry point with `--url`, `--sample N`, `--config`, `--model` flags
- [ ] 1.2 Implement breadth-first sample crawl (reuse `crawl_site.py` with `--limit N`)
- [ ] 1.3 Select diverse sample pages — ensure coverage of different URL path patterns, not just the first N pages found
- [ ] 1.4 Save sample pages to a temporary working directory

**Validation**: `contentmigrate analyse --url https://www.smartebyernorge.no --sample 30` crawls 30 diverse pages.

---

## Phase 2: Content type discovery

- [ ] 2.1 Build the discovery prompt — send URL paths + first 500 chars of each sample page to cloud LLM
- [ ] 2.2 Ask LLM to identify distinct content types, URL patterns, and representative pages per type
- [ ] 2.3 Parse LLM response into structured content type definitions
- [ ] 2.4 Handle edge cases: LLM returns too many types (cap at 15), too few (minimum 1), or unclear patterns

**Validation**: Discovery on smartebyernorge.no should find approximately the same 9 archetypes we identified manually (blog, news, event, person, conference, tech, press, page, english_news).

---

## Phase 3: Schema and prompt generation

- [ ] 3.1 For each content type, select 2-3 representative pages from the sample
- [ ] 3.2 Send representative pages to cloud LLM with instructions to generate schema (base fields + extras)
- [ ] 3.3 Send representative pages to cloud LLM with instructions to generate extraction prompt
- [ ] 3.4 Generate cleanup rules — send 3-5 pages with full boilerplate, ask LLM to identify repeating patterns
- [ ] 3.5 Assemble all outputs into the `site-config.yaml` structure

**Validation**: Generated config for smartebyernorge.no should be comparable to the manually written reference config from PLAN-001.

---

## Phase 4: Config writer and user feedback

- [ ] 4.1 Write the complete `site-config.yaml` to the output path
- [ ] 4.2 Print a human-readable summary: site name, content types found, page count per type, estimated extraction time
- [ ] 4.3 Suggest next steps: "Review site-config.yaml, then run: contentmigrate extract"
- [ ] 4.4 Add a `--dry-run` flag that shows what would be generated without writing files

**Validation**: End-to-end test — `analyse` a site, then `extract` using the generated config, then `validate` the results.

---

## Acceptance Criteria

- [ ] `analyse` takes a URL and produces a working `site-config.yaml`
- [ ] Generated config produces reasonable extraction results without manual editing
- [ ] Works on at least 2 different sites (smartebyernorge.no + one other)
- [ ] Cloud LLM cost stays under $5 for a 500-page site

---

## Implementation Notes

- Prompt engineering is the critical skill here — the quality of the generated config depends entirely on how well we prompt the cloud LLM
- Consider multi-step prompting (discover types → generate schemas → generate prompts) vs single mega-prompt. Multi-step is more reliable.
- The analyse command should be idempotent — running it twice produces the same config
- Store intermediate LLM responses in a `reports/analyse-log.json` for debugging
