# Investigate: Generic AI-Powered Content Migration System

> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.

## Status: Active

**Goal**: Determine whether to build a generic, reusable content migration tool from our existing experiment — and how. Research what already exists, identify what our current codebase has vs what's missing, and propose an architecture for a generic system.

**Last Updated**: 2026-02-22

---

## Background

We have a working content migration pipeline built for smartebyernorge.no (Squarespace → Markdown + YAML front matter). The pipeline uses a two-tier LLM approach:

1. **Powerful LLM** (Claude/GPT) analyses the site once — identifies content types, designs schemas, writes extraction prompts (~$2-5)
2. **Local LLM** (Ollama with gemma3:4b) does bulk extraction using those prompts (~$0, runs locally)

The current codebase is ~80% generic (orchestrator, Ollama client, slug dedup, front matter writer) and ~20% site-specific (schemas, prompts, clean-body rules, URL routing). The documentation describes a 7-phase pipeline with feedback loops.

The question: should we turn this into a tool anyone can use, and if so, how?

---

## Phase 1: Research existing tools and approaches — DONE

- [x] 1.1 Search for existing open-source content migration tools that use AI/LLM
- [x] 1.2 Search for commercial content migration services and SaaS products
- [x] 1.3 Research web scraping frameworks that produce structured content (not just raw HTML)
- [x] 1.4 Look at Crawl4AI's own ecosystem — are others building migration tools on top of it?
- [x] 1.5 Check if any static site generator projects have migration tooling (Hugo, Astro, Eleventy importers)
- [x] 1.6 Research CMS migration tools (WordPress importers, Drupal migrate module, etc.)
- [x] 1.7 Summarise findings: what exists, what gaps remain, where our approach is unique

**Validation**: ✅ Comparison table and full research document produced.

**Output**: [docs/research-existing-migration-tools.md](../../../research-existing-migration-tools.md)

---

## Phase 2: Analyse our current codebase

- [ ] 2.1 Inventory all files — classify each as generic vs site-specific
- [ ] 2.2 Identify the exact integration points where site-specific code plugs into generic code
- [ ] 2.3 Document the current manual steps a user must perform (what isn't automated)
- [ ] 2.4 List the assumptions baked into the code (TypeScript, Ollama, Crawl4AI, Node.js)
- [ ] 2.5 Identify what would break if pointed at a non-Squarespace site
- [ ] 2.6 Assess code quality and test coverage

**Validation**: Produce a file-by-file inventory table showing generic/site-specific/needs-refactoring status.

---

## Phase 3: Define what "generic" means

- [ ] 3.1 Define the target user — who would use this tool? (developer, content editor, agency?)
- [ ] 3.2 Define the interaction model — CLI wizard? Config file? Conversational AI?
- [ ] 3.3 Define the minimum viable scope — what source platforms must work? (any website? CMS-specific?)
- [ ] 3.4 Define the output format — machine-readable structured data (JSON, YAML, Markdown + front matter, or all)
- [ ] 3.5 Define the LLM requirements — must it work with Ollama only? Cloud APIs? Both?
- [ ] 3.6 Define distribution — npm package? GitHub template repo? Docker image? CLI tool?

**Validation**: Write a one-paragraph "elevator pitch" and a user story for the most common use case.

---

## Phase 4: Propose architecture

- [ ] 4.1 Design the separation between generic engine and site-specific configuration
- [ ] 4.2 Propose how Phase 1-2 (site analysis) gets automated — the "powerful LLM generates everything" flow
- [ ] 4.3 Propose the configuration format (what does the user provide vs what the AI generates?)
- [ ] 4.4 Propose the CLI interface and commands
- [ ] 4.5 Identify the riskiest assumptions and unknowns
- [ ] 4.6 Estimate effort (rough T-shirt sizes for major work items)

**Validation**: Architecture proposal ready for review. Clear enough to create PLAN files from.

---

## Acceptance Criteria

- [ ] We know what tools already exist and how our approach differs
- [ ] We have a clear inventory of generic vs site-specific code in our codebase
- [ ] We have a proposed architecture for a generic system
- [ ] We have identified the riskiest unknowns
- [ ] The investigation produces enough clarity to create one or more PLAN files

---

## Findings

*(To be filled in as investigation progresses)*

### Existing tools

Full research in [docs/research-existing-migration-tools.md](../../../research-existing-migration-tools.md).

**Summary**: No existing tool combines content type discovery + per-type schema generation + two-tier LLM extraction + Markdown/YAML front matter output. The landscape has:
- **Web scrapers** (Crawl4AI, Firecrawl, Jina, Spider, ScrapeGraphAI) — crawl and convert to markdown but don't produce structured per-page front matter with content-type-specific schemas
- **CMS exporters** (WordPress-to-Hugo, Squarespace XML) — produce structured output but require admin access to a specific CMS
- **Enterprise services** (Infogain, aisite.ai) — proprietary, expensive ($5k-50k+), not reusable

**Recommendation**: Build it. The gap is real — our two-tier LLM approach (analyse once ~$3, extract 1000 pages ~$0) is unique.

**Key design principle**: Only build what nobody else does. Delegate crawling to Crawl4AI, local LLM calls to Ollama, cloud LLM calls to Anthropic/OpenAI SDKs, schema validation to Zod. We only build the intelligence layer: content type discovery, per-type schema/prompt generation, per-type routing, pipeline orchestration with feedback loops, and the configuration format that ties it together.

### Language choice: TypeScript

**Decision**: Stay with TypeScript. Python considered and rejected.

**Rationale**:
- Current codebase is already TypeScript — rewriting wastes effort that doesn't add user value
- Python-ecosystem tools (Crawl4AI, ScrapeGraphAI) work fine as subprocesses — crawling is I/O-bound, subprocess overhead is negligible
- Our unique value is in the orchestration/intelligence layer (config-heavy, schema-heavy) — TypeScript + Zod is excellent here
- Target users are web developers migrating to SSGs (Hugo, Astro, Next.js) — npm is their ecosystem
- Distribution via `npx` is natural for the target audience
- Maintainer (project owner) is fluent in TypeScript, not Python

**What stays in Python**: Crawl4AI (called as subprocess, same as today). Potentially a thin Python sidecar package if deeper integration with Python tools is needed later.

### Codebase analysis

*(Phase 2 findings go here)*

### Proposed approach

*(Phase 3-4 findings go here)*
