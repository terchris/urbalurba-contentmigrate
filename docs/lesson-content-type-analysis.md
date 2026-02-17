# Lesson: Content Type Analysis Is the First Step in Any Website Migration

The single most important task when copying a website is analysing it to identify
the different **content types** and **template types**. Everything downstream
depends on this: your extraction schema, your LLM prompts, your target site
templates, and your quality checks. Get this wrong and you will rework the entire
pipeline.

## Why it matters

A content type defines three things simultaneously:

```
Content type
  ├── What metadata to extract     (schema/prompts for the LLM)
  ├── How to validate quality      (which fields must be non-empty)
  └── How to display the content   (template in the target site)
```

If you treat a person profile like a blog post, you lose the job title, org and
photo fields. If you treat an event page like a news article, you lose panelists,
venue and time. And the target site cannot render content correctly without
knowing which template to apply.

The `content_type` field in the front matter is the key that connects extraction,
validation and rendering. It drives the LLM prompt (which archetype schema to
send), and it drives the website layout (which template to render).

## What happened when we skipped this

On smartebyernorge.no we did not do a formal analysis phase. We discovered
content types iteratively as we crawled and extracted. The cost:

1. **Schema v1 (superset) caused hallucination.** We started with one 40-field
   schema for all pages. The LLM invented data for fields that did not apply
   (event fields on blog posts, person fields on news articles). We had to
   redesign to per-archetype schemas (v2).

2. **Misclassification wasted extraction runs.** The LLM classified all debate
   pages as "blog" because trimmed content looks like prose. We had to go back
   and add forced content type hints from URL patterns.

3. **Missing archetypes found late.** We only realised "tech" and "press" were
   distinct types after seeing pages that did not fit existing schemas. Adding
   them required new Zod schemas, new extraction prompts, and re-running those
   pages.

Each of these issues added a full iteration. A proper analysis phase would have
caught all three on day one.

## How to do the analysis

### Step 1: Browse the site (1–2 hours)

Open the site in a browser. Click through the navigation, look at different
sections. Take screenshots. You are looking for pages that **look different**
from each other — different layouts, different metadata visible on the page,
different kinds of content.

Do not automate this step. Human eyes catch template differences that crawlers
miss (sidebar layouts, card grids vs article pages, profile cards vs prose).

### Step 2: Crawl and group by URL (30 minutes)

Run a crawl to get all URL paths. Group them by their first two path segments
and count:

```
450  /blogg/
 80  /arendalsuka-blog/
 55  /nyheter/
 30  /evolve2021content/program/
 25  /person/
 20  /english-news/
 15  /press/
 12  /tech/
...
```

Each URL group is a **candidate content type**. Some groups will share the same
template (blogg and nyheter both use a standard article layout), while others
will be distinct (person profiles vs event pages).

### Step 3: Sample 3–5 pages per group (1–2 hours)

For each URL group, open a few pages. For each page note:

| Question | Why it matters |
|----------|---------------|
| What metadata is visible? (title, date, author, tags) | Defines the base schema |
| What structured data is embedded? (panelists, times, bios) | Defines archetype extras |
| What is the visual layout? (article, card, grid, composite) | Defines the target template |
| Is there metadata only in the CMS? (not visible on page) | Defines what needs API export |

### Step 4: Define the archetype table

This is the single most important artifact of the analysis. It maps each content
type to its unique fields and the URL patterns that identify it:

| Archetype | Unique fields (beyond base) | URL patterns | Template |
|-----------|----------------------------|--------------|----------|
| `blog` | — | `/blogg/` | article |
| `news` | — | `/nyheter/` | article |
| `event` | event_date, time, venue, moderator, panelists[] | `/arendalsuka-blog/`, `/program/` | event card |
| `person` | full_name, job_title, org, photo | `/person/` | profile card |
| `conference` | conference_name, year, theme | `/arendalsuka`, `/evolve2021` | landing page |

**Rule:** If two URL groups need the same fields, they are the same archetype.
If one needs fields the other does not, they are different archetypes.

### Step 5: Design schemas before extraction

Write the Zod schemas (or equivalent) before you run a single page through the
LLM. Each archetype gets:

- **Base schema** — fields every page has (title, date, slug, etc.)
- **Extras** — fields unique to that archetype (panelists for events, job_title
  for persons)
- **No empty blocks** — a blog post schema has no event fields at all

This prevents the LLM from hallucinating data for fields that do not apply.

### Step 6: Design templates in parallel

While the extraction schema defines what data you pull *out* of the source site,
the templates define how you display it *on* the target site. These are two sides
of the same coin:

| Archetype | Schema (extraction) | Template (display) |
|-----------|--------------------|--------------------|
| `blog` | title, date, author, body, tags | Standard article layout |
| `event` | title, event_date, time, venue, panelists | Event card with participant list |
| `person` | full_name, job_title, org, photo, bio | Profile card with photo |

If the extraction schema has a field, the template must render it. If the
template needs a field, the extraction schema must provide it. Design them
together.

## Time investment

| Step | Time | Payoff |
|------|------|--------|
| Browse the site | 1–2 hours | Visual template inventory |
| Crawl and group URLs | 30 minutes | Content type candidates |
| Sample pages per group | 1–2 hours | Field inventory per type |
| Write archetype table | 30 minutes | The master reference |
| Design schemas + templates | 1–2 hours | Extraction and display aligned |
| **Total** | **4–7 hours** | **Saves 1–2 weeks of rework** |

## Key takeaways

1. **Content type analysis is the first step, not an afterthought.** Do it before
   writing any extraction code.

2. **The archetype table is the master artifact.** Schemas, prompts, templates,
   and output directories all derive from it.

3. **Browse the site with human eyes.** Crawlers give you URLs. Only a human can
   see that two URL groups use different visual templates.

4. **Per-archetype schemas prevent hallucination.** Never send a 40-field superset
   to a small LLM. Send only the fields that apply to the page being extracted.

5. **Schema and template are two sides of the same coin.** Design them together.
   If the schema has `panelists[]`, the template must render a participant list.
   If the template needs a hero image, the schema must extract `featured_image`.

6. **Spend a day analysing, save a week reworking.** The smartebyernorge.no
   migration needed three schema iterations because we skipped the analysis phase.
   For rodekors.no, do it first.
