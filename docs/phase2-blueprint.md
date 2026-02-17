# Phase 2: AI-Driven Blueprint for smartebyernorge.no Migration

## Site Analysis Summary

**Source Platform:** Squarespace (site ID `56fc08f17c65e4e90c66db4c`)
**Language:** Norwegian (bokmål) primary, English secondary (`/about`, `/english-news/`)
**Content span:** 2016–2022
**Unique pages:** ~215 (per JSON API manifest)
**Source data:** wget mirror (1,693 HTML files) + JSON API export (215 pages, 1,069 images)

---

## 1. Content Archetypes Discovered

From crawling the live site, 9 distinct page types were identified:

| # | Archetype | URL Pattern Examples | Key Fields |
|---|-----------|---------------------|------------|
| 1 | **Blog Post** | `/blogg/foreningen-smarte-byer-norge...` | author, date, category, tags, featured_image |
| 2 | **News Article** | `/nyheter/2019/9/10/vekst-i-smarte-byer-norge` | author, date, featured_image |
| 3 | **Event/Debate** (Arendalsuka) | `/arendalsuka-blog/matsikkerhet` | event_date, event_time, venue, panelists[], moderator, topic_lead |
| 4 | **Conference Page** | `/evolve2021`, `/arendalsuka` | conference_name, year, theme, streaming_url |
| 5 | **Person/Speaker** | `/person/terje-christensen`, `/evolve2021content/person/ole-erik-almlid` | name, title, organization, bio, photo |
| 6 | **Tech/Solution Showcase** | `/tech/heime`, `/tech/nabohjelp` | solution_name, categories[], external_url, description |
| 7 | **Press Mention** | `/press/2021/11/18/eiendomswatch-...` | source_publication, date, original_url |
| 8 | **Static/Institutional Page** | `/omoss`, `/nettverk`, `/ressurser`, `/about` | page_type: "institutional", language |
| 9 | **English News** | `/english-news/connecting-smart-cities...` | Same as News but `language: en` |

---

## 2. Front Matter Schema (v2 — per-archetype)

v1 used a single superset schema with 40+ fields for every page. This caused Ollama to hallucinate — filling event/person/conference fields for simple blog posts. v2 uses a **common base** plus **archetype-specific extras**. Only fields that actually apply appear in the front matter.

See [project-goals.md](project-goals.md) for the rationale behind this design.

### Common base (all content types)

```yaml
---
content_type: blog         # ENUM: blog | news | event | conference | person | tech | press | page | english_news
title: ""                  # Page title (H1 or <title>)
slug: ""                   # URL slug derived from path (e.g., "matsikkerhet")
url_path: ""               # Original full path (e.g., "/arendalsuka-blog/matsikkerhet")
language: nb               # ISO 639-1: "nb" (bokmål) or "en"
date: ""                   # ISO 8601: "2022-08-16" (published date)
description: ""            # Meta description or first-paragraph excerpt (max 300 chars)
author: ""                 # Author name (e.g., "Terje Christensen")
source_url: ""             # Full original URL for traceability
featured_image:            # Hero image (omit if none)
  src: ""                  # Original Squarespace CDN URL
  alt: ""                  # Alt text
tags: []                   # Free-form tags
---

Markdown body content here...
```

### Archetype extras

These fields are **added** to the common base only when `content_type` matches.

#### Event (`content_type: event`)

```yaml
event_date: ""             # Event date (may differ from publish date)
event_time: ""             # "11:00–11:45" or just start time
venue: ""                  # e.g., "Arendalsuka"
moderator: ""              # Debate leader / ordstyrer
panelists:                 # Array — only if panel discussion
  - name: ""
    title: ""              # Job title
    organization: ""
```

#### Person (`content_type: person`)

```yaml
full_name: ""
job_title: ""              # e.g., "Leder, partner & gründer av Smarte Byer Norge"
organization: ""
photo:
  src: ""
  alt: ""
```

Bio goes in the Markdown body, not in front matter.

