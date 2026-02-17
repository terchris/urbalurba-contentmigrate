# Content Classification Methodology

How we identified, classified, and routed 919 pages from smartebyernorge.no
into 9 content archetypes — and how to repeat this for rodekors.no or any
other site migration.

---

## Overview

Classification happens in three phases:

```
Phase 1: Discovery       → What content types exist on this site?
Phase 2: Rules            → Map URL patterns to archetypes + schemas
Phase 3: LLM routing      → Which pages need forced type hints vs auto-classify?
```

Each phase builds on the previous one. The end result is a set of URL-pattern
rules that deterministically route every crawled page to the right archetype
and schema — with no ambiguity and no LLM classification errors.

---

## Phase 1: Discovery — "What lives on this site?"

### Step 1.1: Crawl the site

Use Crawl4AI (or any crawler) to produce a manifest of all pages with their
URL paths. For smartebyernorge.no this produced 991 JSON files.

### Step 1.2: Group URLs by path prefix

Look at the URL structure. Most CMS platforms organise content into path
namespaces:

```
/blogg/                     → Blog posts
/nyheter/                   → News articles
/english-news/              → English news
/arendalsuka-blog/          → Event-related content
/evolve2021content/         → Conference sub-pages
/evolve2021content/person/  → Speaker profiles
/person/, /people/          → Person profiles
/tech/, /concept/, /product/→ Technology/solution pages
/press/                     → Press mentions
/about, /omoss, /nettverk   → Static institutional pages
```

**Method:** Export all unique URL path prefixes (first 2 segments), sort by
frequency. This gives you a natural clustering of content types.

```bash
# Quick way to see URL structure from crawl output
ls crawl-output/*.json | head -20
# Or extract url_path from all JSON files
node -e "
const fs = require('fs');
const files = fs.readdirSync('crawl-output').filter(f => f.endsWith('.json'));
const paths = files.map(f => {
  const j = JSON.parse(fs.readFileSync('crawl-output/' + f, 'utf-8'));
  return j.url_path || new URL(j.url).pathname;
});
// Group by first two segments
const groups = {};
for (const p of paths) {
  const prefix = '/' + p.split('/').slice(1, 3).join('/');
  groups[prefix] = (groups[prefix] || 0) + 1;
}
Object.entries(groups).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(v, k));
"
```

### Step 1.3: Sample 3–5 pages per group

Open representative pages from each URL group. Note:

- **What metadata is visible?** (title, date, author, tags, image)
- **What structured data is embedded?** (panelists, event times, bios)
- **How is the content formatted?** (prose, lists, tables, composite layout)
- **What language?** (Norwegian, English, mixed)

Document your findings in a table:

| URL prefix | Page count | Content description | Key metadata | Structured data? |
|------------|-----------|---------------------|-------------|-----------------|
| `/blogg/` | 450 | Blog posts with author/date | title, date, author, tags, hero image | No |
| `/arendalsuka-blog/` | 80 | Event write-ups, debate pages | title, date, author, tags | **Yes**: panelists in bold text, moderator, time slots |
| `/evolve2021content/program/` | 30 | Conference sessions | title, date, categories | **Yes**: panelists, moderator, venue, time |
| `/person/` | 25 | Speaker/person profiles | name, title, org, photo | Structured but simple |
| `/press/` | 15 | Syndicated press mentions | title, date, source publication | Source URL |

### Step 1.4: Define archetypes

An **archetype** is a content type with a distinct set of metadata fields.
The rule: if two page groups share the same fields, they're the same archetype.
If one group needs fields the other doesn't, they're different archetypes.

For smartebyernorge.no we found 9 archetypes:

| Archetype | Unique fields (beyond base) | Source URL groups |
|-----------|----------------------------|-------------------|
| `blog` | (none — base only) | `/blogg/`, `/agendablog/` |
| `news` | (none — base only) | `/nyheter/` |
| `english_news` | (none — base only, but `language: en`) | `/english-news/` |
| `event` | `event_date`, `event_time`, `venue`, `moderator`, `panelists[]` | `/arendalsuka-blog/`, `/evolve2021content/program/`, `/evolve2021content/workshop/`, `/evolve2021content/bolk/` |
| `conference` | `conference_name`, `conference_year`, `theme` | `/arendalsuka`, `/evolve2021` (landing pages only) |
| `person` | `full_name`, `job_title`, `organization`, `photo` | `/person/`, `/people/`, `/ressurspersoner/`, `/evolve2021content/person/` |
| `tech` | `solution_name`, `external_url` | `/tech/`, `/concept/`, `/product/`, `/tjeneste/` |
| `press` | `source_publication`, `original_url` | `/press/` |
| `page` | (none — base only) | Everything else (`/`, `/omoss`, `/nettverk`, etc.) |

### Step 1.5: Define the base schema

Every page shares a common set of fields. This is the **base schema**:

