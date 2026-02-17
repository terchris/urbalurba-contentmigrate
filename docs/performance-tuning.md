# Performance Tuning — Ollama Extraction Pipeline

## Hardware

- Apple Mac M4 (48 GB unified memory)
- Ollama running locally on `localhost:11434`

## Baseline (before optimisation)

| Setting | Value |
|---------|-------|
| Model | qwen3:8b (5.2 GB) |
| num_ctx | 32768 |
| LLM output | Full metadata **+ body** (~1 200 tokens) |
| Input | Raw Crawl4AI markdown (no trimming) |
| Concurrency | 1 (sequential) |

### Baseline results (5 pages, sequential)

| Page | Chars | Time | Status |
|------|-------|------|--------|
| `/about` | 10 766 | 58 670 ms | OK |
| `/agendablog` | 24 408 | — | TIMEOUT (5 min) |
| blog post 1 | 4 239 | 32 339 ms | OK |
| blog post 2 | 2 976 | 36 626 ms | OK |
| blog post 3 | 3 766 | 38 185 ms | OK |

**Average (successes only): 41 455 ms/page**
**Projected full run (860 Ollama pages): ~9.9 hours**

---

## Optimisation 1 — Remove body from LLM output

The LLM was generating ~1 200 tokens per page (body + metadata). Since the
Markdown body already exists in the Crawl4AI output, we removed `body` from the
Zod schema and changed the orchestrator to merge Crawl4AI markdown as the body
directly. The LLM now outputs ~100–200 tokens of metadata only.

**Files changed:** `lib/schemas.ts`, `lib/prompts.ts`, `scripts/orchestrator.ts`

## Optimisation 2 — Reduce context window

Changed `num_ctx` from 32 768 to 8 192. The median page needs ~2 300 input
tokens. A 32K context window is wasteful for this workload — it increases KV
cache memory and slows prefill.

**File changed:** `lib/ollama-client.ts`

## Optimisation 3 — Input trimming

Crawl4AI markdown includes Squarespace nav bars, footer links, newsletter
signup forms, cookie banners, and "Back to Top" links. These are noise for
metadata extraction. We added `trimForExtraction()` that:

1. Strips known boilerplate patterns (nav links, footer, newsletter block)
2. Collapses blank lines
3. Caps at 4 000 characters with a truncation marker

This reduced `/about` from 10 766 → 4 041 chars and `/agendablog` from
24 408 → 4 041 chars (the listing page that previously timed out).

**File changed:** `lib/ollama-client.ts`

## Optimisation 4 — Model selection

Replaced **qwen3:8b** (5.2 GB, thinking model) with **gemma3:4b** (3.3 GB).

Reasons:

| Factor | qwen3:8b | gemma3:4b |
|--------|----------|-----------|
| Size | 5.2 GB | 3.3 GB |
| Parameters | 8.2B | ~4B |
| Thinking mode | Yes (extra output overhead) | No |
| Norwegian support | Good (29+ languages) | Excellent (140+ languages, NB listed) |
| Structured JSON | Good | Excellent (no thinking/schema conflict) |
| tok/s on M4 | ~20–30 | ~80–120 |

Other candidates considered:

- **phi4-mini:3.8b** — runner-up, good at structured tasks, explicit Norwegian
  support, but slightly less multilingual depth than Gemma 3.
