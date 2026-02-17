# Project Goals

## Primary Goal

Copy **smartebyernorge.no** off Squarespace to save hosting costs, using a pipeline that produces a reusable **content lake** of Markdown files with YAML front matter.

## Secondary Goal — Red Cross Experiment

Use this project as a proving ground for migrating **rodekors.no** to a new CMS. The pipeline, tooling, and content format developed here should transfer directly to the Red Cross migration. Lessons learned (what works, what breaks, what takes time) feed into the Red Cross project planning.

## Design Principles

### 1. Markdown + front matter is the standardised output format

Every page becomes one `.md` file with a YAML front matter header. This is the **product** — the format that gets checked into git, reviewed by humans, and fed to any CMS.

Why front matter, not Crawl4AI JSON:

| | Crawl4AI JSON | Markdown + front matter |
|---|---|---|
| **Purpose** | Raw crawl artifact | Clean, structured content |
| **Metadata** | Tool-specific (`elapsed_seconds`, `html_length`) | Content-specific (`title`, `date`, `author`) |
| **Body** | Raw markdown with nav/footer noise | Clean markdown, boilerplate stripped |
| **Images** | Duplicate Squarespace resolutions | Deduplicated, alt text preserved |
| **Portability** | Requires custom parser per CMS | Hugo, Astro, Jekyll, Enonic read natively |
| **Human-readable** | Barely (nested JSON) | Fully (any text editor) |

The Crawl4AI JSON is valuable as **raw material** (step 1). The front matter Markdown is the **deliverable** (step 2). Every downstream consumer reads step 2 — nobody needs to know Crawl4AI exists.

### 2. Keep the front matter schema small

The v1 superset schema (40+ fields across all archetypes) caused Ollama to hallucinate. The new approach:

- **Common base**: 8 fields that every page has (title, date, slug, description, content_type, language, author, source_url)
- **Archetype extras**: Only fields that actually exist for that content type (panelists for events, bio for persons)
- **No empty blocks**: A blog post does NOT get empty `event`, `person`, `solution`, `press`, `conference` sections
- **Migration metadata in sidecar**: Quality-tracking fields (confidence, extraction_method, needs_review) go in a separate `reports/` file, not in the front matter

### 3. Three-stage pipeline

```
Stage 1: Crawl4AI        → Raw JSON per page (done, 991 pages)
Stage 2: LLM enrichment  → Classify + extract metadata from clean markdown
Stage 3: Merge            → Final .md files with YAML front matter (the content lake)
```

Crawl4AI handles the heavy lifting (HTML → Markdown) at 0.7s/page with no LLM. Ollama/Claude only touch clean markdown for classification and metadata extraction.

### 4. Portable across CMS targets

The front matter schema is designed so that:
- **Hugo** reads it natively (content sections map to directories, custom fields under `params`)
- **Astro** reads it natively (content collections, `pubDate`/`updatedDate` mapping)
- **Enonic XP** can ingest it with a simple parser (front matter → content type fields)
- **Red Cross CMS** (unknown platform) gets a universally understood format — no vendor lock-in

### 5. Same pipeline for rodekors.no

The crawl script already supports `--url https://www.rodekors.no`. The enrichment pipeline, Zod schemas, and validation scripts should work with minimal changes. Red Cross-specific archetypes (volunteer pages, emergency info, donation forms) will be added when that migration starts.

## Non-Goals

- **Pixel-perfect recreation** — The site will look different on the new platform. Content fidelity matters; visual layout does not.
- **Dynamic features** — Newsletter signups, search, forms — these are CMS features, not content. They are noted and skipped.
- **Image optimisation** — Images are preserved as-is from Squarespace CDN. Optimisation happens at deploy time.
- **Automated deployment** — This project produces the content lake. Deploying to a specific CMS is a separate project.

## Success Criteria

1. Every page on smartebyernorge.no has a corresponding `.md` file with correct front matter
2. Content verified against Squarespace JSON API export (ground truth)
3. At least one CMS target (Hugo or Astro) can render the content lake without manual edits
4. The pipeline can be pointed at rodekors.no and produce output without code changes (only config/schema additions)
