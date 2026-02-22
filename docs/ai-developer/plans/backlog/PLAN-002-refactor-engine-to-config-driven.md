# Plan 002: Refactor Engine to Config-Driven

> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.

## Status: Backlog

**Goal**: Refactor the existing extraction engine (orchestrator, ollama-client, claude-client, validate) to read all site-specific configuration from the `SiteConfig` object (built in PLAN-001) instead of hardcoded imports. After this, the engine is generic — it works for any site that has a `site-config.yaml`.

**Last Updated**: 2026-02-23

**Depends on**: PLAN-001 (config loader must be working)

---

## Problem Summary

The extraction engine currently imports site-specific code directly: `config.ts` for routing, `schemas.ts` for Zod schemas, `prompts.ts` for LLM prompts, `clean-body.ts` for boilerplate removal. These imports must be replaced with calls to the `SiteConfig` facade so the engine becomes site-agnostic.

---

## Phase 1: Refactor orchestrator

- [ ] 1.1 Replace `import { classifyPage, SECTION_DIRS } from "../lib/config.js"` with SiteConfig routing
- [ ] 1.2 Replace hardcoded `SITE_ORIGIN` with `siteConfig.site.url`
- [ ] 1.3 Replace `cleanBody()` import with SiteConfig cleanup function
- [ ] 1.4 Replace site-specific banner text with generic banner using site name from config
- [ ] 1.5 Add `--config` CLI flag to specify config file path (default: `./site-config.yaml`)
- [ ] 1.6 Write `tests/orchestrator.test.ts`: test post-processing (source_url fix, tag normalization, date normalization, slug collision handling) — these are unit-testable without Ollama

**Validation**: `npm test` passes. Run refactored orchestrator with smartebyernorge.no config against existing crawl output — output should match previous results.

---

## Phase 2: Refactor LLM clients

- [ ] 2.1 Refactor `ollama-client.ts` to accept schemas and prompts as parameters (from SiteConfig) instead of importing them
- [ ] 2.2 Refactor `claude-client.ts` to accept schemas and prompts as parameters
- [ ] 2.3 Make model name configurable (from `siteConfig.llm.extraction_model`)
- [ ] 2.4 Make context size and max chars configurable
- [ ] 2.5 Write `tests/ollama-client.test.ts`: test `trimForExtraction()` with mocked cleanup function, test two-pass vs forced-type logic (mock Ollama responses)

**Validation**: `npm test` passes. Extract 5 pages with refactored clients — compare output to previous results.

---

## Phase 3: Refactor validation and classification

- [ ] 3.1 Refactor `validate.ts` to load required fields from SiteConfig schemas instead of hardcoded `REQUIRED_FIELDS`
- [ ] 3.2 Replace or remove `classify-pages.ts` — its URL-pattern detection is now handled by SiteConfig routing
- [ ] 3.3 Refactor `check-ollama.ts` — make banner generic, use model from config
- [ ] 3.4 Write `tests/validate.test.ts`: test against known-good .md files (pass) and known-bad .md files (fail with expected errors)

**Validation**: `npm test` passes. Run `validate` against existing extracted content — same results as before.

---

## Phase 4: Clean up dead code and regression test

- [ ] 4.1 Remove deprecated `stripHtmlBoilerplate()` from ollama-client.ts
- [ ] 4.2 Remove hardcoded site-specific files that are now replaced by config: old `config.ts` routing arrays, old `prompts.ts` strings, old `clean-body.ts`
- [ ] 4.3 Keep the original files in a `legacy/` folder or git history for reference
- [ ] 4.4 Update package.json scripts to use new config-driven commands
- [ ] 4.5 Create a snapshot regression test: save 5 known-good extracted .md files as fixtures, run extraction from config, diff output against fixtures

**Validation**: `npm test` passes — all unit tests + regression snapshot test green. `npm run extract -- --config site-config.smartebyernorge.yaml` works end-to-end.

---

## Acceptance Criteria

- [ ] Zero hardcoded site-specific values remain in the engine code
- [ ] All site-specific behaviour comes from `site-config.yaml`
- [ ] The smartebyernorge.no migration produces the same results as before
- [ ] Engine is ready for PLAN-003 to plug in the `analyse` command
- [ ] All refactored modules have automated tests — `npm test` passes with no failures
- [ ] Regression snapshot test catches any drift in extraction output

---

## Files to Modify

| File | Action |
|------|--------|
| `scripts/orchestrator.ts` | Refactor — use SiteConfig |
| `lib/ollama-client.ts` | Refactor — parameterise schemas/prompts |
| `lib/claude-client.ts` | Refactor — parameterise schemas/prompts |
| `scripts/validate.ts` | Refactor — use SiteConfig schemas |
| `scripts/classify-pages.ts` | Remove or replace |
| `scripts/check-ollama.ts` | Refactor — generic banner |
| `lib/config.ts` | Archive — replaced by config loader |
| `lib/prompts.ts` | Archive — replaced by config prompts |
| `lib/clean-body.ts` | Archive — replaced by config cleanup |
| `lib/schemas.ts` | Archive — replaced by schema builder |
