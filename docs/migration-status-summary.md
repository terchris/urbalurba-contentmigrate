# Website Migration Project — Status Summary

## Project Goal

Copy **smartebyernorge.no** off Squarespace to save hosting costs. Use this as a proving ground for the larger **rodekors.no** (Norwegian Red Cross) CMS migration. The output is a "content lake" of Markdown files with YAML front matter that can deploy to multiple CMS backends (Hugo, Astro, Enonic).

See [project-goals.md](project-goals.md) for the full rationale and design principles.

## What We've Built So Far

### Architecture Evolution

We went through several approaches before landing on the current one:

1. **Ollama-only approach (abandoned)** — Sent raw HTML to qwen3:8b for simultaneous content extraction + structured data. Failed because:
   - Squarespace HTML is massively bloated (129K per page, mostly boilerplate)
   - Processing took 40-90 seconds per page (projected 9-20 hours for 820 pages)
   - The superset YAML schema caused the model to hallucinate — filling in event/person/conference fields for simple blog posts
   
2. **Ollama with HTML stripping (improved but still slow)** — Added regex-based HTML stripping (75-97% reduction). Faster but still 38-90 seconds per page.

3. **Crawl4AI approach (current, working)** — Crawl4AI handles HTML→Markdown conversion and metadata extraction (fast, no LLM). Ollama/Claude only needed for enrichment with small prompts.

### Current Working Pipeline

```
Crawl4AI (0.7s/page, no LLM)
├── Crawls live website directly
├── Outputs clean Markdown + metadata per page
├── Extracts images, links, page structure
│
[NEXT STEP] Ollama enrichment (not yet built)
├── Input: clean Markdown (3-23K chars, not 129K)
├── Output: content_type, description, categories
│
[NEXT STEP] Claude enrichment (not yet built)
├── Complex pages only (debates, events with panelists)
├── Output: panelists, moderators, event structure
│
[NEXT STEP] Merge → final .md with YAML frontmatter
```

### Crawl Results (Completed)

- **991 pages crawled** from smartebyernorge.no
- **100% success rate** (0 failures)
- **12 minutes total** (avg 0.73s/page)
- **5.8 MB of clean Markdown** extracted
- **15,346 images** discovered
- **Content verified at 100%** across all page types (news, person profiles, tech showcases, event agendas, conference pages, static pages)

### Known Issues in Crawl Output

- **~73 HTTP duplicate pages** — `http://` versions of `https://` pages were discovered and crawled. Need to be filtered out.
- **Nav/footer in raw markdown** — The raw markdown includes navigation links and footer content. This is by design (PruningContentFilter was too aggressive, cutting actual content like panelist names). The nav/footer boilerplate is consistent and can be stripped in the enrichment phase.

### Content Types Discovered (9 archetypes)

| # | Archetype | Count | URL Pattern |
|---|-----------|-------|-------------|
| 1 | Blog Post | ~21 | `/blogg/` |
| 2 | News Article | ~55 | `/nyheter/` |
| 3 | Event/Debate (Arendalsuka) | ~82 | `/arendalsuka-blog/` |
| 4 | Conference Page | ~5 | `/evolve2021`, `/arendalsuka2022` |
| 5 | Person/Speaker | ~14 | `/person/` |
| 6 | Tech/Solution Showcase | ~5 | `/tech/` |
| 7 | Press Mention | ~5 | `/press/` |
| 8 | Static/Institutional | ~10 | `/omoss`, `/nettverk`, `/ressurser` |
| 9 | English Content | ~16 | `/english-news/`, `/about` |

Plus additional sections: smartbydugnaden-blog (~75), smartbydugnaden2020-blog (~139), evolve2021content (~107), events (~61), agendablog (~58), product (~40), tjeneste (~39), and others.

## Project File Structure

```
/Users/terje.christensen/learn/projects-2026/website-copies/
├── migration/                    # Main project directory
│   ├── crawl/                    # Crawl4AI scripts (Python)
│   │   ├── crawl_site.py         # Main crawl script — discovers and extracts all pages
│   │   ├── setup.py              # Environment verification script
│   │   └── requirements.txt      # Python deps (crawl4ai)
│   ├── crawl-output/             # 991 JSON files, one per page
│   │   ├── _index.json           # Homepage
│   │   ├── about.json
│   │   ├── arendalsuka-blog__matsikkerhet.json
│   │   └── ... (991 files total)
│   ├── reports/
│   │   └── crawl-manifest.json   # Summary of all crawled pages with timing
│   ├── lib/                      # TypeScript extraction code (from earlier Ollama approach)
│   │   ├── config.ts             # Routing config (OLLAMA_OVERRIDES, CLAUDE_PATTERNS)
│   │   ├── ollama-client.ts      # Ollama client with HTML stripping
│   │   ├── schemas.ts            # Zod schemas for 9 archetypes
│   │   └── ...
│   ├── scripts/                  # TypeScript orchestrator scripts
│   │   ├── orchestrator.ts       # Main extraction orchestrator
│   │   ├── filter-pages.ts       # Page filtering/routing
│   │   └── ...
│   ├── content/                  # Ollama-extracted .md files (3 test files from earlier)
│   │   └── blogg/
│   ├── docs/                     # Documentation
│   │   └── phase2-blueprint.md   # Archetypes, schema, CMS mappings
│   ├── package.json              # Node.js deps (ollama, zod, etc.)
│   └── tsconfig.json
├── wget/                         # wget mirror (1,693 HTML files) — used as fallback
│   └── www.smartebyernorge.no/
├── json/                         # Squarespace JSON API extraction (215 pages)
│   └── squarespace-json-export/
└── crawl4ai/                     # Original crawl4ai folder (docs only, extraction is in migration/crawl/)
    └── docs/
        ├── phase2-blueprint.md
        └── ollama-system-prompt.txt
```

