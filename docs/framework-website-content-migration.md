# Framework: AI-Powered Website Content Migration

A repeatable pipeline for migrating any website to a structured content lake
(Markdown + YAML front matter), using a powerful LLM for analysis and a small
local LLM for bulk extraction.

---

## The Big Idea

```
Powerful LLM (Claude/GPT)     →  Thinks once: analyses site, designs schemas, writes prompts
Small local LLM (Ollama)      →  Works 1000x: extracts every page using those prompts
```

The expensive model does the **thinking** (30 sample pages, ~$2).
The cheap model does the **labour** (1000 pages, ~$0, runs locally).

---

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Phase 1: DISCOVER            Crawl sample → Powerful LLM       │
│  Phase 2: CONFIGURE           Powerful LLM → schemas + prompts  │
│  Phase 3: VALIDATE CRAWL      Crawl full site → validate output │
│  Phase 4: TEST EXTRACTION     Ollama on samples → validate      │
│  Phase 5: FULL EXTRACTION     Ollama on all pages               │
│  Phase 6: POST-PROCESS        Merge CMS data, normalize         │
│  Phase 7: VERIFY              Compare against source site       │
│                                                                 │
│  Feedback loops: Phase 3→1, Phase 4→2, Phase 5→4, Phase 7→5    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: DISCOVER — Analyse the site with a powerful LLM

### Goal
Identify all content types, templates, and metadata fields on the site.

### Step 1.1: Quick crawl for URL inventory

Crawl the site in **discovery mode** — fast, shallow, just collecting URLs
and link structure. No need for full content extraction yet.

```python
# Discovery crawl — lightweight, just URLs and links
config = CrawlerRunConfig(
    cache_mode=CacheMode.BYPASS,
    word_count_threshold=5,
    # No extraction strategy — just discover pages
)
```

Output: a URL manifest with all discovered pages grouped by path prefix.

### Step 1.2: Sample crawl with full content

Pick 3-5 representative pages from each URL group. Crawl them with full
content extraction, including screenshots.

```python
# Sample crawl — full content + screenshots for LLM analysis
config = CrawlerRunConfig(
    cache_mode=CacheMode.BYPASS,
    screenshot=True,          # Visual template for the LLM
    pdf=False,
    process_iframes=True,     # Include embedded content
    remove_overlay_elements=True,  # Remove cookie banners etc
)
```

### Step 1.3: Send samples to the powerful LLM

Feed the crawled markdown + screenshots to Claude/GPT with this prompt:

```
You are analysing a website for content migration. I will give you sample
pages from different sections of the site.

For each sample, I provide:
- The URL path
- The page markdown (from Crawl4AI)
- A screenshot of the page

Your tasks:

1. CONTENT TYPES: Identify every distinct content type / template on the
   site. Two pages are the same type if they share the same layout and
   metadata fields. They are different types if one has fields the other
   doesn't (e.g., event pages have panelists, blog posts don't).

2. ARCHETYPE TABLE: For each content type, list:
   - Name (e.g., "blog", "event", "person")
   - URL patterns that match this type
   - Base fields (shared by all types): title, date, slug, etc.
   - Extra fields unique to this type
   - What the visual template looks like (article, card, grid, etc.)

3. METADATA VISIBILITY: For each field, note whether it's:
   - Visible on the page (LLM can extract it from crawled markdown)
   - Only in the CMS/API (not visible — needs API export or manual entry)

4. CRAWL4AI CONFIGURATION: For each content type, suggest:
   - css_selector to focus on the main content area
   - excluded_tags to skip (nav, footer, sidebar, etc.)
   - target_elements if the page has multiple content areas

5. EDGE CASES: Flag any pages that don't fit neatly into a type, or pages
   that might need special handling (composite layouts, paginated lists,
   redirect pages, error pages).

Output as structured JSON.
```

### Step 1.4: Human review

The LLM output is a draft. Review it:
- Are the content types correct?
- Are there types it missed?
- Do the URL patterns cover all pages?
- Are the field lists complete?

This review takes 30 minutes. It replaces 2-3 days of iterative discovery.

---

## Phase 2: CONFIGURE — Generate schemas, prompts, and Crawl4AI config

### Goal
The powerful LLM produces the actual code artifacts the pipeline needs.

### Step 2.1: Generate Zod schemas

Send the approved archetype table back to the powerful LLM:

```
Based on this archetype table, generate:

1. A Zod BaseSchema with the common fields every page has
2. Per-archetype extra schemas (EventExtras, PersonExtras, etc.)
3. Merged schemas (EventSchema = BaseSchema.merge(EventExtras))
4. A SCHEMAS lookup map: Record<ContentType, ZodSchema>
5. A REQUIRED_FIELDS map: which fields must be non-empty per type

Use the exact field names from the archetype table.
Output as a TypeScript file using the zod library.
```

### Step 2.2: Generate extraction prompts

```
Write an extraction prompt for a small local LLM (gemma3:4b via Ollama).
The LLM will receive markdown content from a crawled page and must output
valid JSON matching the schema.

Requirements:
- The LLM extracts METADATA ONLY — no body field (body comes from Crawl4AI)
- Output should be ~100-200 tokens of JSON
- Include rules for every field: where to find it, format, fallbacks
- Include the site-specific patterns you identified (date formats, author
  patterns, tag locations, Norwegian/English detection)
- The prompt must produce valid JSON with NO commentary or markdown fences
```

### Step 2.3: Generate Crawl4AI configuration per content type

The powerful LLM knows the site structure and can configure Crawl4AI
specifically for each content type:

```python
# Configuration generated by the powerful LLM
CRAWL_CONFIGS = {
    "blog": CrawlerRunConfig(
        css_selector="article.entry-content",
        excluded_tags=["nav", "footer", "aside"],
        word_count_threshold=10,
        exclude_external_links=False,   # Blog posts reference external sources
    ),
    "person": CrawlerRunConfig(
        css_selector=".person-profile",
        excluded_tags=["nav", "footer"],
        target_elements=[".bio", ".photo", ".role"],
        word_count_threshold=5,         # Person pages can be short
    ),
    "event": CrawlerRunConfig(
        css_selector=".event-content",
        excluded_tags=["nav", "footer"],
        word_count_threshold=5,
        process_iframes=True,           # Event pages may embed videos
    ),
}
```

This is a major improvement over our current approach where Crawl4AI uses
one generic config for all pages. Per-type configs mean:
- Cleaner markdown (less nav/footer noise for the LLM to parse)
- Focused content (css_selector targets the right area)
- Better extraction (the LLM receives only the relevant content)

### Step 2.4: Generate URL pattern rules

```python
# Also generated by the powerful LLM
CONTENT_TYPE_RULES = [
    { "pattern": r"^/blogg/", "type": "blog" },
    { "pattern": r"^/nyheter/", "type": "news" },
    { "pattern": r"^/person/", "type": "person" },
    { "pattern": r"^/arendalsuka-blog/", "type": "event" },
    # ... etc
]
```

### Step 2.5: Generate post-processing rules

The powerful LLM also knows what validation and normalization is needed:

```python
# Post-processing rules (generated)
POST_PROCESS = {
    "source_url": "always_construct_from_url_path",  # Never trust LLM
    "url_path": "always_use_crawl_data",             # Never trust LLM
    "tags": "lowercase_and_deduplicate",
    "date": "normalize_to_iso8601",
    "description": "must_not_equal_title",
}
```

---

## Phase 3: VALIDATE CRAWL — Full crawl with quality checks

### Goal
Crawl the full site using the per-type Crawl4AI configs and validate the
raw output before sending it to the LLM.

### Step 3.1: Full crawl

```python
for page in all_pages:
    content_type = classify_by_url(page.url)
    config = CRAWL_CONFIGS.get(content_type, DEFAULT_CONFIG)
    result = await crawler.arun(url=page.url, config=config)
```

### Step 3.2: Crawl validation (generated by powerful LLM)

The powerful LLM writes validation checks specific to this site:

```python
# Validation script (generated by the powerful LLM in Phase 2)
def validate_crawl(page):
    errors = []

    # Must have content
    if len(page.markdown) < 100:
        errors.append("very_short_content")

    # Must not be an error page
    if "404" in page.markdown[:500] and len(page.markdown) < 2000:
        errors.append("error_page")

    # Blog posts should have a date pattern
    if page.content_type == "blog":
        if not re.search(r'\d+\.\s+\w+\s+\d{4}', page.markdown):
            errors.append("missing_date_in_content")

    # Person pages should have an image
    if page.content_type == "person":
        if "![" not in page.markdown:
            errors.append("missing_profile_image")

    return errors
```

### Step 3.3: Review and iterate

If validation finds problems:
- Many error pages → add to skip list
- Content too short → CSS selector may be wrong → go back to Phase 2
- New content types discovered → go back to Phase 1
- Boilerplate not stripped → adjust excluded_tags → go back to Phase 2