#### Conference (`content_type: conference`)

```yaml
conference_name: ""        # e.g., "Evolve Arena 2021"
conference_year: 2021
theme: ""                  # e.g., "Mission Possible"
```

#### Tech/Solution (`content_type: tech`)

```yaml
solution_name: ""          # Product/solution name
external_url: ""           # Link to company website
```

#### Press (`content_type: press`)

```yaml
source_publication: ""     # e.g., "EiendomsWatch"
original_url: ""           # Link to original article
```

#### Page (`content_type: page`) and English News (`content_type: english_news`)

No extra fields beyond the common base.

### What moved out of front matter

| Field | Where it went | Why |
|-------|--------------|-----|
| `migration.extraction_method` | `reports/extraction-log.json` | Tooling metadata, not content |
| `migration.confidence` | `reports/extraction-log.json` | QA tracking, not content |
| `migration.needs_review` | `reports/extraction-log.json` | Workflow state, not content |
| `author.id` | Dropped | Squarespace-specific, no CMS needs it |
| `categories` | Merged into `tags` | Squarespace distinction doesn't map cleanly to Hugo/Astro |
| `section` | Derived from directory path | `content/blogg/slug.md` → section is `blogg` |
| `date_modified` | Dropped | Rarely available, CMS tracks this itself |
| `nav_prev` / `nav_next` | Dropped | CMS generates navigation, not content |
| `images[]` (body images) | Stay in Markdown body | Already inline as `![alt](url)` |

### Example: blog post

```yaml
---
content_type: blog
title: "Rapport fra Nordic Edge 2017"
slug: rapport-fra-nordic-edge-2017
url_path: /blogg/2017/10/1/rapport-fra-nordic-edge-2017
language: nb
date: "2017-10-01"
description: "Det tok sin helg å lande etter uken på Nordic Edge."
author: "Gard Jenssen"
source_url: https://www.smartebyernorge.no/blogg/2017/10/1/rapport-fra-nordic-edge-2017
featured_image:
  src: https://images.squarespace-cdn.com/.../Smarte+Byer+Norge+stand.jpg
  alt: "Hyggelig besøk av SINTEF på standen"
tags:
  - Nordic Edge
  - konferanse
---

Det tok sin helg å lande etter uken på Nordic Edge...
```

### Example: event page

```yaml
---
content_type: event
title: "Matsikkerhet - fra jord til bord med data"
slug: matsikkerhet
url_path: /arendalsuka-blog/matsikkerhet
language: nb
date: "2022-08-15"
description: "Debatt om bruk av data og teknologi for matsikkerhet."
author: ""
source_url: https://www.smartebyernorge.no/arendalsuka-blog/matsikkerhet
featured_image:
  src: https://images.squarespace-cdn.com/.../matsikkerhet-header.jpg
  alt: "Paneldebatt om matsikkerhet"
tags:
  - Arendalsuka
  - matsikkerhet
event_date: "2022-08-16"
event_time: "11:00–11:45"
venue: Arendalsuka
moderator: "Ola Nordmann"
panelists:
  - name: "Kari Nordmann"
    title: "Direktør"
    organization: "Mattilsynet"
  - name: "Per Hansen"
    title: "Forsker"
    organization: "NIBIO"
---

Debatt om bruk av data og teknologi for matsikkerhet...
```

---

## 3. Extraction Pipeline

Source data is already on disk. No live crawling needed.

### Step 1: Filter wget files

The wget mirror contains 1,693 files. Most are duplicates. The filter script:
- Skips files with `?` in filename (query parameter variants, pagination, RSS)
- Skips `category/` and `tag/` subdirectories (listing pages)
- Produces a clean list of ~185 unique HTML files

### Step 2: Cross-check against JSON manifest

Diff the filtered wget list against the JSON API's `_manifest.json` (215 paths) to:
- Find pages in JSON but missing from wget (may need manual fetch)
- Find pages in wget but missing from JSON (may be orphaned or deprecated)
- Produce a reconciled master extraction list