## Crawl Output Format (per-page JSON)

Each file in `crawl-output/` contains:

```json
{
  "url": "https://www.smartebyernorge.no/arendalsuka-blog/matsikkerhet",
  "slug": "arendalsuka-blog__matsikkerhet",
  "url_path": "/arendalsuka-blog/matsikkerhet",
  "success": true,
  "elapsed_seconds": 0.7,
  "markdown": "Full clean Markdown content...",
  "fit_markdown": "Pruned version (may lose content)...",
  "raw_markdown": "Same as markdown field",
  "metadata": {
    "page_metadata": {},
    "images": [{"src": "...", "alt": "...", "desc": "..."}],
    "internal_links": [{"href": "...", "text": "..."}],
    "external_links": [...]
  },
  "html_length": 218980,
  "markdown_length": 23716
}
```

## Environment Setup

- **DevContainer**: `ghcr.io/terchris/devcontainer-toolbox:latest` (privileged, SYS_ADMIN)
- **Ollama**: Running on host Mac M4, accessible at `http://host.docker.internal:11434`
- **Model**: `qwen3:8b` pulled and tested (used for enrichment, not extraction)
- **Crawl4AI**: v0.8.0 installed in devcontainer with Patchright browsers
- **Node.js/TypeScript**: Available for the enrichment pipeline

## Front Matter Schema — v1 → v2

**v1 (abandoned)**: Single superset schema with 40+ fields across all archetypes. Ollama hallucinated values for fields that don't apply (e.g. filling `event.topic_lead` for blog posts).

**v2 (current)**: Per-archetype design. Common base (8 fields) + archetype-specific extras. Only relevant fields appear in front matter. Migration metadata (confidence, extraction_method) tracked in `reports/extraction-log.json`, not in front matter.

The Crawl4AI JSON format was evaluated as an alternative to front matter. Decision: **keep front matter as the standardised output**. Crawl4AI JSON is the raw material (stage 1); front matter Markdown is the product (stage 2). See [project-goals.md](project-goals.md) for the full analysis.

Full schema spec: [phase2-blueprint.md](phase2-blueprint.md) section 2.

## Next Steps

1. **Filter HTTP duplicates** — Remove the ~73 `http://` duplicate pages from crawl output
2. **Strip nav/footer** — Remove consistent boilerplate from the raw markdown (navigation links, footer newsletter signup)
3. **Ollama enrichment** — Classify content types and extract metadata from clean Markdown (should be very fast with 3-23K input instead of 129K)
4. **Claude enrichment** — Handle complex event pages (panelist extraction, debate structure)
5. **Merge** — Combine Crawl4AI markdown + Ollama/Claude metadata into final .md files with YAML frontmatter
6. **Validate** — Compare against wget mirror and JSON API data for completeness
7. **Apply to rodekors.no** — Same pipeline, just change the URL

## Key Decisions Made

- **Crawl4AI over wget+Ollama**: 100x faster (0.7s vs 60s per page), better content quality
- **Live crawl over local files**: Same pipeline works for both smartebyernorge.no and rodekors.no
- **Raw markdown over pruned**: PruningContentFilter was too aggressive, cutting titles and panelist names. Raw markdown preserves everything; nav/footer can be stripped deterministically later.
- **Separation of concerns**: Crawl4AI for content extraction (fast, no LLM), Ollama for classification/enrichment (small prompt, fast), Claude for complex pages only.
- **Front matter over Crawl4AI JSON as output format**: Front matter is human-readable, CMS-native (Hugo/Astro/Jekyll), and doesn't require downstream consumers to know about Crawl4AI. The JSON is kept as raw material only.
- **Per-archetype schemas (v2) over superset (v1)**: Prevents hallucination, produces clean front matter without empty blocks, and sends smaller schemas to the LLM.
- **Migration metadata out of front matter**: Confidence scores, extraction method, review flags go in `reports/extraction-log.json`. Front matter stays clean for CMS consumption.
