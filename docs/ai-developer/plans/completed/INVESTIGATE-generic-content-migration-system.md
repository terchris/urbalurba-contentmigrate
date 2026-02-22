# Investigate: Generic AI-Powered Content Migration System

> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.

## Status: Complete

**Goal**: Determine whether to build a generic, reusable content migration tool from our existing experiment — and how. Research what already exists, identify what our current codebase has vs what's missing, and propose an architecture for a generic system.

**Last Updated**: 2026-02-23

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

## Phase 2: Analyse our current codebase — DONE

- [x] 2.1 Inventory all files — classify each as generic vs site-specific
- [x] 2.2 Identify the exact integration points where site-specific code plugs into generic code
- [x] 2.3 Document the current manual steps a user must perform (what isn't automated)
- [x] 2.4 List the assumptions baked into the code (TypeScript, Ollama, Crawl4AI, Node.js)
- [x] 2.5 Identify what would break if pointed at a non-Squarespace site
- [x] 2.6 Assess code quality and test coverage

**Validation**: ✅ File-by-file inventory, integration points, and breakage analysis produced (see Findings → Codebase analysis).

---

## Phase 3: Define what "generic" means — DONE

- [x] 3.1 Define the target user — who would use this tool? (developer, content editor, agency?)
- [x] 3.2 Define the interaction model — CLI wizard? Config file? Conversational AI?
- [x] 3.3 Define the minimum viable scope — what source platforms must work? (any website? CMS-specific?)
- [x] 3.4 Define the output format — machine-readable structured data (JSON, YAML, Markdown + front matter, or all)
- [x] 3.5 Define the LLM requirements — must it work with Ollama only? Cloud APIs? Both?
- [x] 3.6 Define distribution — npm package? GitHub template repo? Docker image? CLI tool?

**Validation**: ✅ Elevator pitch, user story, and all definitions produced (see Findings → Proposed approach).

---

## Phase 4: Propose architecture — DONE

- [x] 4.1 Design the separation between generic engine and site-specific configuration
- [x] 4.2 Propose how Phase 1-2 (site analysis) gets automated — the "powerful LLM generates everything" flow
- [x] 4.3 Propose the configuration format (what does the user provide vs what the AI generates?)
- [x] 4.4 Propose the CLI interface and commands
- [x] 4.5 Identify the riskiest assumptions and unknowns
- [x] 4.6 Estimate effort (rough T-shirt sizes for major work items)

**Validation**: ✅ Architecture proposal produced (see Findings → Proposed approach). Ready to create PLAN files.

---

## Acceptance Criteria

- [x] We know what tools already exist and how our approach differs
- [x] We have a clear inventory of generic vs site-specific code in our codebase
- [x] We have a proposed architecture for a generic system
- [x] We have identified the riskiest unknowns
- [x] The investigation produces enough clarity to create one or more PLAN files

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

#### File-by-file inventory

| File | Lines | Status | What it does |
|------|------:|--------|-------------|
| **lib/config.ts** | 196 | 🔴 Site-specific | URL patterns, content routing, archetype list, output dirs |
| **lib/prompts.ts** | 131 | 🔴 Site-specific | LLM system prompts referencing smartebyernorge.no |
| **lib/clean-body.ts** | 128 | 🔴 Site-specific | Squarespace boilerplate removal (nav, footer, newsletter, cookie) |
| **lib/schemas.ts** | 173 | 🟡 Needs refactoring | Zod schemas — structure is generic, but archetypes are hardcoded |
| **lib/ollama-client.ts** | 289 | 🟢 Generic | Two-pass Ollama extraction (classify → extract) with structured output |
| **lib/claude-client.ts** | 106 | 🟢 Generic | Claude extraction via tool_use for structured output |
| **scripts/orchestrator.ts** | 480 | 🟡 Needs refactoring | Pipeline engine — mostly generic, but has hardcoded `SITE_ORIGIN` and site-specific banner |
| **scripts/classify-pages.ts** | 107 | 🔴 Site-specific | URL-to-archetype detection with smartebyernorge.no patterns |
| **scripts/check-ollama.ts** | 262 | 🟡 Needs refactoring | Setup verification — generic logic, but site name in banner and test HTML |
| **scripts/validate.ts** | 258 | 🟢 Generic | Post-extraction validation of .md frontmatter vs archetype required fields |
| **crawl/crawl_site.py** | 372 | 🟢 Generic | Crawl4AI wrapper — already accepts `--url` for any site |
| **crawl/setup.py** | 71 | 🟢 Generic | Crawl4AI installation verification |

**Summary**: 5 generic, 4 need refactoring, 3 site-specific. The generic/site-specific split is approximately 70/30 by line count.

#### Integration points (where site-specific plugs into generic)

There are exactly **6 integration points** where site-specific configuration feeds into the generic engine:

| # | What | Where consumed | Currently lives in |
|---|------|---------------|-------------------|
| 1 | **Content type list** (archetypes) | schemas.ts, config.ts, orchestrator.ts | Hardcoded in `ARCHETYPES` array and `ContentType` Zod enum |
| 2 | **Per-archetype Zod schemas** (base + extras) | ollama-client.ts, claude-client.ts, validate.ts | Hardcoded in schemas.ts |
| 3 | **URL → content type routing rules** | orchestrator.ts via `classifyPage()` | Hardcoded regex arrays in config.ts (`COMPLEX_PATTERNS`, `OLLAMA_OVERRIDES`) |
| 4 | **LLM system prompts** (extraction instructions) | ollama-client.ts, claude-client.ts | Hardcoded strings in prompts.ts |
| 5 | **Body cleanup rules** (boilerplate removal) | ollama-client.ts, orchestrator.ts | Hardcoded regex patterns in clean-body.ts |
| 6 | **Output directory mapping** | orchestrator.ts | Hardcoded in `SECTION_DIRS` in config.ts |

**Key insight**: All 6 integration points are currently hardcoded. In a generic system, these become the **site configuration** that gets generated by the powerful LLM during the analysis phase (Phase 1 of the pipeline). The user provides a URL; the AI generates all 6 artifacts.

#### Manual steps a user must perform today

To migrate a **new** site (not smartebyernorge.no), a developer would need to:

1. **Run the crawler** — `python crawl/crawl_site.py --url https://new-site.com` (already generic)
2. **Manually browse** the crawled content and identify content types (no automation)
3. **Write archetype list** — edit `ARCHETYPES` array and `ContentType` enum in schemas.ts
4. **Write Zod schemas** — create base + extras for each archetype in schemas.ts
5. **Write URL routing rules** — create regex patterns in config.ts for `COMPLEX_PATTERNS` and `OLLAMA_OVERRIDES`
6. **Write LLM prompts** — rewrite `OLLAMA_SYSTEM_PROMPT` and `CLAUDE_SYSTEM_PROMPT` in prompts.ts for the new site
7. **Write body cleanup rules** — rewrite `cleanBody()` in clean-body.ts for the new site's boilerplate
8. **Update output directories** — edit `SECTION_DIRS` in config.ts
9. **Update `SITE_ORIGIN`** — edit the hardcoded origin in orchestrator.ts
10. **Run extraction** — `npm run extract` (generic)
11. **Run validation** — `npm run validate` (generic)

Steps 2–9 are the manual work. In a generic system, steps 2–8 get **automated by the powerful LLM** during site analysis. Step 9 becomes a config value.

#### Assumptions baked into the code

| Assumption | Impact | Flexibility needed |
|-----------|--------|-------------------|
| **TypeScript + Node.js** | Runtime | Keep — this is our chosen language |
| **Ollama for local LLM** | Extraction engine | Keep — but make model configurable |
| **gemma3:4b model** | Specific model | Should be configurable per site |
| **Crawl4AI for crawling** | Python subprocess | Keep — delegate crawling to best tool |
| **Zod for schema validation** | Schema format | Keep — core strength |
| **gray-matter for front matter** | Output format | Keep, but add JSON/YAML output options |
| **Markdown + YAML as output** | Output format | Add JSON output option |
| **Single site per run** | Scope | Fine for v1 |
| **Content fits in 4K chars** | LLM context limit | Make configurable (some sites have longer metadata sections) |
| **Two-pass extraction** | Pipeline design | Keep — proven effective |
| **Flat file output** | Storage | Fine for v1, filesystem is universal |

#### What breaks on a non-Squarespace site

| Component | What breaks | Fix needed |
|-----------|------------|-----------|
| **clean-body.ts** | 🔴 Every regex is Squarespace-specific (nav links, newsletter, footer, cookie banner) | Must be regenerated per site. Generic alternative: Crawl4AI's PruningContentFilter (already available, currently unused for body) |
| **prompts.ts** | 🔴 References "smartebyernorge.no", Norwegian language rules, Squarespace CDN URLs | Must be regenerated per site |
| **config.ts** | 🔴 URL patterns (`/blogg/`, `/arendalsuka-blog/`, `/evolve2021content/`) all smartebyernorge-specific | Must be regenerated per site |
| **schemas.ts** | 🟡 Archetypes (event, person, conference, tech, press) may not apply | Archetypes must be discovered per site. Base schema (title, slug, date, author, tags) is universal |
| **classify-pages.ts** | 🔴 `detectArchetype()` has hardcoded smartebyernorge URL paths | Must use config-driven patterns instead |
| **orchestrator.ts** | 🟡 `SITE_ORIGIN` hardcoded, banner says "smartebyernorge.no" | Move to config |
| **check-ollama.ts** | 🟡 Banner says "smartebyernorge.no", test HTML is Norwegian | Cosmetic — make banner generic, keep test HTML |
| **crawl_site.py** | 🟢 Already works with `--url` — no changes needed | Works as-is |
| **validate.ts** | 🟢 Driven by schemas.ts — if schemas are correct, validation works | Works as-is |

**Bottom line**: 3 files must be fully regenerated per site (clean-body, prompts, config routing). 2 files need the archetype definitions externalised (schemas, classify-pages). 2 files need minor config changes (orchestrator, check-ollama). 3 files work as-is.

#### Code quality and test coverage

**Quality**:
- Well-structured: clear separation of concerns (lib/ for engines, scripts/ for CLI, crawl/ for Python)
- Good documentation: every file has a JSDoc header explaining purpose, every function has doc comments
- Consistent patterns: all scripts share the same banner + summary output style
- Site-specific code is already marked with `SITE-SPECIFIC:` comments in config.ts
- Error handling: try/catch with meaningful messages in all extraction clients
- CLI ergonomics: `--limit`, `--concurrency`, `--dry-run` flags

**Test coverage**:
- **Zero test files exist** — no unit tests, no integration tests
- check-ollama.ts serves as a manual smoke test (verifies Ollama connection + structured output)
- validate.ts serves as a post-hoc content quality check (but not a code test)
- For a generic tool, we need: unit tests for schema generation, integration tests for extraction, end-to-end tests with sample sites

**Debt**:
- `stripHtmlBoilerplate()` in ollama-client.ts is deprecated but still present (~90 lines of dead code)
- `claude-client.ts` is defined but not used in the current orchestrator (all pages go through Ollama now)
- `classify-pages.ts` depends on a `filtered-pages.json` manifest from a filter script that isn't in the repo

### Proposed approach

#### Elevator pitch

A CLI tool that migrates any website into structured Markdown files ready for static site generators. Point it at a URL, it crawls the site, uses a cloud LLM to automatically discover content types and generate extraction schemas, then uses a local LLM to bulk-extract every page into Markdown with typed YAML front matter — for near-zero cost.

#### User story

> As a web developer migrating a client's website to Hugo/Astro/Next.js, I want to run a single CLI command that analyses the site structure and extracts all content into Markdown files with proper front matter, so I don't have to manually copy-paste hundreds of pages.

#### 3.1 Target user

**Primary**: Web developers migrating websites to static site generators (Hugo, Astro, Eleventy, Next.js). Comfortable with CLI tools, npm, and editing config files. Not expected to know Python or ML.

**Secondary**: Digital agencies doing repeat website migrations. They'd use this as part of a workflow, possibly wrapping it in their own tooling.

**Not targeting (v1)**: Non-technical content editors, CMS-to-CMS migrations (WordPress → WordPress), or real-time sync.

#### 3.2 Interaction model

**CLI with two phases**:

1. **`analyse`** — Cloud LLM analyses a sample of crawled pages, discovers content types, generates site configuration (schemas, prompts, routing rules, cleanup patterns). Outputs a `site-config.yaml` that the user can review and edit.
2. **`extract`** — Local LLM bulk-extracts all pages using the generated config. Outputs Markdown files with YAML front matter.

The user flow is:
```
npx contentmigrate analyse --url https://example.com    # ~$2-5, takes 5 min
# Review/edit site-config.yaml if needed
npx contentmigrate extract                               # ~$0, takes 30-120 min
npx contentmigrate validate                              # Check results
```

No wizard, no conversational AI. The config file is the interface — generated by AI, editable by humans.

#### 3.3 Minimum viable scope

**Source**: Any public website with HTML content. No CMS admin access required. If the page is visible in a browser, we can extract it.

**Not in scope (v1)**:
- Sites behind authentication (login walls)
- Single-page applications (heavy JS rendering) — Crawl4AI handles basic JS, but we won't guarantee SPA support
- PDF/document extraction
- Image migration (download and re-host) — front matter will contain source URLs, but we won't download images in v1

#### 3.4 Output format

**Primary output**: Markdown files with YAML front matter. This is the **universal intermediate format** — not because we only target Hugo, but because it cleanly separates structured metadata from body content in a single file that is both human-readable and machine-parseable.

**Why Markdown + YAML front matter as the base format**:

1. **Universal readability** — Any developer can open a `.md` file, read the front matter, and understand the content. No tooling required to inspect results.
2. **Clean metadata/body separation** — YAML front matter holds typed, structured metadata (title, date, author, content-type-specific fields). The Markdown body holds the content. This separation is exactly what every target platform needs, just in different shapes.
3. **Lossless intermediate representation** — From this format, you can generate anything:
   - **Hugo/Eleventy**: Use the `.md` files directly (native format)
   - **Astro**: Use the `.md` files directly via content collections, or transform front matter to match Astro's schema
   - **Enonic XP**: Transform to Enonic's content API JSON format — front matter maps to `x-data` fields, body maps to `htmlArea` components
   - **Any CMS with an API**: Parse front matter → JSON → POST to CMS API
4. **Diff-friendly** — Text files in git. Easy to review, compare, and version control migration results.
5. **Already a standard** — Hugo, Astro, Eleventy, Jekyll, Gatsby, Next.js MDX all use this format. We're not inventing something new.

**Also supported**: JSON output per page (`--output json`). Same data, different shape — useful for CMS API imports (e.g. Enonic) where you need structured JSON rather than files.

**Target platforms for validation testing**:

| Platform | Type | Import method | What we test |
|----------|------|--------------|-------------|
| **Hugo** | Static site generator | Direct — `.md` files with front matter | Files work as-is in `content/` |
| **Astro** | Static site generator | Direct — `.md` files via content collections | Front matter matches Astro schema definitions |
| **Enonic XP** | Headless CMS | Transform — JSON via content API | Front matter → Enonic content types, body → htmlArea |

Testing against all three validates that our intermediate format truly is universal — if it works for both file-based SSGs and API-based CMSs, it works for anything.

#### 3.5 LLM requirements

**Analysis phase** (`analyse`): Requires a cloud LLM API key. Supported:
- Anthropic Claude (primary, recommended)
- OpenAI GPT-4o (secondary)

This is the "expensive" step (~$2-5 per site) that runs once.

**Extraction phase** (`extract`): Uses Ollama (local) by default. Zero cost. Supported:
- Ollama with any model (default: gemma3:4b)
- Cloud LLM fallback (optional, for users without Ollama)

The model is configurable in `site-config.yaml`.

#### 3.6 Distribution

**npm package**: `npx contentmigrate` (zero-install experience). The package includes:
- TypeScript orchestration engine (compiled to JS)
- Python crawler bundled or auto-installed on first run
- CLI interface

**Requirements on the user's machine**:
- Node.js 20+
- Python 3.10+ (for Crawl4AI)
- Ollama running locally (for extraction phase)
- Cloud LLM API key (for analysis phase)

Docker image as a future option (bundles everything), but not for v1.

---

### Architecture

#### Engine vs configuration separation

The generic system splits into two clean halves:

```
┌─────────────────────────────────────────────────────┐
│  SITE CONFIGURATION (generated by analyse, per-site)│
│                                                     │
│  site-config.yaml                                   │
│  ├── site_url, site_name                            │
│  ├── content_types[]                                │
│  │   ├── name, url_patterns[], output_dir           │
│  │   ├── schema (base fields + extras)              │
│  │   └── extraction_prompt                          │
│  ├── cleanup_rules[] (boilerplate patterns)         │
│  └── llm_settings (model, context_size)             │
└─────────────────────────────────────────────────────┘
                        ▼ consumed by
┌─────────────────────────────────────────────────────┐
│  GENERIC ENGINE (npm package, shared across sites)  │
│                                                     │
│  ├── analyse command (cloud LLM generates config)   │
│  ├── crawl wrapper (Crawl4AI subprocess)            │
│  ├── extract command (Ollama + config → .md files)  │
│  ├── validate command (check output vs schemas)     │
│  ├── schema runtime (Zod from YAML definitions)     │
│  └── output writers (Markdown+frontmatter, JSON)    │
└─────────────────────────────────────────────────────┘
```

**Key change from current code**: The 6 integration points we identified in Phase 2 (archetypes, schemas, routing, prompts, cleanup, output dirs) all move from hardcoded TypeScript into `site-config.yaml`. The engine reads this config at runtime.

#### How `analyse` works (the AI-generates-everything flow)

```
User runs: npx contentmigrate analyse --url https://example.com

1. CRAWL SAMPLE
   └─ Crawl4AI fetches ~20-50 pages (breadth-first sample)
   └─ Save raw markdown + URL paths

2. DISCOVER CONTENT TYPES
   └─ Send sample pages to cloud LLM (Claude)
   └─ Prompt: "Analyse these pages. Identify distinct content types
      (e.g. blog post, product page, team member). For each type,
      list URL patterns, representative pages, and unique fields."
   └─ LLM returns: content type list + URL patterns + per-type fields

3. GENERATE SCHEMAS
   └─ For each content type, send 2-3 representative pages to LLM
   └─ Prompt: "Generate a YAML schema for this content type.
      Include base fields (title, slug, date, author, tags) plus
      any type-specific fields you see in the content."
   └─ LLM returns: per-type schema definitions

4. GENERATE EXTRACTION PROMPTS
   └─ For each content type, LLM writes an extraction system prompt
   └─ Prompt: "Write a system prompt that instructs a small LLM to
      extract metadata from [content type] pages on [site]. Include
      rules for language detection, date formats, field-specific
      guidance."
   └─ LLM returns: per-type extraction prompts

5. GENERATE CLEANUP RULES
   └─ Send 3-5 pages with full boilerplate to LLM
   └─ Prompt: "Identify the repeating boilerplate (nav, footer,
      cookie banner, newsletter). Generate regex patterns or
      CSS selectors to remove them."
   └─ LLM returns: cleanup rules

6. WRITE CONFIGURATION
   └─ Assemble all outputs into site-config.yaml
   └─ Write to project directory
   └─ Print summary: "Found N content types. Review site-config.yaml
      and run: npx contentmigrate extract"
```

**Estimated LLM cost**: ~$2-5 for a 500-1000 page site (20-50 sample pages × 4-5 LLM calls).

#### Configuration format: `site-config.yaml`

```yaml
# site-config.yaml — generated by `analyse`, editable by humans
version: 1
site:
  url: https://www.example.com
  name: Example Site

crawl:
  skip_patterns:
    - '\?'           # query params
    - '/category/'
    - '/tag/'
    - '\.pdf$'

content_types:
  - name: blog_post
    url_patterns:
      - '^/blog/'
    output_dir: blog
    schema:
      base: true                # title, slug, date, author, tags, etc.
      extras:
        reading_time: { type: string, description: "Estimated reading time" }
    extraction_prompt: |
      You are extracting metadata from blog posts on example.com.
      ... (site-specific instructions)

  - name: team_member
    url_patterns:
      - '^/team/'
      - '^/about/people/'
    output_dir: team
    schema:
      base: true
      extras:
        full_name: { type: string, required: true }
        job_title: { type: string }
        department: { type: string }
        photo: { type: image }
    extraction_prompt: |
      You are extracting team member profiles from example.com.
      ...

cleanup:
  patterns:
    - { name: "navigation", regex: '^\s*\[?(Home|About|Blog|Contact)\s*\]?\s*\([^)]*\)\s*$' }
    - { name: "footer", regex: '©\s*\d{4}.*$' }
    - { name: "cookie_banner", regex: 'This site uses cookies.*$' }

llm:
  analysis_model: claude-sonnet-4-20250514    # for analyse phase
  extraction_model: gemma3:4b                  # for extract phase
  extraction_context_size: 8192
  extraction_max_chars: 4000                   # trim input to this
```

**What the user provides**: Just a URL. Everything else is AI-generated.
**What the user can edit**: Everything in the YAML. Add content types, tweak schemas, adjust prompts, add cleanup rules.

#### CLI interface

```
contentmigrate analyse --url <url>       Crawl sample, discover types, generate site-config.yaml
                       [--sample N]      Number of pages to sample (default: 30)
                       [--config FILE]   Output config path (default: ./site-config.yaml)
                       [--model MODEL]   Cloud LLM model (default: claude-sonnet-4-20250514)

contentmigrate extract                   Extract all pages using site-config.yaml
                       [--config FILE]   Config path (default: ./site-config.yaml)
                       [--limit N]       Process only N pages
                       [--concurrency N] Parallel Ollama requests (default: 2)
                       [--output FORMAT] Output format: markdown (default) or json
                       [--dry-run]       Show what would be extracted

contentmigrate validate                  Validate extracted files against schemas
                       [--config FILE]   Config path
                       [--fix]           Auto-fix common issues

contentmigrate crawl                     Full crawl (not just sample) — writes crawl-output/
                       [--url URL]       Override site URL from config
                       [--limit N]       Max pages

contentmigrate check                     Verify Ollama + API keys are configured
```

#### Riskiest assumptions and unknowns

| # | Risk | Impact | Mitigation |
|---|------|--------|-----------|
| 1 | **Cloud LLM generates bad schemas** — wrong content types, missing fields, hallucinated extras | Extraction quality is garbage for affected types | Human review of `site-config.yaml` before extract. Test extraction on 5 pages first (`--limit 5`). Iterative refinement. |
| 2 | **Cleanup rules fail on unknown CMSs** — regex patterns generated by LLM don't match actual boilerplate | Extracted Markdown contains nav/footer junk | Fall back to Crawl4AI's PruningContentFilter as a generic baseline. Cleanup rules are additive, not required. |
| 3 | **Local LLM can't follow complex prompts** — gemma3:4b may struggle with nuanced extraction on unfamiliar sites | Wrong metadata in front matter | Keep the two-pass approach (classify → extract). Allow cloud LLM fallback for complex pages. Configurable per content type. |
| 4 | **Zod schemas from YAML** — runtime Zod schema generation from YAML definitions hasn't been tested | Schema validation may not work correctly at runtime | Proof of concept needed early. This is the riskiest technical piece. |
| 5 | **Python dependency friction** — requiring Python + Crawl4AI installation adds complexity | Users abandon setup | Clear error messages. Consider bundling a pre-built Crawl4AI binary or offering a Docker option. |
| 6 | **Content diversity** — sites with highly mixed content (e-commerce, forums, wikis) may have dozens of content types | analyse phase produces too many types, overwhelming config | Cap at 10-15 content types. Group similar types. Let user merge/split in config. |

**Riskiest technical piece**: #4 — runtime Zod schema generation from YAML. This needs a proof-of-concept before committing to the architecture. If we can't build Zod schemas from YAML at runtime, we'd need to generate TypeScript files instead (code generation rather than config-driven).

#### Effort estimates

| Work item | Size | Notes |
|-----------|------|-------|
| **Config loader** — read `site-config.yaml`, build runtime Zod schemas, load prompts | M | Riskiest piece — start here |
| **`analyse` command** — crawl sample + cloud LLM generates config | L | Multiple LLM calls, prompt engineering, output assembly |
| **Refactor engine** — make orchestrator, ollama-client, validate read from config instead of hardcoded imports | M | Mostly wiring — the logic exists |
| **`extract` command** — wrapper around refactored orchestrator | S | Thin CLI layer |
| **`validate` command** — wrapper around refactored validate.ts | S | Already mostly generic |
| **`crawl` command** — wrapper around crawl_site.py | S | Already works |
| **`check` command** — environment verification | S | Already mostly exists |
| **Cleanup rules engine** — apply YAML-defined regex patterns instead of hardcoded clean-body.ts | S | Simple regex engine |
| **JSON output option** | S | Alternative to Markdown+frontmatter |
| **npm packaging** — make it installable via `npx` | M | Build pipeline, bin entry, Python dependency handling |
| **Tests** — unit + integration | L | Currently zero coverage |
| **Documentation** — README, getting started, config reference | M | Essential for an open-source tool |

**T-shirt sizes**: S = 1-2 days, M = 3-5 days, L = 1-2 weeks

**Total estimate**: ~6-8 weeks of focused work for a v1.

**Recommended build order**:
1. Config loader + proof-of-concept Zod-from-YAML (de-risks #4)
2. Refactor engine to read config
3. `analyse` command (the unique value)
4. npm packaging
5. Tests + docs