### Step 3: Feed to Ollama

For each HTML file in the master list:
1. Read HTML from `../wget/www.smartebyernorge.no/{path}.html`
2. Send to Ollama with the system prompt from `docs/ollama-system-prompt.txt`
3. Write output to `content/{section}/{slug}.md`
4. Log extraction result and confidence score

### Step 4: Validate

Run `scripts/validation_rules.py` across all extracted `.md` files. Output report to `reports/`.

### Step 5: Audit (Claude)

Feed 20–30 random files back to Claude for spot-checking. Claude identifies systematic errors and writes cleanup scripts.

---

## 4. CMS Mapping Specifications

### 4.1 Hugo Mapping

```yaml
# Hugo content structure: content/{section}/{slug}.md

content_type    → type (Hugo archetype)
title           → title
slug            → slug (or derive from filename)
url_path        → url (Hugo URL override)
language        → (file goes in content/{lang}/ directory)
date_published  → date
date_modified   → lastmod
description     → description (also used for summary)
author.name     → authors: ["Terje Christensen"]  # Hugo uses array
categories      → categories
tags            → tags
section         → (directory structure: content/blogg/, content/nyheter/, etc.)
featured_image.local_path → images: ["/images/blog/slug/header.jpg"]
event.*         → [params.event]  # Hugo custom front matter
```

Hugo directory structure:
```
content/
├── nb/
│   ├── blogg/
│   ├── nyheter/
│   ├── arendalsuka/
│   ├── arrangementer/
│   ├── personer/
│   └── _index.md
├── en/
│   ├── news/
│   └── _index.md
└── _index.md
```

### 4.2 Astro Mapping

```yaml
# Astro content collections: src/content/{collection}/{slug}.md

content_type    → (determines collection name)
title           → title
slug            → slug
url_path        → permalink (custom field)
language        → lang
date_published  → pubDate
date_modified   → updatedDate
description     → description
author          → author: { name, id }
featured_image  → heroImage: { src, alt }
```

### 4.3 Enonic XP Mapping

```yaml
# Enonic content types defined in XML

content_type    → x-data type / content type name
title           → displayName
slug            → _name
language        → language (built-in i18n)
date_published  → publish.from
description     → data.description
body            → data.body (HtmlArea)
event.panelists → data.panelists (ItemSet, repeatable)
```

---

## 5. Known Challenges

1. **Homepage composite** — `/` is a curated mashup of events + news + conference promos. Extract as `content_type: "page"`, CMS rebuilds dynamically.
2. **Person page duplication** — People exist under `/person/`, `/evolve2021content/person/`, `/people/eng/`, and `/ressurspersoner/`. Dedup needed in Step 2.
3. **Squarespace CDN images** — Already downloaded in `../wget/images.squarespace-cdn.com/`. Need to be renamed and reorganized by content section/slug.
4. **Missing dates** — Institutional pages (`/omoss`, `/nettverk`) have no publication date.
5. **Dual-language** — `/about` and `/english-news/` are English. i18n approach differs per CMS.
6. **Newsletter forms / widgets** — Can't be migrated; strip and note in report.
7. **Event pages** — Most complex archetype. Panelists, moderators, topic leads embedded in free-text Norwegian that Ollama must parse structurally.

---

## 6. Related Files

| File | Purpose |
|------|---------|
| `ollama-system-prompt.txt` | Production system prompt for Ollama extraction engine |
| `extraction-comparison.md` | Detailed wget vs JSON API analysis |
| `../scripts/validation_rules.py` | Python validator for extracted .md files |

### Source data locations

| Source | Path (relative to this file) |
|--------|------|
| wget HTML | `../../wget/www.smartebyernorge.no/` |
| wget images | `../../wget/images.squarespace-cdn.com/` |
| JSON API export | `../../json/squarespace-json-export/` |
| JSON API manifest | `../../json/squarespace-json-export/_manifest.json` |