```
content_type   — Which archetype (used to select the right schema)
title          — Page title
slug           — URL-friendly identifier
url_path       — Original URL path
language       — "nb" or "en"
date           — Publish date (ISO 8601)
description    — Short description / meta description
author         — Author name (flat string)
source_url     — Full original URL
featured_image — { src, alt } or omitted
tags           — Free-form tag array
```

Then each archetype adds its **extras** on top. The LLM only sees the fields
relevant to the page it's extracting — no empty blocks, no unused fields.

---

## Phase 2: Rules — URL patterns → archetypes

### Step 2.1: Write `detectArchetype(urlPath)`

This is a pure function that maps URL paths to archetypes. It uses cascading
`if/startsWith` checks, ordered from most specific to least specific:

```typescript
function detectArchetype(urlPath: string): Archetype {
  if (urlPath === "/") return "page";
  if (urlPath.startsWith("/blogg/")) return "blog";
  if (urlPath.startsWith("/nyheter/")) return "news";
  if (urlPath.startsWith("/english-news/")) return "english_news";
  if (urlPath.startsWith("/arendalsuka-blog/")) return "event";
  if (urlPath === "/arendalsuka" || urlPath === "/evolve2021") return "conference";
  if (urlPath.startsWith("/evolve2021content/")) {
    if (urlPath.includes("/person/")) return "person";  // nested exception
    return "event";
  }
  if (urlPath.startsWith("/person/")) return "person";
  if (urlPath.startsWith("/tech/")) return "tech";
  if (urlPath.startsWith("/press/")) return "press";
  return "page";  // fallback
}
```

**Important:** Order matters. Check nested exceptions before broad prefixes.
`/evolve2021content/person/` must match "person" before the general
`/evolve2021content/` → "event" rule.

### Step 2.2: Run classification report

Run `detectArchetype()` over all crawled pages and produce a summary:

```
blog             450 pages
event             80 pages
page              60 pages
news              55 pages
conference         2 pages
person            25 pages
tech              12 pages
press             15 pages
english_news      20 pages
─────────────────────────
TOTAL            919 pages
```

Verify: does every page land in the right bucket? Spot-check 3–5 pages per
archetype to confirm the URL rules are correct.

### Step 2.3: Map archetypes to output directories

```typescript
const SECTION_DIRS: Record<string, string> = {
  blog: "blogg",
  news: "nyheter",
  event: "arendalsuka",
  conference: "konferanser",
  person: "personer",
  tech: "tech",
  press: "presse",
  page: "sider",
  english_news: "english-news",
};
```

This determines where the output `.md` files go: `content/blogg/my-post.md`,
`content/arendalsuka/my-event.md`, etc.

---

## Phase 3: LLM Routing — auto-classify vs forced type hints

### The problem

A 4B local LLM (gemma3:4b) misclassifies content types when given only a
4K-trimmed snippet. In our case, every event/debate page was classified as
"blog" because the trimmed content looks like a blog post (title, date, author,
Norwegian prose).

This matters because:
- If the LLM thinks it's a "blog", it uses `BaseSchema` (no extras)
- If it knows it's an "event", it uses `EventSchema` (with panelists, etc.)
- Wrong classification → missing structured data

### The solution: forced content type hints

For pages where we **already know the archetype from the URL pattern**, skip
the LLM classification pass and force the content type directly.

### Step 3.1: Identify pages that need forced hints

Not all pages need hints — only those where:

1. **The LLM misclassifies them** (tested empirically)
2. **They have archetype-specific extra fields** (event, person, conference, tech, press)

Simple archetypes (blog, news, page, english_news) use only `BaseSchema` — even
if the LLM classifies them wrong, the output fields are the same.

### Step 3.2: Define COMPLEX_PATTERNS with hints

```typescript
const COMPLEX_PATTERNS: Array<{
  pattern: RegExp;
  contentType: ContentTypeHint;  // "event" | "conference" | "page" | null
}> = [
  // Conference landing pages
  { pattern: /^\/arendalsuka$/, contentType: "conference" },
  { pattern: /^\/evolve2021$/, contentType: "conference" },
  { pattern: /^\/$/, contentType: "page" },

  // Debate/panel pages — panelists in free text
  { pattern: /smartbydebatten/, contentType: "event" },
  { pattern: /\/debatt-/, contentType: "event" },
  { pattern: /\/program\/debatt/, contentType: "event" },

  // Conference program blocks
  { pattern: /^\/evolve2021content\/bolk\//, contentType: "event" },
  { pattern: /^\/evolve2021content\/program\//, contentType: "event" },
  { pattern: /^\/evolve2021content\/workshop\//, contentType: "event" },

  // Specific complex event pages
  { pattern: /workshop-smarte-byer/, contentType: "event" },
  // ...
];
```

### Step 3.3: Define OLLAMA_OVERRIDES (exceptions)

Some URLs match COMPLEX_PATTERNS syntactically but are actually simple pages.
Override rules are checked FIRST and force auto-classification:

```typescript
const OLLAMA_OVERRIDES: RegExp[] = [
  /\/person\//,              // Person profiles under /evolve2021content/
  /\/virksomhet\//,          // Company profiles
  /\/pitch-/,                // Pitch descriptions
  /\/program\/bolk\d+-pause/, // Pause items in conference program
  /\/program\/velkommen/,    // Welcome items
];
```

### Step 3.4: The routing function

```typescript
function classifyPage(urlPath) {
  // Overrides first — always auto-classify
  for (const override of OLLAMA_OVERRIDES) {
    if (override.test(urlPath)) {
      return { tier: "ollama", contentTypeHint: null };
    }
  }

  // Complex patterns — force content type
  for (const { pattern, contentType } of COMPLEX_PATTERNS) {
    if (pattern.test(urlPath)) {
      return { tier: "ollama", contentTypeHint: contentType };
    }
  }

  // Everything else — auto-classify via LLM
  return { tier: "ollama", contentTypeHint: null };
}
```

### Step 3.5: How the LLM uses the hint

```
If contentTypeHint is provided:
  → Skip classification pass (pass 1)
  → Go straight to archetype schema (pass 2 only)
  → LLM prompt includes: "Content type: event"

If contentTypeHint is null:
  → Pass 1: classify using BaseSchema → get content_type
  → If simple type (blog/news/page) → done (single pass)
  → If complex type → Pass 2 with archetype schema
```

This means forced-hint pages take **one LLM call** (with the full archetype
schema), while auto-classified simple pages also take **one LLM call** (with
BaseSchema). Only auto-classified complex pages (rare) take two calls.

---

## How to repeat this for a new site (e.g. rodekors.no)

### 1. Crawl the site

```bash
cd crawl && python crawl_site.py --url https://www.rodekors.no
```

### 2. Discover URL structure

Extract all URL path prefixes, group by frequency. Look for natural content
namespaces in the URL hierarchy.

### 3. Sample and classify manually

Open 3–5 pages per URL group. Note what metadata each type needs. Draw the
archetype table (see Phase 1, Step 1.4).

Red Cross will likely have different archetypes:

| Archetype | Possible URL patterns | Unique fields |
|-----------|----------------------|---------------|
| `article` | `/artikler/`, `/nyheter/` | author, date, tags |
| `volunteer_page` | `/frivillig/`, `/bli-frivillig/` | contact_email, location, signup_url |
| `emergency_info` | `/forstehjelp/`, `/beredskap/` | severity_level, last_updated |
| `donation` | `/gi-en-gave/`, `/stott-oss/` | donation_url, campaign_name |
| `local_chapter` | `/distrikter/`, `/lokalforeninger/` | region, address, phone |
| `course` | `/kurs/` | course_date, location, price, signup_url |
| `page` | everything else | (base only) |

### 4. Define Zod schemas

Write `BaseSchema` (common fields) + archetype extras. Only include fields
that actually exist for that type.

### 5. Write `detectArchetype()` rules

Cascading if/startsWith checks, most specific first.

### 6. Run classification report

Verify every page lands in the right bucket. Fix mismatches.

### 7. Test LLM extraction on 3–5 pages per archetype

Run the extraction pipeline on a small sample. Check:
- Does the LLM classify correctly? (auto-classify path)
- Are archetype-specific fields extracted? (panelists, event dates, etc.)
- Is any data truncated by the 4K input cap?

### 8. Identify pages needing forced hints

If the LLM misclassifies certain URL groups (it will — 4B models struggle
with classification), add them to `COMPLEX_PATTERNS` with the correct
`contentType` hint.

### 9. Add overrides for exceptions

If any forced-hint patterns catch pages that should be auto-classified
(e.g. simple sub-pages under a complex URL prefix), add them to
`OLLAMA_OVERRIDES`.

### 10. Full extraction run

With all rules in place, run the full pipeline. All 919 pages (or however
many the new site has) should complete in a single Ollama pass — no external
API needed.

---

## Key lessons from smartebyernorge.no

1. **URL structure is the most reliable classifier.** CMS platforms organise
   content into URL namespaces. Trust the URL, not the LLM, for classification.

2. **Small LLMs misclassify.** gemma3:4b classified debate pages as "blog"
   when auto-classifying from trimmed content. Forced content type hints fix
   this completely.

3. **Per-archetype schemas prevent hallucination.** v1 used a 40-field superset
   schema — Ollama invented data for fields that didn't apply. v2 sends only
   relevant fields → zero hallucination.

4. **Overrides handle nested exceptions.** `/evolve2021content/person/` is
   under the event URL prefix but contains person profiles. The override
   system catches this.

5. **Test before assuming.** We thought Claude API was needed for 59 complex
   pages. Testing showed gemma3:4b handles them fine with forced types —
   eliminating the API dependency entirely.

6. **Document the archetype table early.** The table from Phase 1, Step 1.4
   is the single most important artifact. Everything else (schemas, rules,
   hints, directory mapping) derives from it.
