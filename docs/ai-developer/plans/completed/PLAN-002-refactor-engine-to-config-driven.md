# Plan 002: Refactor Engine to Config-Driven

> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.

## Status: Complete ✅

**Goal**: Refactor the existing extraction engine (orchestrator, ollama-client, claude-client, validate) to read all site-specific configuration from the `SiteConfig` object (built in PLAN-001) instead of hardcoded imports. After this, the engine is generic — it works for any site that has a `site-config.yaml`.

**Last Updated**: 2026-02-22

**Depends on**: PLAN-001 (config loader must be working)

**Result**: All engine files refactored to config-driven. 123 tests pass across 9 files. Old hardcoded files archived in `legacy/`. Zero hardcoded site-specific values remain in engine code.

---

## Problem Summary

The extraction engine currently imports site-specific code directly: `config.ts` for routing, `schemas.ts` for Zod schemas, `prompts.ts` for LLM prompts, `clean-body.ts` for boilerplate removal. These imports must be replaced with calls to the `SiteConfig` facade so the engine becomes site-agnostic.

---

## Phase 1: Refactor orchestrator — DONE

- [x] 1.1 Replace `import { classifyPage, SECTION_DIRS } from "../lib/config.js"` with SiteConfig routing
- [x] 1.2 Replace hardcoded `SITE_ORIGIN` with `siteConfig.site.url`
- [x] 1.3 Replace `cleanBody()` import with SiteConfig cleanup function
- [x] 1.4 Replace site-specific banner text with generic banner using site name from config
- [x] 1.5 Add `--config` CLI flag to specify config file path (default: `./site-config.yaml`)
- [x] 1.6 Write `tests/orchestrator.test.ts`: test post-processing (source_url fix, tag normalization, date normalization, slug collision handling) — these are unit-testable without Ollama

**Validation**: `npm test` passes — 11 orchestrator tests green. ✅

---

## Phase 2: Refactor LLM clients — DONE

- [x] 2.1 Refactor `ollama-client.ts` to accept schemas and prompts as parameters (from SiteConfig) instead of importing them
- [x] 2.2 Refactor `claude-client.ts` to accept schemas and prompts as parameters
- [x] 2.3 Make model name configurable (from `siteConfig.llm.extraction_model`)
- [x] 2.4 Make context size and max chars configurable
- [x] 2.5 Write `tests/ollama-client.test.ts`: test `trimForExtraction()` with mocked cleanup function

**Validation**: `npm test` passes — 5 ollama-client tests green. ✅

---

## Phase 3: Refactor validation and classification — DONE

- [x] 3.1 Refactor `validate.ts` to load required fields from SiteConfig schemas instead of hardcoded `REQUIRED_FIELDS`
- [x] 3.2 Replace or remove `classify-pages.ts` — moved to `legacy/`, URL-pattern detection now handled by SiteConfig routing
- [x] 3.3 Refactor `check-ollama.ts` — make banner generic, use model from config
- [x] 3.4 Write `tests/validate.test.ts`: test against known-good .md files (pass) and known-bad .md files (fail with expected errors)

**Validation**: `npm test` passes — 10 validate tests green. ✅

---

## Phase 4: Clean up dead code and regression test — DONE

- [x] 4.1 Remove deprecated `stripHtmlBoilerplate()` from ollama-client.ts (removed during full rewrite)
- [x] 4.2 Move hardcoded site-specific files to `legacy/`: config.ts, prompts.ts, clean-body.ts, schemas.ts, classify-pages.ts
- [x] 4.3 Keep the original files in `legacy/` folder for comparison tests
- [x] 4.4 Update package.json scripts — removed obsolete `classify`, `extract:ollama`, `extract:claude` scripts
- [x] 4.5 Regression snapshot tests: comparison tests in schema-builder, routing-builder, and facade tests verify config-driven output matches hardcoded output

**Validation**: `npm test` passes — 123 tests across 9 files. ✅

---

## Acceptance Criteria

- [x] Zero hardcoded site-specific values remain in the engine code
- [x] All site-specific behaviour comes from `site-config.yaml`
- [x] The smartebyernorge.no migration produces the same results as before (verified by comparison tests)
- [x] Engine is ready for PLAN-003 to plug in the `analyse` command
- [x] All refactored modules have automated tests — `npm test` passes with no failures
- [x] Regression comparison tests catch any drift in extraction output

---

## Files Modified

| File | Action |
|------|--------|
| `scripts/orchestrator.ts` | Refactored — uses SiteConfig facade, `--config` CLI flag |
| `lib/ollama-client.ts` | Refactored — accepts ExtractionContext parameter |
| `lib/claude-client.ts` | Refactored — accepts schema, prompt, model as parameters |
| `scripts/validate.ts` | Refactored — loads required fields from config |
| `scripts/check-ollama.ts` | Refactored — generic banner, model from config |
| `package.json` | Updated — removed obsolete scripts |
| `tsconfig.json` | Updated — includes `legacy/` directory |
| `legacy/config.ts` | Archived from `lib/config.ts` |
| `legacy/prompts.ts` | Archived from `lib/prompts.ts` |
| `legacy/clean-body.ts` | Archived from `lib/clean-body.ts` |
| `legacy/schemas.ts` | Archived from `lib/schemas.ts` |
| `legacy/classify-pages.ts` | Archived from `scripts/classify-pages.ts` |
