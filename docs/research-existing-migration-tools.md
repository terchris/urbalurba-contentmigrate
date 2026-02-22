# Research: Existing Content Migration Tools and Landscape

**Date**: 2026-02-22
**Status**: Complete
**Purpose**: Determine whether existing tools can replace our pipeline, or whether we should build a generic system. This document supports [INVESTIGATE-generic-content-migration-system.md](ai-developer/plans/active/INVESTIGATE-generic-content-migration-system.md) Phase 1.

---

## Executive Summary

No existing tool does what our pipeline does: **analyse a website with a powerful LLM to auto-generate schemas and prompts, then bulk-extract every page into per-content-type structured, machine-readable data using a local LLM**.

The landscape breaks into three categories:
1. **Web scrapers** — crawl and convert HTML to markdown (Crawl4AI, Firecrawl, Jina Reader). They handle Step 1 of our pipeline but don't produce structured front matter.
2. **CMS exporters** — export from a specific CMS (WordPress-to-Hugo, Squarespace XML export). They produce structured output but only work with one source platform.
3. **Enterprise migration services** — commercial agencies and SaaS (Infogain, aisite.ai, Messagepoint). Expensive, proprietary, not reusable.

Our unique contribution is the **two-tier LLM architecture** (powerful LLM thinks once, local LLM works 1000×) combined with **per-content-type schemas** and **feedback loops**. Nothing in the landscape combines these three ideas.

**Recommendation**: Build it. The gap is real and none of the existing tools are heading in this direction.

---

## Category 1: Web Scrapers & HTML-to-Markdown Tools

These tools crawl websites and convert HTML to clean markdown. They're good at the crawling step but don't produce structured metadata.

### Crawl4AI

- **What**: Open-source Python async crawler, 50k+ GitHub stars
- **URL**: https://github.com/unclecode/crawl4ai
- **Strengths**: Free, local, fast, LLM-friendly markdown output, CSS-based extraction strategy (JsonCssExtractionStrategy), per-page config, JS rendering via Playwright
- **Output**: Clean markdown per page, optional structured JSON via CSS or LLM strategies
- **What it doesn't do**: No content type analysis, no schema generation, no YAML front matter, no site-wide pipeline orchestration
- **Relevance to us**: We already use Crawl4AI for crawling. It's a component of our pipeline, not a competitor to the full system.

### Firecrawl

- **What**: Web scraping API (SaaS + self-hostable, AGPL-3.0)
- **URL**: https://github.com/firecrawl/firecrawl
- **Strengths**: Fast, handles JS rendering, clean markdown, structured extraction via `/extract` endpoint with JSON Schema, wildcard URL support, agent mode
- **Output**: Markdown, HTML, structured JSON, screenshots
- **Pricing**: Free tier (500 credits), Hobby $16/mo, Standard $83/mo. Extract uses token-based billing. Self-hosting possible via Docker/Railway (~$5-10/mo).
- **What it doesn't do**: The `/extract` endpoint collates data across pages into one response — it doesn't produce per-page structured files with front matter. No content type discovery. No local LLM option. No pipeline with feedback loops.
- **Relevance to us**: Firecrawl could replace Crawl4AI as the crawler component. But it doesn't replace the analysis, schema generation, or per-page extraction pipeline. Its `/extract` is designed for pulling specific data points (e.g., "company mission" across 10 pages), not for migrating 1000 pages each with their own front matter.

### Jina Reader / ReaderLM-v2

- **What**: API and 1.5B model for HTML-to-markdown and HTML-to-JSON
- **URL**: https://jina.ai/reader/
- **Strengths**: Simple API (prefix any URL with `r.jina.ai/`), supports JSON Schema extraction via headers, ReaderLM-v2 outperforms larger models on HTML-to-markdown benchmarks
- **Output**: Markdown or structured JSON per page
- **What it doesn't do**: Single-page only (no site crawling), no content type discovery, no pipeline orchestration, no YAML front matter
- **Relevance to us**: Could be an alternative extraction engine for individual pages. Doesn't replace the pipeline.

