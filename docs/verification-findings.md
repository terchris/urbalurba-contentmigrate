# Verification Findings — LLM Extraction vs Squarespace JSON Ground Truth

**Date**: 2026-02-16
**Sample**: 43 pages with JSON ground truth (out of 177 verifiable pages)
**Pipeline**: gemma3:4b via Ollama, schema v2, single-tier

## Results Summary

| Field | Exact | Partial | Mismatch | Total | Accuracy | Fix? |
|-------|-------|---------|----------|-------|----------|------|
| **title** | 43 | 0 | 0 | 43 | **100%** ✅ | No |
| **body** | 43 | 0 | 0 | 43 | **100%** ✅ | No |
| **event_date** | 1 | 3 | 0 | 4 | **100%** ✅ | No |
| **date** | 37 | 0 | 6 | 43 | **86%** ⚠️ | Yes — JSON merge |
| **author** | 35 | 0 | 6 | 41 | **85%** ⚠️ | Yes — JSON merge |
| **featured_image** | 25 | 0 | 18 | 43 | **58%** ❌ | Yes — JSON merge |
| **tags** | 13 | 7 | 20 | 40 | **50%** ❌ | Yes — JSON merge |
| **description** | 10 | 4 | 28 | 42 | **33%** ❌ | Yes — JSON merge |

**Overall page accuracy: 74%** → expected to reach ~95% after JSON merge step.

## Field-by-Field Analysis

### Title — 100% ✅

Perfect extraction. The title is always prominent in the crawled Markdown, and gemma3:4b finds it reliably.

### Body — 100% ✅

All pages have non-empty body content. The Crawl4AI Markdown is the body source, not the LLM.

### Event date — 100% ✅

Small sample (4 events), but all matched or partially matched. The LLM finds event dates in the content reliably when forced to the event archetype.

### Date — 86% ⚠️

6 mismatches. Root cause: **the LLM reads dates from the URL path** (e.g., `/events/2018/12/5/...` → `2018-12-05`) instead of the actual publication date. The URL path date is the Squarespace slug date, which can differ from the publication timestamp.

Examples:
- `/events/2018/12/5/sbn-pitch-evolve-arena` → LLM extracted `2018-12-05`, actual: `2018-10-12`
- `/events/2018/11/12/...smart-city-expo` → LLM extracted `2018-11-12`, actual: `2018-09-18`

**Fix**: For the 177 pages with JSON ground truth, merge `publishOn` timestamp as the authoritative date.

### Author — 85% ⚠️

6 mismatches across 3 sub-patterns:

1. **3 empty strings** — All `/events/` pages. The author is not visible on the rendered page; only exists in the Squarespace API.
2. **2 wrong names** — LLM guessed "Smarteby Norge" (site name) or picked a name mentioned in the body.
3. **1 subject-as-author** — On `/ressurspersoner/stale-undheim`, the LLM picked the page subject as the author.

**Fix**: Merge `author.displayName` from JSON (skipping "Guest User").

### Featured image — 58% ❌

18 mismatches. Breakdown:
- **15 pages**: LLM extracted no image; JSON has `assetUrl` (the Squarespace featured image is API-only metadata, not visible in crawled HTML)
- **2 pages**: LLM found a different CDN URL (old WordPress image still referenced)
- **1 page**: LLM picked a different image from the page than the one Squarespace considers "featured"

**Root cause**: The `assetUrl` is Squarespace CMS metadata. It's not embedded as a `<meta property="og:image">` tag or otherwise discoverable from the rendered page content.

**Fix**: Merge `assetUrl` from JSON as `featured_image.src`.

### Tags — 50% ❌

20 mismatches. The LLM **fabricates topical keywords** from body text, but Squarespace tags/categories are organizational labels:
- LLM: `[smart by, åpne data, innovasjon]` (topic-based)
- JSON: `tags:[Arkiv] cats:[Forside]` (organizational)

In 12 of 20 mismatches, the JSON has `tags:[]` with only categories. The LLM, finding no explicit tags, invents its own.

**Fix**: Merge `tags[]` + `categories[]` from JSON. LLM-extracted tags can be kept as a secondary `extracted_tags` field if desired.

### Description — 33% ❌

28 mismatches. Dominant pattern: the Squarespace `excerpt` is **hand-written editorial copy** that the LLM cannot recover from the body text. The LLM generates a content summary instead.

Sub-patterns:
- ~18: LLM summarized body; JSON has editorial excerpt
- ~3: LLM wrote in English for Norwegian content
- ~3: Press pages with journalist bylines in JSON excerpt
- ~4: Near-identical but with Unicode/quoting differences

**Fix**: Merge `excerpt` (HTML-stripped) from JSON as `description`.

## Key Insight: Two Categories of Metadata

| Category | Fields | Source | LLM Reliability |
|----------|--------|--------|-----------------|
| **In-page metadata** | title, body, event_date, event participants | Visible in crawled HTML/Markdown | ✅ High (85-100%) |
| **CMS-only metadata** | date, author, featured_image, tags, description | Squarespace API only | ❌ Low (33-86%) |

The LLM excels at extracting what's visible on the page. It cannot recover CMS metadata that exists only in the API.

## Recommended Fix: JSON Merge Step

Add a post-extraction merge step that overlays JSON API data onto the LLM-extracted front matter:

```
Stage 1: Crawl4AI        → Raw JSON per page
Stage 2: LLM enrichment  → Classify + extract visible metadata
Stage 3: JSON merge       → Overlay API fields (date, author, image, tags, description)
Stage 4: Final .md        → Content lake with YAML front matter
```

For the 177 pages with JSON ground truth:
- `date` ← `publishOn` timestamp → YYYY-MM-DD
- `author` ← `author.displayName` (skip "Guest User")
- `featured_image.src` ← `assetUrl`
- `tags` ← `tags[] + categories[]`
- `description` ← `stripHtml(excerpt)`

For the remaining ~742 pages (no JSON ground truth):
- Keep LLM-extracted values as-is
- Flag these pages with `needs_review: true` in the extraction log

## Impact on Red Cross Migration

This finding is critical for the rodekors.no migration:

1. **Always export the CMS API data** before starting enrichment — even if you have a full crawl, the API has metadata that's invisible on the page.
2. **Use LLM enrichment for classification and in-page data only** — don't expect it to recover CMS metadata.
3. **Build the JSON merge step into the pipeline from day one** — it's not optional.
4. **Measure early**: Run verification on a small sample before processing the full site. The 43-page test here caught all major issues.
