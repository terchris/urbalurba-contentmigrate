# urbalurba-contentmigrate

AI-powered website content migration. Crawl any website, analyse its content types with a powerful LLM, then bulk-extract every page into structured Markdown + YAML front matter using a local LLM. The output is a portable content lake ready for any static site generator (Hugo, Astro, Eleventy, etc.) or CMS.

## How It Works

The pipeline has two key insights:

1. **A powerful LLM analyses the site once** (Claude, GPT-4, etc.) to identify content types, design schemas, and write extraction prompts. This costs a few dollars.
2. **A small local LLM does the bulk work** (Ollama with gemma3:4b or similar) extracting every page using those prompts. This runs on your machine and costs nothing.

The result: migrating a 1000-page website costs under $5 and takes about 2 hours.

### The 7-Phase Pipeline

```
Phase 1: Discover        — Crawl the site with Crawl4AI, build a page manifest
Phase 2: Configure        — Powerful LLM analyses samples, generates schemas + prompts
Phase 3: Validate Crawl   — Check crawl quality, re-crawl with targeted CSS selectors
Phase 4: Test Extraction  — Run local LLM on a sample of each content type
Phase 5: Full Extraction  — Process all pages with the local LLM
Phase 6: Post-Process     — Programmatic validation and fixes
Phase 7: Verify           — Spot-check against live site, generate quality report
```

Each phase has feedback loops — if test extraction reveals problems, you go back and adjust the prompts or schemas before running the full extraction. See [Framework: AI-Powered Website Content Migration](docs/framework-website-content-migration.md) for the full methodology.

## What You Get

Every page becomes a Markdown file with YAML front matter:

```yaml
---
content_type: event
title: 'Smartbydebatten: Paneldebatt'
slug: smartbydebatten-paneldebatt
url_path: /arendalsuka-blog/2018/6/13/smartbydebatten-paneldebatt
language: nb
date: '2018-06-23'
description: >-
  Paneldebatt om smartbydebatten under Arendalsuka 2018...
author: Terje Christensen
source_url: 'https://www.smartebyernorge.no/arendalsuka-blog/...'
tags:
  - smart city
  - smartbydebatten
event_date: '2018-06-23'
venue: Arendal
panelists:
  - name: Lena Lundgreen
    title: 'Director Public Sector, Microsoft Norway'
    organization: Microsoft Norway
---
The markdown body of the page goes here...
```

Each content type gets its own schema with specific fields (events have panelists, people have job_title/organization, tech pages have solution_name, etc.). See the [examples/](examples/) folder for all 9 archetypes from our first migration.

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+ (for Crawl4AI crawler)
- **Ollama** running locally with a model pulled (e.g. `ollama pull gemma3:4b`)
- **Claude API key** (optional — only needed for complex pages like events with panelists)

## Quick Start

### 1. Install dependencies

```bash
# TypeScript pipeline
npm install

# Python crawler
pip install -r crawl/requirements.txt
```

### 2. Crawl the website

```bash
# Crawl a site (outputs JSON files to crawl-output/)
python crawl/crawl_site.py --url https://www.example.com

# Or crawl with a limit for testing
python crawl/crawl_site.py --url https://www.example.com --limit 20
```

### 3. Configure for your site

Edit the site-specific sections in these files (marked with `SITE-SPECIFIC` comments):

- **`lib/config.ts`** — URL patterns, content type routing, output directories
- **`lib/schemas.ts`** — Zod schemas for each content type (base + archetype-specific fields)
- **`lib/prompts.ts`** — LLM extraction prompts
- **`lib/clean-body.ts`** — Rules for cleaning nav/footer from crawled markdown

### 4. Test with a few pages

```bash
# Check Ollama is running
npm run check-ollama

# Classify pages into content types
npm run classify

# Extract a subset to test quality
npm run extract:ollama
```

### 5. Validate and iterate

```bash
# Run validation on extracted content
npm run validate
```

Review the output in `content/`, adjust prompts or schemas, re-run. The [Run History](docs/run-history.md) document shows how we iterated from 94% to 99.9% success rate in two runs.

### 6. Full extraction

```bash
# Extract all pages
npm run extract

# Or use Claude for complex content types
npm run extract:claude
```

## Project Structure

```
urbalurba-contentmigrate/
├── crawl/                  # Crawl4AI Python crawler
│   ├── crawl_site.py       #   Breadth-first site crawler
│   └── requirements.txt    #   Python dependencies
├── lib/                    # Core pipeline library (TypeScript)
│   ├── config.ts           #   Paths, models, URL routing (SITE-SPECIFIC)
│   ├── schemas.ts          #   Zod schemas per content type (SITE-SPECIFIC)
│   ├── prompts.ts          #   LLM extraction prompts (SITE-SPECIFIC)
│   ├── clean-body.ts       #   Markdown body cleaning (SITE-SPECIFIC)
│   ├── ollama-client.ts    #   Ollama LLM client
│   └── claude-client.ts    #   Claude API client
├── scripts/                # CLI entry points
│   ├── orchestrator.ts     #   Main extraction pipeline
│   ├── classify-pages.ts   #   Content type classification
│   ├── validate.ts         #   Output validation
│   └── check-ollama.ts     #   Ollama connectivity check
├── examples/               # Sample output (one per content type)
├── docs/                   # Documentation
├── crawl-output/           # (generated) Raw crawl JSON
├── content/                # (generated) Extracted Markdown files
├── reports/                # (generated) Extraction logs, reports
└── images/                 # (generated) Downloaded images
```