---

## Phase 4: TEST EXTRACTION — Ollama on samples

### Goal
Test the LLM extraction on 5-10 pages per content type before running the
full batch.

### Step 4.1: Stratified sample

Pick 5-10 pages per content type, prioritizing:
- Typical pages (the most common layout)
- Edge cases (short pages, missing fields, non-standard dates)
- Pages with ground truth (CMS API export, if available)

### Step 4.2: Run Ollama extraction

```bash
npm run extract -- --limit 50 --sample-per-type 5
```

### Step 4.3: Validate extraction results

The powerful LLM also wrote validation for the extraction output:

```python
def validate_extraction(frontmatter, content_type):
    errors = []

    # Title must exist and not be empty
    if not frontmatter.get("title"):
        errors.append("missing_title")

    # Date must be ISO 8601 if present
    if frontmatter.get("date") and not re.match(r'\d{4}-\d{2}-\d{2}', frontmatter["date"]):
        errors.append("invalid_date_format")

    # Event pages must have event_date
    if content_type == "event" and not frontmatter.get("event_date"):
        errors.append("missing_event_date")

    # Person pages must have full_name
    if content_type == "person" and not frontmatter.get("full_name"):
        errors.append("missing_full_name")

    # Source URL must point to the right domain
    if "example.com" not in frontmatter.get("source_url", ""):
        errors.append("wrong_source_url")

    return errors
```

### Step 4.4: Iterate on prompts

If validation fails:
- Wrong field values → refine the extraction prompt → retry
- Missing fields → the LLM can't find them → check if css_selector is correct
- Hallucinated values → schema too broad → tighten per-archetype schema
- Wrong content type classification → add forced type hints from URL patterns

Each iteration: adjust prompt or schema → re-run the 50 sample pages → validate.
This costs seconds (Ollama is local), not money.

---

## Phase 5: FULL EXTRACTION — Ollama on all pages

### Goal
Run the tested, validated extraction pipeline on every page.

### Step 5.1: Full run

```bash
rm -rf content/* && npm run extract
```

With ETA tracking, token counting, slug collision resolution — all the
infrastructure we built.

### Step 5.2: Spot-check for new content types