### Spider.cloud

- **What**: Fast web scraping API built in Rust
- **URL**: https://spider.cloud/
- **Strengths**: Extremely fast (182+ pages/s), markdown output, structured extraction
- **What it doesn't do**: Same gap as Firecrawl — crawling and conversion only, no analysis or schema generation
- **Relevance to us**: Speed advantage for large sites, but doesn't address our pipeline needs.

### ScrapeGraphAI (deep-dive — closest competitor)

- **What**: Python scraping library using LLM + graph logic
- **URL**: https://github.com/ScrapeGraphAI/Scrapegraph-ai
- **Strengths**: LLM-agnostic (OpenAI, Gemini, Ollama), prompt-first extraction (describe fields, LLM infers structure), supports Pydantic/Zod output schemas, multi-page pipelines via `SmartScraperMultiGraph`, async/parallel execution
- **Output**: Structured JSON matching user-defined schema

**Could ScrapeGraphAI replicate our smartebyernorge.no results?**

No — not without rebuilding most of our pipeline on top of it. Specific gaps:

1. **One prompt + one schema for all pages.** `SmartScraperMultiGraph` sends the same prompt and schema to every URL. smartebyernorge.no has 9 content types with different fields (events have panelists, persons have job_title, press has source_publication). Using a superset schema causes the exact hallucination problem we solved — the LLM invents panelists for blog posts. You'd have to manually split URLs into 9 groups and run 9 extractions, which is what our pipeline automates.

2. **No content type discovery.** Nobody tells ScrapeGraphAI that `/arendalsuka-blog/` pages are events. You do the analysis yourself, write the URL routing, create each schema. That's our Phase 1-2 — the most valuable part.

3. **No two-tier LLM.** Same LLM for every page. With Ollama (gemma3:4b) it misclassifies debate pages as blog posts. With Claude for everything, 1000 pages costs $50-100+ instead of ~$3.50.

4. **No output pipeline.** Returns JSON dicts. You'd write your own code for: merge JSON with markdown body, generate slugs, handle slug collisions, write files to content-type directories. That's our orchestrator.

5. **No post-processing or feedback loops.** No date normalization, source_url construction, tag deduplication, validation against schemas, or crawl quality checks.

6. **Scale concerns.** ScrapeGraphAI's own docs state it's for "data exploration and research purposes." No built-in ETA tracking, retry logic, or batch orchestration for 918 pages.

**Bottom line**: ScrapeGraphAI is a good LLM extraction library — it handles the "give page to LLM with schema, get JSON" step. It's roughly equivalent to our `ollama-client.ts` (~50 lines), not to the full system. If you used it for smartebyernorge.no, you'd end up building our pipeline around it anyway.

### Other Notable Tools