The `lib/` files marked **SITE-SPECIFIC** need to be customised for each website you migrate. Everything else is generic and reusable. In practice, about 80% of the code stays the same across migrations.

## How Much Does It Cost?

| Step | Tool | Cost for 1000 pages |
|------|------|---------------------|
| Crawling | Crawl4AI (local) | $0 |
| Site analysis | Claude API (one-time) | ~$2 |
| Bulk extraction | Ollama (local) | $0 |
| Complex pages | Claude API (~5% of pages) | ~$1.50 |
| **Total** | | **~$3.50** |

Wall clock time: approximately 2 hours for 1000 pages (limited by Ollama inference speed, not network).

## Key Lessons Learned

These lessons come from migrating smartebyernorge.no (918 pages on Squarespace):

1. **Content type analysis is the critical first step.** Identify all content types before writing any code. See [Lesson: Content Type Analysis](docs/lesson-content-type-analysis.md).

2. **Never trust the LLM for fields you can derive programmatically.** `source_url` and `url_path` are known inputs. Post-processing that overwrites these fields eliminated 127 errors instantly.

3. **Post-processing is your safety net.** Even with perfect prompts, the LLM will occasionally produce wrong output. A programmatic `postProcessExtraction()` step catches what prompts cannot.

4. **Per-archetype schemas prevent hallucination.** A single "superset" schema with all possible fields causes the LLM to fabricate data. Separate schemas per content type solved this.

5. **Two-tier LLM extraction works.** Ollama handles 95% of pages (free). Claude handles the 5% that need complex extraction like panelist arrays.

## Documentation

| Document | What it covers |
|----------|---------------|
| [Framework: AI-Powered Website Content Migration](docs/framework-website-content-migration.md) | The full 7-phase pipeline methodology, feedback loops, Crawl4AI advanced features, cost model |
| [Lesson: Content Type Analysis](docs/lesson-content-type-analysis.md) | Why analysing content types first is the single most important step |
| [Run History](docs/run-history.md) | Metrics from two extraction runs — how we went from 94% to 99.9% success |
| [Content Classification Methodology](docs/content-classification-methodology.md) | How 919 pages were classified into 9 archetypes with URL-pattern routing |
| [Phase 2 Blueprint](docs/phase2-blueprint.md) | Schema design (v2 per-archetype), archetype table, field definitions |
| [Performance Tuning](docs/performance-tuning.md) | Ollama model selection, context window, temperature, batching strategies |
| [Verification Findings](docs/verification-findings.md) | Field-by-field accuracy against Squarespace JSON ground truth |
| [Project Goals](docs/project-goals.md) | Original goals and design principles |
| [Migration Status Summary](docs/migration-status-summary.md) | Timeline and status of the smartebyernorge.no migration |

## Examples

The [examples/](examples/) folder contains one sample output file per content type, showing the full YAML front matter structure:

| File | Content type | Notable fields |
|------|-------------|----------------|
| [blog](examples/blog-et-smartere-samfunn.md) | blog | featured_image, tags |
| [news](examples/news-nordbolig.md) | news | featured_image, 6 tags |
| [event](examples/event-smartbydebatten-paneldebatt.md) | event | panelists array with name/title/org |
| [conference](examples/conference-arendalsuka.md) | conference | conference_name, year, theme |
| [person](examples/person-terje-christensen.md) | person | full_name, job_title, organization |
| [tech](examples/tech-no-waste.md) | tech | solution_name, external_url |
| [press](examples/press-eiendomswatch.md) | press | source_publication, original_url |
| [page](examples/page-smarte-byer-norge.md) | page | Static page with empty date/author |
| [english_news](examples/english-news-ambassador.md) | english_news | language: en |

## Status

This project was developed during the migration of smartebyernorge.no (Squarespace) and is being generalised into a reusable tool. Current status:

- [x] Crawl4AI crawler with breadth-first discovery
- [x] TypeScript extraction pipeline (Ollama + Claude)
- [x] Per-archetype Zod schemas
- [x] Post-processing validation
- [x] Error page filtering
- [x] Run history and documentation
- [ ] CLI tool for site analysis (Phase 2 automation)
- [ ] Hybrid CSS + LLM extraction
- [ ] Interactive configuration wizard

## License

MIT