- **qwen2.5:3b** — fastest (3B), but weaker Norwegian support.
- **qwen3:4b** — newer but has known issues with thinking mode + structured
  output in Ollama (GitHub issue #10538, #12917).
- **llama3.2:3b** — Norwegian not in official language list.
- **mistral:7b** — good quality but 7B params, ~half the speed of 4B models.

**File changed:** `lib/config.ts` (model name)

## Optimisation 5 — Concurrency support

Added `--concurrency N` CLI flag to the orchestrator. Pages are processed in
batches of N using `Promise.all()`.

**Important finding:** Running concurrent requests against a single Ollama
instance with GPU (M4) actually **slows things down** unless
`OLLAMA_NUM_PARALLEL` is set on the Ollama server. Default is 1 for GPU models.
With concurrency 3 and default Ollama settings, each request took 2–3x longer
due to context-switching overhead (94–157s vs 7–9s sequential).

**File changed:** `scripts/orchestrator.ts`

---

## Results after all optimisations

| Setting | Value |
|---------|-------|
| Model | gemma3:4b (3.3 GB) |
| num_ctx | 8 192 |
| LLM output | Metadata only (~150 tokens) |
| Input | Trimmed, capped at 4 000 chars |
| Concurrency | 1 (sequential — see note above) |

### Optimised results (5 pages, sequential)

| Page | Input chars | Trimmed chars | Time | Status |
|------|-------------|---------------|------|--------|
| `/about` | 10 766 | 4 041 | 9 471 ms | OK |
| `/agendablog` | 24 408 | 4 041 | 7 609 ms | OK |
| blog post 1 | 4 239 | 2 379 | 7 125 ms | OK |
| blog post 2 | 2 976 | 1 243 | 6 861 ms | OK |
| blog post 3 | 3 766 | 1 945 | 8 117 ms | OK |

**Average: 7 837 ms/page**
**Projected full run (860 pages): ~1.9 hours**

### Improvement summary

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Avg time/page | 41 455 ms | 7 837 ms | **5.3x faster** |
| Success rate | 80% (4/5) | 100% (5/5) | **+20%** |
| Projected 860 pages | ~9.9 h | ~1.9 h | **5x faster** |
| Model size | 5.2 GB | 3.3 GB | 37% smaller |

---

## Concurrency experiments

Tested with `OLLAMA_NUM_PARALLEL=4` set on the Ollama server, 10 pages each.

### Ollama parallel config

To enable true parallelism, set `OLLAMA_NUM_PARALLEL` before starting Ollama:

```bash
OLLAMA_NUM_PARALLEL=4 ollama serve
```

Each parallel slot uses its own KV cache, so memory scales linearly. With
gemma3:4b (3.3 GB base + ~1 GB KV per slot) and 48 GB RAM, 4 parallel slots
is easily feasible (~7 GB total).

Without `OLLAMA_NUM_PARALLEL`, concurrent requests are serialised by default
for GPU models, causing **worse** performance than sequential (94–157s/page
vs 7s/page with c=3 and default settings).

### Wall-clock results (10 pages, OLLAMA_NUM_PARALLEL=4)

| Concurrency | Avg time/page | Wall clock (10 pages) | Projected 860 pages |
|-------------|---------------|-----------------------|---------------------|
| 1 | 7 083 ms | **72 s** | **1.7 h** |
| 2 | 11 746 ms | **61 s** | **1.5 h** |
| 3 | 15 793 ms | **62 s** | **1.5 h** |
| 4 | 19 622 ms | **60 s** | **1.4 h** |

### Per-page timing (ms)

| Page | c=1 | c=2 | c=3 | c=4 |
|------|-----|-----|-----|-----|
| /about | 7 352 | 12 687 | 17 998 | 24 767 |
| /agendablog | 7 700 | 12 537 | 17 762 | 24 759 |
| blog: hvordan-engasjere-700 | 7 268 | 11 457 | 18 113 | 24 542 |
| blog: avslutning | 7 035 | 11 698 | 17 487 | 25 042 |
| blog: bli-kjent-runde | 8 284 | 13 523 | 18 871 | 20 744 |
| blog: ideathon-d | 8 735 | 14 122 | 19 473 | 21 348 |
| blog: middag | 3 993 | 7 093 | 11 922 | 14 308 |
| blog: ombord-p-hurtigruten | 4 704 | 7 667 | 13 010 | 15 562 |
| blog: smart-samferdsel | 8 981 | 13 900 | 16 152 | 13 440 |
| blog: workshop-c | 6 773 | 12 771 | 7 146 | 12 405 |

### Key findings

1. **Per-page latency scales linearly with concurrency.** At c=4 each page
   takes ~2.8x longer than sequential, but we process 4 at a time.
2. **Diminishing returns after c=2.** Going from c=1→c=2 saves 15%
   wall-clock, but c=2→c=4 only saves another 2%. The GPU compute is the
   ceiling — more parallelism just divides the same throughput.
3. **c=2 is the sweet spot** — 15% faster than sequential with moderate
   per-page overhead (~1.7x), good tradeoff for a long run.

### Quality stability

Content type classification is **100% deterministic** across all 4 runs. No
concurrency-induced quality degradation observed:

| Metric | c=1 | c=2 | c=3 | c=4 |
|--------|-----|-----|-----|-----|
| Success rate | 10/10 | 10/10 | 10/10 | 10/10 |
| Content types stable | yes | yes | yes | yes |
| Front matter complete | yes | yes | yes | yes |

### Quality issues (applies to all concurrency levels — not concurrency-related)

- `/about` incorrectly classified as `language: "nb"` — should be `"en"`.
  This is a prompt issue (the rule says `/about` → English, but the model
  ignores it), not a concurrency issue.
- 4/10 files missing `featured_image` — pages genuinely lack a hero image
  or the trimming removed image references.
- `/agendablog` classified as `blog` but is actually a blog listing/index
  page. Might warrant a separate `listing` type or filter.
- Body content still has nav/footer boilerplate from Crawl4AI — needs
  post-processing cleanup.

---

## Recommended production config

```bash
# Start Ollama with parallel support
OLLAMA_NUM_PARALLEL=2 ollama serve

# Run extraction with concurrency 2
OLLAMA_HOST=http://localhost:11434 npm run extract -- --tier ollama --concurrency 2
```

| Setting | Value | Reasoning |
|---------|-------|-----------|
| Model | gemma3:4b | Best speed/quality/Norwegian balance |
| num_ctx | 8 192 | Median page needs ~2 300 input tokens |
| OLLAMA_NUM_PARALLEL | 2 | 15% wall-clock gain, moderate overhead |
| --concurrency | 2 | Match Ollama parallel slots |
| Input trimming | 4 000 chars | Strips boilerplate, preserves metadata |

**Projected full run: ~1.5 hours for 860 Ollama pages.**

---

## Body cleanup (`cleanBody()`)

The Crawl4AI markdown includes Squarespace boilerplate (nav bar ×2, logo,
newsletter signup, cookie banner, address line, social media icons, "Back
to Top" links, post navigation). This is used in two places:

1. **LLM input** — `trimForExtraction()` calls `cleanBody()` then caps at
   4 000 chars. This is safe for metadata: analysis of all 919 pages shows
   title, author, date, image, and tags appear in the first 2 000 chars on
   95%+ of pages. The 4K cap does **not** affect the body in the .md file.

2. **Body in .md file** — the orchestrator calls `cleanBody(page.markdown)`
   before writing. This removes boilerplate but preserves the full article
   content (no truncation).

Size reduction examples:

| Page | Raw chars | After cleanBody | Reduction |
|------|-----------|-----------------|-----------|
| /about | 10 766 | ~8 900 | 17% |
| avslutning (short) | 2 976 | 567 | 81% |
| hvordan-engasjere (mid) | 4 239 | 1 648 | 61% |

Shared module: `lib/clean-body.ts`

---

## Optimisation 6 — Eliminate Claude API tier

The original pipeline used a two-tier architecture: Ollama for 860 simple pages
(blog, news) and Claude API for 59 complex pages (events, debates, conferences
with panelists in free-text Norwegian prose).

### Problem: gemma3:4b misclassifies event pages as "blog"

When left to auto-classify (pass 1), gemma3:4b classified all 5 test event
pages as `blog`. This meant the two-pass system never triggered the
`EventExtras` schema (pass 2), resulting in:

- 0 panelists extracted
- No moderator, event_date, event_time, or venue

### Solution: force content type from URL pattern matching

The URL pattern router (`classifyPage()` in config.ts) already knows which
pages are events, debates, and conferences. Instead of relying on the LLM to
classify, we **force the content type** and skip the classification pass.

When forced to `content_type: event`, gemma3:4b extracts panelists excellently:

```
Panelists (4):
  - Lene Conradi | Ordfører i Asker kommune | Asker kommune
  - Ida Pinnerød | Ordfører i Bodø | Bodø
  - Cecilie Nødtvedt | Rådgiver bærekraft & miljø, JM Norge | JM Norge
  - Gro Sandkjær Hanssen | Samfunnsforsker, NIBR-OsloMet | OsloMet
```

### Test results (forced type vs auto-classify)

| Page | Auto | Forced | Panelists | Moderator |
|------|------|--------|-----------|-----------|
| debatt-erfaringer (8K) | blog, 0 panelists | event, 4 panelists | ✅ | — |
| debatt-boligmarked (8K) | blog, 0 panelists | event, 4 panelists | ✅ | — |
| smartbydebatten2022 (22K) | blog, 0 panelists | event, 3 panelists | ✅ | ✅ Ingunn Yssen |
| evolve2021 (30K) | blog, no conf data | conference ✅ | n/a | n/a |

### 4K truncation is safe for panelist data

Panelists, moderator, and event metadata appear in the first 2–4K chars on
these pages (typically in **bold** text near the top). The 4K cap was tested
against 8K — identical or better results at 4K.

### Architecture change

**Before:** Two-tier (Ollama + Claude API)
- 860 pages → Ollama (gemma3:4b)
- 59 pages → Claude API (~$0.50–1.00 per full run)
- Required ANTHROPIC_API_KEY

**After:** Single-tier (all Ollama)
- 919 pages → Ollama (gemma3:4b)
- 59 complex pages get a forced `contentTypeHint` from URL patterns
- No external API dependency, no API key needed, free to run

**Files changed:** `lib/config.ts` (added `COMPLEX_PATTERNS` with content type
hints, `classifyPage()` returns `{ tier, contentTypeHint }`),
`lib/ollama-client.ts` (new `contentTypeHint` parameter),
`scripts/orchestrator.ts` (removed Claude import, all pages → Ollama)

---

## Final architecture

```
Crawl4AI JSON (919 pages)
  │
  ├─ URL pattern match? ──→ contentTypeHint (event/conference/page)
  │                          Skip classification, go straight to archetype schema
  │
  └─ No match ──→ Auto-classify via BaseSchema (pass 1)
                  If simple type → done (single pass)
                  If complex type → pass 2 with archetype schema
  │
  └─ cleanBody() → .md file body (full content, no truncation)
```

### Projected full run (919 pages)

| Setting | Value |
|---------|-------|
| Model | gemma3:4b (3.3 GB) |
| num_ctx | 8 192 |
| OLLAMA_NUM_PARALLEL | 2 |
| --concurrency | 2 |
| Input trimming | 4 000 chars |
| Forced types | 59 pages (event/conference) |
| External API | None |

**Projected: ~2 hours for all 919 pages** (forced-type pages take ~12s each
due to the larger archetype schema, auto-classified pages ~7s each).

---

## Next steps

- [ ] Fix `/about` language detection (either hardcode or improve prompt)
- [x] Add body cleanup post-processing (strip nav/footer from Crawl4AI markdown)
- [x] Eliminate Claude API tier (gemma3:4b handles events with forced type)
- [ ] Consider filtering out listing pages (`/agendablog`) from extraction
- [ ] Test on a larger sample (50+ pages) to validate consistency at scale
- [ ] Profile phi4-mini:3.8b as alternative if gemma3 shows quality issues