| Tool | What it does | Gap vs our pipeline |
|------|-------------|-------------------|
| [Markdowner](https://github.com/supermemoryai/markdowner) | Convert URLs to LLM-ready markdown via Cloudflare Workers | No structured extraction, no front matter |
| [DOM-to-Semantic-Markdown](https://github.com/romansky/dom-to-semantic-markdown) | Convert HTML DOM to semantic markdown with main content detection | Library, not a pipeline. No metadata extraction |
| [Microsoft MarkItDown](https://github.com/microsoft/markitdown) | Convert documents (PDF, Word, etc.) to markdown | Document conversion, not website migration |
| [E2M](https://github.com/Jing-yilin/E2M) | Convert everything (URLs, docs) to markdown | Single-page conversion, no pipeline |

---

## Category 2: CMS-Specific Exporters

These tools export content from a specific CMS into Markdown + YAML front matter. They produce exactly the output format we want — but only for one source platform.

### WordPress Exporters

| Tool | Approach | Limitations |
|------|---------|------------|
| [wordpress-to-hugo-exporter](https://github.com/SchumacherFM/wordpress-to-hugo-exporter) | WordPress plugin, one-click export to Markdown + YAML | Requires WordPress admin access. WordPress only. |
| [wordpress-to-jekyll-exporter](https://github.com/benbalter/wordpress-to-jekyll-exporter) | WordPress plugin, exports posts/pages/taxonomies/metadata | WordPress only. Works for Hugo/Jekyll/any MD-based SSG. |
| [Export-WordPress-to-Hugo](https://github.com/petervanderdoes/Export-WordPress-to-Hugo) | WordPress plugin with custom post types + taxonomies | WordPress only. |
| [wordpress-export-to-markdown](https://github.com/lonekorean/wordpress-export-to-markdown) | Converts WordPress XML export to markdown files | Requires XML export. Loses some metadata. |

**Key insight**: These are mature and work well — but they require access to the CMS admin panel or an API export. They can't migrate a website you don't have admin access to.

### Squarespace Export

Squarespace provides a built-in XML export (WordPress-compatible format). You can then use the WordPress importers above. But the export is limited — it doesn't include all content types, images are referenced by CDN URL, and structured data (panelists, event times) is embedded in HTML and not extracted.

### Hugo's Migration Tools Page

Hugo maintains a [list of migration tools](https://gohugo.io/tools/migrations/) covering WordPress, Jekyll, Drupal, Blogger, Tumblr, and others. All are CMS-specific.

### Astro and Eleventy

Both have migration guides but no automated tools. Astro suggests using WordPress exporters and manually adjusting front matter. Eleventy has a CLI importer that converts data sources to static files.

---

## Category 3: Commercial / Enterprise Migration Services

These are paid services targeting large-scale CMS migrations.

### [Infogain Content Migrator](https://www.infogain.com/blog/ai-driven-content-ops-transformation-beyond-lift-and-shift/)

- **What**: AI-powered headless content migration framework
- **Approach**: Uses RAG + component analysis to auto-generate Component JSONs from page analysis. Stores patterns in VectorDB for reuse.
- **Claims**: 60% reduction in migration timelines, pixel-level accuracy
- **Gap**: Enterprise service, not open-source or reusable. Focused on CMS-to-CMS migration (not CMS-to-content-lake).

### [aisite.ai](https://aisite.ai/)

- **What**: Commercial website migration service
- **Approach**: AI-enhanced data extraction with proprietary algorithms
- **Gap**: Closed platform, migrates to specific target platforms (not generic Markdown).

### [Webnode AI Migration Tool](https://www.webnode.com/ai-migration-tool/)

- **What**: Automated website migration to Webnode's platform
- **Gap**: Vendor-locked. Migrates TO Webnode, not to portable content.

### [Messagepoint Rationalizer](https://www.messagepoint.com/product/rationalizer/)

- **What**: AI-powered content analysis and metadata tagging
- **Approach**: NLP-based content classification, semantic similarity detection
- **Gap**: Enterprise document management, not website migration.

### [Quark AI Content Conversion](https://www.quark.com/ai-powered-content/conversion-structuring)

- **What**: AI-driven conversion of static files to modular, metadata-rich components
- **Gap**: Enterprise document management (PDFs, Word docs), not website crawling.

### Migration Agencies (Flow Ninja, etc.)

Manual services that migrate between specific platforms (e.g., Squarespace → Webflow). Human-powered, expensive ($5,000-50,000+), not reusable.

---

## Category 4: Related Approaches (Not Direct Competitors)

### [Cisco's AI-Assisted Content Migration](https://blogs.cisco.com/innovation/lessons-from-an-ai-assisted-content-migration)

Cisco/Splunk migrated ~30,000 HTML files into DITA XML using GPT-4 + Python scripts. Key lessons:
- AI as implementer, not architect — human defines the architecture
- Small incremental commits, extensive testing
- AI struggled with large script contexts and edge cases
- Domain expertise still essential

**Relevance**: Similar philosophy to ours (AI does the bulk work, human reviews). But their pipeline was custom Python scripts, not a reusable tool.

### Headless CMS Tools ([Front Matter](https://frontmatter.codes/), [Decap CMS](https://decapcms.org/), [CloudCannon](https://cloudcannon.com/))

These manage Markdown + YAML content but don't migrate websites. They're potential **consumers** of our output, not competitors.

---

## Comparison Matrix

| Capability | Our Pipeline | Crawl4AI | Firecrawl | ScrapeGraphAI | WP Exporters | Enterprise Services |
|-----------|-------------|---------|-----------|--------------|-------------|-------------------|
| Crawl any website (no admin access) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Auto-discover content types | ✅ | ❌ | ❌ | ❌ | N/A (knows types) | ✅ (proprietary) |
| Generate per-type schemas | ✅ | ❌ | ❌ | ❌ | N/A (hardcoded) | ✅ (proprietary) |
| Generate extraction prompts | ✅ | ❌ | ❌ | ❌ | N/A | ✅ (proprietary) |
| Per-page structured output (JSON/YAML) | ✅ | ❌ | ❌ | ✅ (JSON only) | ✅ | Varies |
| Per-content-type schemas | ✅ | ❌ | ❌ | ❌ (one schema for all) | ✅ | Varies |
| Local LLM for bulk work ($0) | ✅ | ❌ | ❌ | ✅ (Ollama) | N/A | ❌ |
| Two-tier LLM (smart + cheap) | ✅ | ❌ | ❌ | ❌ | N/A | ❌ |
| Feedback loops | ✅ | ❌ | ❌ | ❌ | N/A | Varies |
| Open source | ✅ | ✅ | ✅ (AGPL) | ✅ | ✅ | ❌ |
| Works offline (no cloud API needed) | Partially | ✅ | ❌ (SaaS) | ✅ (Ollama) | ✅ | ❌ |
| Cost for 1000 pages | ~$3.50 | $0 (crawl only) | $80-200+ | $50-100+ | $0 | $5,000-50,000+ |
| Portable output (Hugo/Astro/any SSG) | ✅ | ❌ | ❌ | ❌ | ✅ (mostly) | Varies |

---

## Gap Analysis: What's Missing in the Landscape

### Nobody combines these three ideas:

1. **Powerful LLM analyses the site once** — identifies content types, generates schemas, writes extraction prompts. This is the "architecture" step.

2. **Local LLM does the bulk extraction** — runs on your machine, costs nothing, uses the generated prompts. This is the "labour" step.

3. **Per-content-type schemas prevent hallucination** — the local LLM only sees fields relevant to the page it's extracting. No superset schema, no invented data.

### The closest things:

- **ScrapeGraphAI** has LLM-based extraction with Pydantic/Zod schema support and works with Ollama. But it uses one schema for all pages, doesn't discover content types, doesn't have a two-tier approach, and doesn't handle the orchestration (slug dedup, post-processing, file output). See the deep-dive in Category 1 above.
- **Firecrawl /extract** has schema-based extraction. But it collates across pages (not per-page output), doesn't discover content types, and requires a cloud API.
- **WordPress exporters** produce per-page structured output with front matter. But they require CMS admin access and only work for WordPress.

### The unique value proposition:

> Point this tool at any website. A powerful LLM analyses it once (~$3), discovers content types, and generates all site-specific configuration. Then a local LLM extracts every page for free. You get a content lake in Markdown + YAML front matter, ready for any static site generator.

No existing tool, service, or framework offers this end-to-end capability.

---

## Recommendation

**Build it.** The gap is real:

1. **Web scrapers** stop at markdown — they don't produce structured, typed content.
2. **CMS exporters** produce structured content — but only from a specific CMS you have admin access to.
3. **Enterprise services** do end-to-end migration — but they're proprietary and expensive.

Our pipeline sits in the intersection: **structured, typed content from any website, cheaply**. The two-tier LLM approach is the key differentiator — it makes the economics work (analyse once for $3, extract 1000 pages for $0).

### Build-vs-buy summary

| Option | Verdict | Reason |
|--------|---------|--------|
| Use Crawl4AI only | ❌ Insufficient | Crawling component only, no structured extraction |
| Use Firecrawl | ❌ Insufficient | No per-page front matter, no content type discovery, SaaS costs |
| Use ScrapeGraphAI | ❌ Insufficient | No two-tier LLM, no content type discovery, expensive at scale |
| Use WordPress exporter | ❌ Insufficient | WordPress only, requires admin access |
| Hire migration agency | ❌ Expensive | $5k-50k, not reusable, no open-source output |
| **Build generic system** | ✅ Recommended | Unique approach, proven on smartebyernorge.no, 80% already built |

### Design principle: only build what nobody else does

We should **not** reimplement crawling, HTML-to-markdown, LLM client wrappers, or schema validation. Existing open-source tools do these well. We should only build the layer that nobody provides:

| We build | We delegate to |
|----------|---------------|
| Content type discovery (powerful LLM analyses site, identifies types) | Crawling → [Crawl4AI](https://github.com/unclecode/crawl4ai) |
| Per-type schema + prompt generation | HTML-to-markdown → Crawl4AI |
| Per-type routing (each page → right schema) | Local LLM calls → [Ollama](https://ollama.com/) |
| Pipeline orchestration with feedback loops | Schema validation → Zod (already using) |
| Configuration format for site-specific settings | Cloud LLM calls → Anthropic/OpenAI SDKs |
| CLI interface | CSS extraction → Crawl4AI JsonCssExtractionStrategy |

The unique value is **the intelligence layer**: analyse a site, figure out its content structure, generate the extraction configuration, and orchestrate the per-type extraction. Everything below that layer is commodity.

**Positioning**: We are not competing with Crawl4AI, Ollama, or any of the tools listed above. We are **enhancing** them. A developer using Crawl4AI today still has to figure out content types, write schemas, build prompts, and wire up the extraction pipeline manually. We automate that entire layer. Every user of our system becomes a Crawl4AI user and an Ollama user — we drive adoption of the tools we build on, not replace them.

---

## What We Should Learn From Existing Open-Source Projects

If we build, we don't start from scratch — the open-source landscape has solved many of the sub-problems well. Here's what to study and potentially adopt from each project.

### From [Crawl4AI](https://github.com/unclecode/crawl4ai) — crawling architecture

We already use Crawl4AI, but we're only using basic features. Things to learn:

- **JsonCssExtractionStrategy** — extract structured fields directly from HTML using CSS selectors, no LLM needed. For fields reliably in the DOM (title from `<h1>`, date from `<time datetime="">`, author from `.byline`), this is faster, cheaper, and more accurate than LLM extraction. Our framework doc describes this as "hybrid CSS + LLM extraction" — Crawl4AI already has the CSS side built.
- **Per-type crawl configs** — `css_selector`, `excluded_tags`, `excluded_selector` per content type. Cleaner input markdown = better LLM extraction.
- **Async crawling with session management** — Crawl4AI's `AsyncWebCrawler` handles browser reuse, concurrent pages, and rate limiting. Study their session and caching patterns.
- **Anti-bot handling** — `simulate_user=True`, `magic=True` for popup handling. Important for sites with aggressive bot detection.

### From [Firecrawl](https://github.com/firecrawl/firecrawl) — API design and developer experience

Firecrawl has excellent DX. Things to learn:

- **Simple URL-in, structured-data-out API** — their `/scrape` and `/extract` endpoints are clean. One URL, one schema, one response. Our CLI should feel this simple for the common case.
- **Wildcard URL support** — `example.com/*` to crawl an entire site. Clean pattern for specifying scope.
- **Self-hosting option** — Firecrawl is open-source (AGPL) and can run via Docker. Study how they package for self-hosting while also offering a SaaS version. We should support both local-only and hosted modes.
- **SDK design** — they offer SDKs in Python, Node, Go, Rust. Look at their Node SDK for how they structure the client interface — async by default, streaming support, typed responses.

### From [ScrapeGraphAI](https://github.com/ScrapeGraphAI/Scrapegraph-ai) — LLM extraction patterns

ScrapeGraphAI has the best prompt-to-structured-data approach. Things to learn:

- **Pydantic/Zod schema as output contract** — pass a schema, get typed JSON back. We already use Zod, but study how they validate and retry on schema violations. Their error handling for malformed LLM output is more mature.
- **Graph-based pipeline composition** — their "graphs" (SmartScraperGraph, SearchGraph, etc.) are composable pipeline steps. Consider whether our phases could be modeled as a pluggable graph/pipeline architecture.
- **Multi-model support** — they abstract over OpenAI, Gemini, Ollama, Azure, Groq with a single config. Our system should make it easy to swap LLM providers for both the "smart" and "cheap" tiers.
- **Prompt engineering patterns** — study their system prompts for extraction. They've iterated on how to get clean JSON from LLMs.

### From WordPress exporters ([hugo](https://github.com/SchumacherFM/wordpress-to-hugo-exporter), [jekyll](https://github.com/benbalter/wordpress-to-jekyll-exporter)) — output format and CMS mapping

The WordPress-to-Hugo/Jekyll exporters are the gold standard for structured content output. Things to learn:

- **Front matter field conventions** — they've standardized how to represent dates (`date`, `lastmod`), authors (string vs array), taxonomies (`tags`, `categories`), images (`featured_image` with src/alt), and drafts (`draft: true`). Follow their conventions so our output is immediately compatible with Hugo/Jekyll/Astro.
- **Directory structure mapping** — `content/{section}/{slug}.md` is a Hugo convention that works everywhere. Study how they map CMS categories to directory structure.
- **Taxonomy handling** — how they merge WordPress categories and tags, handle hierarchical taxonomies, and deal with duplicate/similar terms. Our post-processing should learn from this.
- **Image handling** — how they reference images (CDN URL vs local path vs relative path), download and organize them, and preserve alt text.

### From [Jina ReaderLM-v2](https://huggingface.co/jinaai/ReaderLM-v2) — small model extraction

ReaderLM-v2 is a 1.5B model that outperforms 32B models on HTML-to-markdown. Things to learn:

- **Specialized small models beat general large models** — for the specific task of HTML-to-structured-data, a fine-tuned small model can be better than a general-purpose large model. Consider whether we should fine-tune or recommend specific models for the bulk extraction step rather than relying on generic Ollama models.
- **JSON schema extraction via headers** — Jina's `x-json-schema` header approach is elegant. Describe what you want, get it back. Study whether we could use ReaderLM-v2 as an alternative extraction engine alongside Ollama.

### From [Infogain](https://www.infogain.com/blog/ai-driven-content-ops-transformation-beyond-lift-and-shift/) — pattern reuse across sites

Their enterprise framework stores migration patterns in a VectorDB. Things to learn:

- **Pattern library** — once you've migrated a Squarespace blog, the next Squarespace blog is 80% the same. Consider building a library of site-type templates (Squarespace blog, WordPress news site, Drupal agency site) that the powerful LLM can reference when generating configuration for a new site.
- **Component recognition** — they analyse page components (header, article body, sidebar, footer) and reuse component extraction patterns. Our per-type CSS selectors could become a reusable component library.

### From [Cisco's migration](https://blogs.cisco.com/innovation/lessons-from-an-ai-assisted-content-migration) — process lessons

Their 30,000-file migration with GPT-4 produced practical lessons:

- **AI as implementer, not architect** — the human defines the content architecture, the AI does the extraction. This matches our two-tier approach. Don't try to fully automate the analysis step — human review of content types is essential.
- **Incremental commits and testing** — don't run 1000 pages and hope for the best. Run 10, validate, adjust, run 50, validate, run all. Our feedback loops already do this, but we should make the iteration cycle as fast as possible.
- **Edge cases break AI** — the long tail of unusual pages requires human judgment. Build good tooling for identifying and handling edge cases rather than trying to automate them away.

### Summary: what to use vs what to study

| Project | Use directly? | Study and learn from |
|---------|:------------:|---------------------|
| [Crawl4AI](https://github.com/unclecode/crawl4ai) | ✅ Keep as crawler | CSS extraction strategy, per-type configs, async patterns |
| [Firecrawl](https://github.com/firecrawl/firecrawl) | ❌ | API design, DX, self-hosting packaging, SDK patterns |
| [ScrapeGraphAI](https://github.com/ScrapeGraphAI/Scrapegraph-ai) | ❌ | Schema validation, multi-model abstraction, prompt patterns |
| [WP exporters](https://github.com/SchumacherFM/wordpress-to-hugo-exporter) | ❌ | Front matter conventions, directory structure, taxonomy handling |
| [Jina ReaderLM-v2](https://huggingface.co/jinaai/ReaderLM-v2) | Maybe as alt engine | Specialized small models, schema-header extraction |
| [Infogain](https://www.infogain.com/blog/ai-driven-content-ops-transformation-beyond-lift-and-shift/) | ❌ (proprietary) | Pattern reuse across sites, component recognition |
| [Cisco case study](https://blogs.cisco.com/innovation/lessons-from-an-ai-assisted-content-migration) | N/A | Process discipline, incremental validation, edge case handling |

---

## Sources (quick-reference index)

All URLs are also linked inline where each tool is discussed.

### Web Scrapers & Tools
- [Crawl4AI](https://github.com/unclecode/crawl4ai) — Open-source LLM-friendly web crawler
- [Firecrawl](https://github.com/firecrawl/firecrawl) — Web data API for AI
- [Firecrawl Extract docs](https://docs.firecrawl.dev/features/extract) — Structured extraction endpoint
- [Jina Reader](https://jina.ai/reader/) — URL-to-markdown API
- [ReaderLM-v2](https://huggingface.co/jinaai/ReaderLM-v2) — 1.5B model for HTML-to-markdown
- [Spider.cloud](https://spider.cloud/) — Fast web scraping API
- [ScrapeGraphAI](https://github.com/ScrapeGraphAI/Scrapegraph-ai) — LLM-powered Python scraper
- [Markdowner](https://github.com/supermemoryai/markdowner) — URL to LLM-ready markdown
- [DOM-to-Semantic-Markdown](https://github.com/romansky/dom-to-semantic-markdown) — HTML DOM to semantic markdown

### CMS Exporters
- [Hugo Migration Tools](https://gohugo.io/tools/migrations/) — List of migration tools for Hugo
- [WordPress to Hugo Exporter](https://github.com/SchumacherFM/wordpress-to-hugo-exporter) — WordPress plugin
- [WordPress to Jekyll Exporter](https://github.com/benbalter/wordpress-to-jekyll-exporter) — WordPress plugin for any MD-based SSG
- [Astro WordPress Migration Guide](https://docs.astro.build/en/guides/migrate-to-astro/from-wordpress/) — Astro migration docs
- [Eleventy WordPress Migration](https://www.11ty.dev/docs/migrate/wordpress/) — Eleventy migration docs

### Enterprise & Commercial
- [Infogain AI Content Migration](https://www.infogain.com/blog/ai-driven-content-ops-transformation-beyond-lift-and-shift/) — Enterprise AI migration framework
- [Cisco AI-Assisted Migration](https://blogs.cisco.com/innovation/lessons-from-an-ai-assisted-content-migration) — Case study: 30k HTML files to DITA
- [aisite.ai](https://aisite.ai/) — Commercial migration service
- [Messagepoint Rationalizer](https://www.messagepoint.com/product/rationalizer/) — AI content analysis
- [Webnode Migration Tool](https://www.webnode.com/ai-migration-tool/) — Platform-specific migration

### Benchmarks & Comparisons
- [Firecrawl vs Crawl4AI vs Spider](https://spider.cloud/blog/firecrawl-vs-crawl4ai-vs-spider-honest-benchmark) — Performance comparison
- [Firecrawl Alternatives](https://www.eesel.ai/blog/firecrawl-alternatives) — Market overview
- [Open-Source Web Scraping Revolution](https://medium.com/@tuguidragos/the-open-source-web-scraping-revolution-a-deep-dive-into-scrapegraphai-crawl4ai-and-the-future-d3a048cb448f) — Framework comparison