The full run may encounter pages the sample didn't cover. Check:
- Pages that took unusually long (complex content)
- Pages that failed (LLM couldn't parse)
- Pages with empty title or content_type "page" (may be misclassified)

If new content types emerge → go back to Phase 1 with those specific pages.

---

## Phase 6: POST-PROCESS — Merge CMS data and normalize

### Goal
Overlay CMS API data onto LLM-extracted front matter for fields the LLM
can't recover from crawled HTML.

### Step 6.1: CMS API export (if available)

```
LLM can extract:     title, body, event_date, panelists (85-100%)
LLM cannot extract:  date, author, featured_image, tags, description (33-86%)
```

If the CMS has an API or export:
- Squarespace: JSON export via `/blog.json`, `/events.json`
- WordPress: REST API `/wp-json/wp/v2/posts`
- Drupal: JSON:API

Merge the API fields onto the LLM-extracted front matter:

```typescript
// Overlay CMS ground truth where available
if (jsonItem) {
    data.date = jsonItem.publishOn;
    data.author = jsonItem.author.displayName;
    data.featured_image = { src: jsonItem.assetUrl, alt: "" };
    data.tags = [...jsonItem.tags, ...jsonItem.categories];
    data.description = stripHtml(jsonItem.excerpt);
}
```

### Step 6.2: Normalize

Apply the post-processing rules from Phase 2:
- source_url: always construct from url_path
- tags: lowercase, trim, deduplicate
- dates: normalize to YYYY-MM-DD
- description: must not equal title

---

## Phase 7: VERIFY — Compare against source site

### Goal
Verify the final content lake against the live site.

### Step 7.1: Automated verification

For pages with CMS ground truth, compare field by field:

```
title:          100% match
date:            95% match (after JSON merge)
author:          95% match (after JSON merge)
featured_image:  90% match (after JSON merge)
tags:            85% match (after JSON merge + normalization)
description:     90% match (after JSON merge)
```

### Step 7.2: Visual spot-check

Open 10-20 pages side-by-side:
- Source site in the browser
- Extracted .md file in an editor

Check: is the content complete? Are images referenced? Is metadata correct?

### Step 7.3: Template rendering test

Load the content lake into a static site generator (Astro/Hugo) with
minimal templates. Does every page render? Are fields in the right places?

---

## Feedback Loops

The pipeline is not linear. Here are the expected feedback loops:

| From | To | Trigger |
|------|----|---------|
| Phase 3 (crawl validation) | Phase 1 (discovery) | New content types found |
| Phase 3 (crawl validation) | Phase 2 (configure) | CSS selectors wrong |
| Phase 4 (test extraction) | Phase 2 (configure) | Prompts need refinement |
| Phase 5 (full extraction) | Phase 4 (test) | New edge cases |
| Phase 7 (verify) | Phase 5 (extraction) | Quality below threshold |

Most iterations happen in Phase 4 (test extraction) — that's the cheap loop
(local Ollama, seconds per iteration). The expensive Phase 1-2 loop (powerful
LLM) should only happen once or twice.

---

## What the Powerful LLM Produces

After Phase 1-2, the powerful LLM has generated all site-specific artifacts:

| Artifact | Purpose | Used by |
|----------|---------|---------|
| Archetype table | Content type definitions | Human reference |
| Zod schemas | Typed extraction schemas | Ollama extraction |
| Extraction prompts | LLM instructions per type | Ollama extraction |
| Crawl4AI configs | Per-type crawl settings | Crawl4AI |
| URL pattern rules | Content type routing | Orchestrator |
| Post-processing rules | Normalization logic | Orchestrator |
| Crawl validation script | Crawl output quality | Phase 3 |
| Extraction validation script | Extraction quality | Phase 4 |

Everything else in the pipeline is **generic** — the orchestrator, slug
dedup, ETA tracking, front matter generation, etc. Only the above artifacts
change between sites.

---

## What's Generic (Reusable Across Any Site)

| Component | What it does |
|-----------|-------------|
| Crawl4AI runner | Crawl with per-type configs |
| Orchestrator | Batch extraction with concurrency, ETA, tokens |
| Ollama client | Send markdown → get JSON, handle retries, two-pass |
| Slug dedup | Detect and resolve filename collisions |
| Post-processor | Apply normalization rules to LLM output |
| Front matter writer | Build .md files from metadata + body |
| Verification runner | Compare extraction against ground truth |
| Clean-body | Strip boilerplate from crawled markdown |

These components make up ~80% of the codebase and don't change between
sites. The 20% that changes is what the powerful LLM generates.

---

## Crawl4AI Features We Should Use

Our current crawl script uses a generic config for all pages. Here's what
Crawl4AI offers that would improve the pipeline:

### Per-type CSS selectors
```python
css_selector="article.entry-content"  # Focus on the article body
```
Strips nav, sidebar, footer at crawl time — cleaner markdown for the LLM.

### Excluded tags
```python
excluded_tags=["nav", "footer", "aside", "header"]
```
Removes structural elements before markdown conversion. Replaces our
manual `clean-body.ts` regex patterns.

### Target elements
```python
target_elements=[".article-body", ".author-bio"]
```
Focus markdown on specific areas while still extracting links/images from
the full page.

### Excluded selectors
```python
excluded_selector="#cookie-banner, .newsletter-signup, .social-share"
```
Remove specific elements by CSS selector. More precise than excluded_tags.

### JsonCssExtractionStrategy
```python
schema = {
    "baseSelector": "article.post",
    "fields": [
        {"name": "title", "selector": "h1", "type": "text"},
        {"name": "author", "selector": ".author", "type": "text"},
        {"name": "date", "selector": "time", "type": "attribute", "attribute": "datetime"},
    ]
}
config = CrawlerRunConfig(
    extraction_strategy=JsonCssExtractionStrategy(schema)
)
```
Extract structured metadata directly from HTML using CSS selectors —
**without any LLM**. For fields that are reliably in the DOM (title, date,
author in a byline), this is faster and more accurate than LLM extraction.

### Screenshots
```python
config = CrawlerRunConfig(screenshot=True)
```
Capture page screenshots for the powerful LLM to analyse visual templates.

### JavaScript execution
```python
config = CrawlerRunConfig(
    js_code="document.querySelector('.load-more')?.click();",
    wait_for="css:.content-loaded",
)
```
Handle dynamic content, infinite scroll, or lazy-loaded elements.

### Anti-bot measures
```python
config = CrawlerRunConfig(
    simulate_user=True,
    magic=True,  # Auto-handle popups
)
```

---

## Hybrid Extraction: CSS + LLM

The most promising optimization: use Crawl4AI's `JsonCssExtractionStrategy`
for fields that are reliably in the DOM, and only use the LLM for fields
that require understanding.

```
Crawl4AI CSS extraction (free, instant):
  - title (from h1 or <title>)
  - date (from <time datetime="...">)
  - author (from .author or byline element)
  - featured_image (from og:image meta tag)
  - tags (from .tag-list links)
  - canonical URL (from <link rel="canonical">)

Ollama LLM extraction (8s/page, local):
  - content_type classification
  - description (first paragraph summary)
  - panelists (from free-text Norwegian prose)
  - moderator (from various Norwegian patterns)
  - event_time, venue (from varied formats)
  - language detection
```

This means the LLM receives **pre-extracted structured metadata** alongside
the markdown, and only needs to fill in the gaps. Faster, cheaper, more
accurate.

### How the powerful LLM enables this

When analysing the site in Phase 1, the powerful LLM can look at the HTML
structure (not just the markdown) and produce CSS selectors for each field:

```json
{
  "content_type": "blog",
  "css_extractable_fields": {
    "title": "h1.entry-title",
    "date": "time.published[datetime]",
    "author": "span.author-name",
    "tags": "ul.tag-list li a"
  },
  "llm_required_fields": {
    "description": "first paragraph after title, max 300 chars",
    "content_type": "classify based on URL and content"
  }
}
```

---

## Project Structure

```
website-migration/
├── crawl/
│   ├── crawl_site.py              # Generic Crawl4AI runner
│   └── crawl_configs/             # Per-site crawl configs (generated)
│       └── smartebyernorge.json
├── lib/
│   ├── config.ts                  # Generic pipeline config
│   ├── schemas.ts                 # Per-site Zod schemas (generated)
│   ├── prompts.ts                 # Per-site extraction prompts (generated)
│   ├── ollama-client.ts           # Generic Ollama client
│   ├── clean-body.ts              # Per-site boilerplate rules (generated)
│   └── post-process.ts            # Per-site normalization rules (generated)
├── scripts/
│   ├── orchestrator.ts            # Generic extraction orchestrator
│   ├── analyse-site.ts            # Phase 1: send samples to powerful LLM
│   ├── validate-crawl.ts          # Phase 3: validate crawl output
│   ├── validate-extraction.ts     # Phase 4: validate extraction output
│   └── verify-against-source.ts   # Phase 7: compare with source site
├── content/                       # Output: the content lake
├── reports/                       # Extraction logs, verification reports
└── docs/
    └── archetype-table.md         # The master reference (generated + reviewed)
```

Files marked **(generated)** are produced by the powerful LLM in Phase 1-2
and reviewed by a human. Everything else is generic and reusable.

---

## Cost Model

For a 1000-page site:

| Phase | Model | Pages | Cost |
|-------|-------|-------|------|
| Phase 1: Analyse | Claude | 30 samples | ~$2 |
| Phase 2: Generate | Claude | 1 call | ~$0.50 |
| Phase 3: Crawl | Crawl4AI | 1000 pages | $0 (local) |
| Phase 4: Test | Ollama | 50 pages | $0 (local) |
| Phase 5: Full | Ollama | 1000 pages | $0 (local) |
| Phase 7: Verify | Claude | 20 spot checks | ~$1 |
| **Total** | | | **~$3.50** |

Compare: sending all 1000 pages to Claude = ~$50-100.

---

## Making This a GitHub Project

### What exists today (in our migration repo)
- Crawl4AI runner (generic, needs per-site config)
- Orchestrator with ETA, tokens, slug dedup (generic)
- Ollama client with two-pass extraction (generic)
- Zod schemas, prompts, clean-body (site-specific, manually written)

### What needs to be built
1. **`analyse-site.ts`** — Phase 1 automation: crawl samples, send to Claude,
   get archetype table + configs
2. **`generate-pipeline.ts`** — Phase 2 automation: take archetype table,
   produce schemas.ts, prompts.ts, clean-body.ts, crawl configs
3. **`validate-crawl.ts`** — Phase 3: run site-specific validation on crawl output
4. **`validate-extraction.ts`** — Phase 4: run per-type validation on extraction
5. **Hybrid extraction** — combine CSS extraction + LLM extraction
6. **CLI** — `npx migrate-site https://example.com` end-to-end

### The value proposition
> Point this tool at any website. A powerful LLM analyses it, designs the
> extraction pipeline, and generates all site-specific code. Then a local
> LLM runs the bulk extraction for free. You get a content lake in
> Markdown + YAML front matter, ready for any static site generator.

No other project does this because nobody has combined the analysis step
(powerful LLM) with the extraction step (local LLM) into a single pipeline
with feedback loops.
