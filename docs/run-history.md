# Extraction Run History

This document records the iteration history from the first real-world migration (smartebyernorge.no, ~1000 pages on Squarespace). These metrics and lessons apply to any site migrated with this pipeline.

## Site Profile

- **Source**: smartebyernorge.no (Squarespace)
- **Pages crawled**: 991 (Crawl4AI)
- **Pages after dedup/filtering**: 918
- **Content types**: blog, news, event, conference, person, tech, press, page, english_news
- **Model**: Ollama gemma3:4b (bulk), Claude claude-sonnet-4-20250514 (complex events)

---

## Run 1 — Baseline

**Date**: 2026-02-15

| Metric | Value |
|--------|-------|
| Pages processed | 918 |
| Success | 865 (94.2%) |
| Failed | 53 |
| Wall clock | ~2h 30m |
| Avg per page | ~9.8s |

### Quality issues found

| Issue | Count | Root cause |
|-------|-------|------------|
| Wrong `source_url` | 127 | LLM grabbed external links from body text instead of the page's own URL |
| `description` = `title` | 137 | LLM copied title as description when no meta description existed |
| Uppercase tags | 1,296 of 3,455 | LLM preserved whatever case it found on the page |
| Error pages extracted | ~15 | 404/503 pages were passed to the LLM and got garbage output |
| Missing dates | ~20 | LLM returned empty string instead of extracting from page content |

### Verification against Squarespace JSON (43 matched pages)

| Field | Accuracy |
|-------|----------|
| title | 100% |
| body | 100% |
| date | 86% |
| author | 85% |
| featured_image | 58% |
| tags | 50% |
| description | 33% |

**Key insight**: The LLM is excellent at extracting structured fields that appear literally in the content (title, body, date, author). It struggles with fields that require synthesis (description) or exact URL construction (source_url, featured_image).

---

## Fixes Applied Between Run 1 and Run 2

### 1. Prompt improvements (`lib/prompts.ts`)

- **Rule 5**: Tags must always be lowercase
- **Rule 7**: Slugs must have no slashes
- **Rule 8**: Description must NOT be the same as title — write a 1-2 sentence summary instead
- **Rule 9** (new): `source_url` must be constructed from url_path, never from body links
- **Rule 10** (new): `url_path` must be copied exactly from the input

### 2. Post-processing validation (`scripts/orchestrator.ts`)

Added `postProcessExtraction()` — programmatic fixes applied after every LLM extraction:

- **source_url**: Always constructed as `SITE_ORIGIN + urlPath` (never trust LLM)
- **url_path**: Always set to the actual input url_path
- **description != title**: If identical (case-insensitive), set description to empty string
- **Tag normalization**: Lowercase, trim, deduplicate
- **Date normalization**: Extract YYYY-MM-DD from any ISO-like string

### 3. Error page filtering

Added `isErrorPage()` function that detects 404/503 pages by:
- Content markers ("page not found", "404", "denne siden finnes ikke", etc.)
- Short content length (< 2000 characters)

Error pages are skipped before reaching the LLM.

### 4. Config fix

- Changed `OLLAMA_HOST` default from `host.docker.internal:11434` to `localhost:11434`

---

## Run 2 — After Fixes

**Date**: 2026-02-16

| Metric | Value |
|--------|-------|
| Pages processed | 918 |
| Success | 917 (99.9%) |
| Failed | 1 |
| Slug collisions resolved | 58 |
| Wall clock | 2h 5m 45s |
| Avg per page | 8.2s |
| Prompt tokens | 1,865,358 |
| Completion tokens | 357,498 |
| Total tokens | 2,222,856 |

### Quality improvements

| Issue | Run 1 | Run 2 | Fix type |
|-------|-------|-------|----------|
| Wrong `source_url` | 127 | 0 | Post-processing (never trust LLM) |
| `description` = `title` | 137 | 0 | Post-processing + prompt |
| Uppercase tags | 1,296/3,455 | 0/4,196 | Post-processing + prompt |
| Error pages extracted | ~15 | 0 | Pre-filtering |
| Failed extractions | 53 | 1 | Better error handling |

### Manual spot-checks against live site

Verified 4 pages by browsing the live site and comparing:

| Page | Title | Date | Author | Body | Issues |
|------|-------|------|--------|------|--------|
| Blog (el-sparkesykler) | Correct | Correct | Correct | Correct | None |
| Person (arthur-buchardt) | Correct | Correct | Correct | Correct | None |
| Event (workshop) | Correct | Correct | Correct | Correct | event_time/venue sometimes "N/A" |
| News (aalesund) | Correct | Correct | Correct | Correct | None |

---

## Key Lessons

### 1. Never trust the LLM for fields you can derive programmatically

`source_url` and `url_path` are known inputs — there's no reason to ask the LLM to extract them. The post-processing step that overwrites these fields eliminated 127 errors instantly.

**Rule of thumb**: If you have the ground truth, don't ask the LLM for it.

### 2. Post-processing is your safety net

Even with perfect prompts, the LLM will occasionally produce wrong output. A `postProcessExtraction()` function that programmatically validates and fixes fields is essential. It runs in microseconds and catches what prompts cannot.

### 3. Prompt improvements help but aren't sufficient alone

The tag casing and description fixes worked through a combination of prompt instructions AND post-processing. Prompts alone reduced errors ~60-70%. Post-processing caught the rest.

### 4. Error page filtering saves tokens and prevents garbage

404/503 pages produce nonsensical extractions. Filtering them before LLM processing saved ~120 unnecessary LLM calls and eliminated garbage output.

### 5. Two-tier extraction works

Using Ollama (local, free) for 95% of pages and Claude (API, paid) for complex event pages with panelist extraction is cost-effective. Total cost for 918 pages was approximately $0.50 in Claude API calls.

### 6. Content type analysis is the critical first step

The biggest time sink was iterating on schemas after discovering new content patterns. Doing a thorough content type analysis before writing any extraction code saves 1-2 weeks of rework. See `docs/lesson-content-type-analysis.md`.

---

## Cost Summary

| Resource | Run 1 | Run 2 |
|----------|-------|-------|
| Ollama tokens | ~2M | ~2.2M |
| Ollama cost | $0 (local) | $0 (local) |
| Claude API | ~$0.40 | ~$0.50 |
| Wall clock | ~2.5h | ~2.1h |
| Human time (fixes) | — | ~3h |

**Total cost for 918 pages**: Under $1 in API fees + electricity for local inference.
