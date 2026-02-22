# Plan 005: Tests and Documentation

> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.

## Status: Backlog

**Goal**: Fill test coverage gaps, add end-to-end integration tests, write user-facing documentation, and validate import into target platforms (Hugo, Astro, Enonic XP). Note: PLAN-001 sets up vitest and writes unit tests for config modules. PLAN-002 adds tests for the refactored engine. This plan fills remaining gaps and adds the documentation + platform validation layer.

**Last Updated**: 2026-02-23

**Depends on**: PLAN-001 through PLAN-004 (test the finished product)

---

## Problem Summary

Documentation exists for the internal experiment but not for external users of the generic tool. Test infrastructure and core unit tests are set up in PLAN-001/002, but coverage gaps remain (especially around the `analyse` command and end-to-end flows). Both are blockers for a v1 release.

---

## Phase 1: Coverage audit and gap-fill

- [ ] 1.1 Run `vitest --coverage` and identify modules below 80% coverage
- [ ] 1.2 Add missing unit tests to reach > 80% on all `src/` modules
- [ ] 1.3 Add edge case tests: malformed crawl JSON, empty pages, pages with no metadata, huge pages exceeding context limit

**Validation**: `npm test -- --coverage` shows > 80% coverage on all core modules.

---

## Phase 3: Integration tests

- [ ] 3.1 End-to-end extraction: load config → feed sample crawl data → verify .md output
- [ ] 3.2 Validation: run validate against known-good and known-bad .md files
- [ ] 3.3 Config generation: mock cloud LLM responses → verify generated site-config.yaml structure

**Validation**: Integration tests pass without requiring Ollama or cloud API keys (use mocked LLM responses).

---

## Phase 4: Documentation

- [ ] 4.1 Rewrite README.md for external users — quick start, installation, usage, examples
- [ ] 4.2 Create `docs/config-reference.md` — full site-config.yaml reference with all fields documented
- [ ] 4.3 Create `docs/getting-started.md` — step-by-step guide: install → analyse → extract → validate
- [ ] 4.4 Add JSDoc to all public API functions
- [ ] 4.5 Add CONTRIBUTING.md with development setup instructions

**Validation**: A developer unfamiliar with the project can follow getting-started.md and successfully migrate a sample site.

---

## Phase 5: Platform import validation

- [ ] 5.1 Test Hugo import — extract sample site, copy .md files to a Hugo project, verify pages render
- [ ] 5.2 Test Astro import — extract sample site, use .md files with Astro content collections, verify pages render
- [ ] 5.3 Test Enonic XP import — extract sample site as JSON, write a transform script to Enonic content API format, verify import
- [ ] 5.4 Document any platform-specific adjustments needed (front matter field names, date formats, etc.)

**Validation**: Extracted content renders correctly in all three target platforms.

---

## Acceptance Criteria

- [ ] Test suite exists with > 80% coverage on core modules
- [ ] Tests run without external dependencies (Ollama, cloud APIs)
- [ ] README, getting-started guide, and config reference are written
- [ ] Import works for Hugo, Astro, and Enonic XP
