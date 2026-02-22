# Plan 004: CLI Packaging and Distribution

> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.

## Status: Backlog

**Goal**: Package the tool as an npm CLI that can be installed and run via `npx contentmigrate`. Handle the TypeScript build, CLI entry point, Python dependency management, and npm publishing.

**Last Updated**: 2026-02-23

**Depends on**: PLAN-002 (engine must be config-driven), PLAN-003 (analyse command must work)

---

## Problem Summary

Currently the tool runs via `tsx scripts/orchestrator.ts` from the project directory. For distribution, it needs to be a proper npm package with a CLI binary, compiled JS, and graceful handling of the Python dependency (Crawl4AI).

---

## Phase 1: Project restructure

- [ ] 1.1 Move source files into a clean `src/` structure: `src/commands/`, `src/config/`, `src/engine/`, `src/lib/`
- [ ] 1.2 Create CLI entry point (`src/cli.ts`) using a lightweight CLI framework (e.g. `commander` or `citty`)
- [ ] 1.3 Register all commands: `analyse`, `extract`, `validate`, `crawl`, `check`
- [ ] 1.4 Set up TypeScript build to compile `src/` → `dist/`
- [ ] 1.5 Add `bin` field to package.json pointing to `dist/cli.js`

**Validation**: `node dist/cli.js --help` shows all commands.

---

## Phase 2: Python dependency handling

- [ ] 2.1 Bundle `crawl/crawl_site.py` inside the npm package
- [ ] 2.2 On first run of `crawl` or `analyse`, check for Python 3 + Crawl4AI
- [ ] 2.3 If missing, print clear instructions (not auto-install — respect user's environment)
- [ ] 2.4 Create a `contentmigrate check` command that verifies all dependencies (Node, Python, Crawl4AI, Ollama, API keys)

**Validation**: Fresh `npx contentmigrate check` on a machine with/without Python gives clear status.

---

## Phase 3: npm packaging

- [ ] 3.1 Choose package name (check npm registry for availability: `contentmigrate`, `content-migrate`, `@urbalurba/contentmigrate`)
- [ ] 3.2 Set up `.npmignore` or `files` field — only include `dist/`, `crawl/`, `README.md`, `LICENSE`
- [ ] 3.3 Add prepublish build script
- [ ] 3.4 Test local install: `npm pack && npm install -g ./contentmigrate-*.tgz`
- [ ] 3.5 Test npx: `npx ./contentmigrate-*.tgz check`

**Validation**: `npx contentmigrate --version` works after local install.

---

## Phase 4: First publish

- [ ] 4.1 Publish to npm as v0.1.0 (beta)
- [ ] 4.2 Test `npx contentmigrate check` from a clean environment
- [ ] 4.3 Test full workflow: `analyse` → `extract` → `validate`

**Validation**: A developer who has never seen the project can run `npx contentmigrate analyse --url https://example.com` and get a working config.

---

## Acceptance Criteria

- [ ] `npx contentmigrate` works without cloning the repo
- [ ] All 5 commands are accessible from the CLI
- [ ] Python dependency is handled gracefully (clear error messages, not silent failure)
- [ ] Package size is reasonable (< 5MB excluding node_modules)
