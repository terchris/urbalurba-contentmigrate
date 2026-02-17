#!/usr/bin/env python3
"""
crawl_site.py — Crawl a website and extract clean Markdown + metadata.

Crawls all discoverable pages from a site, extracts clean Markdown content
and metadata, and saves results as JSON files for the TypeScript enrichment
pipeline to consume.

Usage:
    # Crawl smartebyernorge.no (default)
    python crawl_site.py

    # Crawl with a limit (for testing)
    python crawl_site.py --limit 10

    # Crawl a different site
    python crawl_site.py --url https://www.rodekors.no --limit 5

    # Use local wget mirror instead of live site
    python crawl_site.py --local /workspace/wget/www.smartebyernorge.no

Output:
    ../reports/crawl-manifest.json  — Summary of all crawled pages
    ../crawl-output/{slug}.json     — Per-page data (markdown, metadata, links, images)
"""

import asyncio
import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse, urljoin
from typing import Optional

from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode, BrowserConfig
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator
from crawl4ai.content_filter_strategy import PruningContentFilter


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DEFAULT_URL = "https://www.smartebyernorge.no"
OUTPUT_DIR = Path(__file__).parent.parent / "crawl-output"
REPORTS_DIR = Path(__file__).parent.parent / "reports"

# Pages to skip (common non-content patterns)
SKIP_PATTERNS = [
    r"\?",                  # Query parameters (filters, pagination)
    r"/category/",          # Category listing pages
    r"/tag/",               # Tag listing pages
    r"/author/",            # Author listing pages
    r"\?format=rss",        # RSS feeds
    r"/cart",               # Shopping cart
    r"/search",             # Search pages
    r"/login",              # Login pages
    r"\.pdf$",              # PDF files
    r"\.jpg$|\.png$|\.gif$",# Image files
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def url_to_slug(url: str, base_url: str) -> str:
    """Convert URL to a filesystem-safe slug."""
    parsed = urlparse(url)
    path = parsed.path.strip("/")
    if not path:
        return "_index"
    # Replace slashes with double underscores for flat file structure
    slug = path.replace("/", "__")
    # Remove unsafe chars
    slug = re.sub(r"[^a-zA-Z0-9_\-]", "_", slug)
    return slug


def should_skip(url: str) -> bool:
    """Check if URL should be skipped."""
    for pattern in SKIP_PATTERNS:
        if re.search(pattern, url):
            return True
    return False


def extract_metadata_from_result(result) -> dict:
    """Extract useful metadata from a CrawlResult."""
    metadata = {}

    # Get metadata dict if available
    if result.metadata:
        metadata = dict(result.metadata)

    # Extract images from media
    images = []
    if result.media and "images" in result.media:
        for img in result.media["images"]:
            images.append({
                "src": img.get("src", ""),
                "alt": img.get("alt", ""),
                "desc": img.get("desc", ""),
            })

    # Extract internal links
    internal_links = []
    if result.links and "internal" in result.links:
        for link in result.links["internal"]:
            internal_links.append({
                "href": link.get("href", ""),
                "text": link.get("text", ""),
            })

    return {
        "page_metadata": metadata,
        "images": images,
        "internal_links": internal_links,
        "external_links": result.links.get("external", []) if result.links else [],
    }


# ---------------------------------------------------------------------------
# Discovery: find all pages on the site
# ---------------------------------------------------------------------------

async def discover_pages(crawler, base_url: str, config: CrawlerRunConfig, limit: Optional[int] = None) -> list[str]:
    """
    Crawl the site starting from base_url and discover all internal pages.
    Uses a breadth-first approach following internal links.
    """
    discovered = set()
    to_visit = [base_url]
    visited = set()
    base_domain = urlparse(base_url).netloc

    print(f"\n🔍 Discovering pages on {base_url}...")

    while to_visit:
        url = to_visit.pop(0)

        if url in visited:
            continue
        if should_skip(url):
            continue
        if limit and len(discovered) >= limit:
            break

        visited.add(url)

        try:
            result = await crawler.arun(url=url, config=config)
            if not result.success:
                continue

            # This is a valid page
            discovered.add(url)
            print(f"   [{len(discovered)}] {url}")

            # Find new internal links to follow
            if result.links and "internal" in result.links:
                for link in result.links["internal"]:
                    href = link.get("href", "")
                    if not href:
                        continue

                    # Make absolute
                    full_url = urljoin(url, href)

                    # Strip fragments and query params
                    parsed = urlparse(full_url)
                    clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
                    if clean_url.endswith("/"):
                        clean_url = clean_url[:-1]

                    # Only follow same-domain links
                    if urlparse(clean_url).netloc == base_domain:
                        if clean_url not in visited and clean_url not in to_visit:
                            if not should_skip(clean_url):
                                to_visit.append(clean_url)

        except Exception as e:
            print(f"   ⚠️  Error discovering {url}: {e}")
            continue

    print(f"\n   ✅ Discovered {len(discovered)} pages")
    return sorted(discovered)


# ---------------------------------------------------------------------------
# Extraction: crawl each page and save results
# ---------------------------------------------------------------------------

async def extract_pages(crawler, pages: list[str], base_url: str, config: CrawlerRunConfig) -> list[dict]:
    """Crawl each discovered page and save clean Markdown + metadata."""

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    results = []
    total = len(pages)

    print(f"\n🚀 Extracting {total} pages...\n")

    for i, url in enumerate(pages):
        slug = url_to_slug(url, base_url)
        progress = f"[{i+1}/{total}]"
        start = time.time()

        try:
            result = await crawler.arun(url=url, config=config)
            elapsed = round(time.time() - start, 1)

            if not result.success:
                print(f"{progress} ❌ {url} — {result.error_message}")
                results.append({
                    "url": url,
                    "slug": slug,
                    "success": False,
                    "error": result.error_message,
                })
                continue

            # Get markdown
            md = result.markdown
            if hasattr(md, 'raw_markdown'):
                raw_md = md.raw_markdown
                fit_md = md.fit_markdown if hasattr(md, 'fit_markdown') else None
            else:
                raw_md = str(md)
                fit_md = None

            # Get metadata
            meta = extract_metadata_from_result(result)

            # Build output
            # Use raw_markdown for completeness — PruningContentFilter
            # is too aggressive for content migration (cuts titles, panelists, etc.)
            page_data = {
                "url": url,
                "slug": slug,
                "url_path": urlparse(url).path,
                "success": True,
                "elapsed_seconds": elapsed,
                "markdown": raw_md,  # Raw for completeness
                "fit_markdown": fit_md,  # Keep filtered version for reference
                "raw_markdown": raw_md,
                "metadata": meta,
                "html_length": len(result.html) if result.html else 0,
                "markdown_length": len(raw_md),
            }

            # Save per-page JSON
            output_path = OUTPUT_DIR / f"{slug}.json"
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(page_data, f, ensure_ascii=False, indent=2)

            print(f"{progress} ✅ {url} ({elapsed}s, {len(raw_md)} chars)")
            results.append({
                "url": url,
                "slug": slug,
                "success": True,
                "elapsed_seconds": elapsed,
                "markdown_length": len(raw_md),
                "images": len(meta["images"]),
                "output_file": str(output_path.relative_to(OUTPUT_DIR.parent)),
            })

        except Exception as e:
            print(f"{progress} ❌ {url} — {e}")
            results.append({
                "url": url,
                "slug": slug,
                "success": False,
                "error": str(e),
            })

    return results


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main():
    parser = argparse.ArgumentParser(description="Crawl a website and extract Markdown")
    parser.add_argument("--url", default=DEFAULT_URL, help="Base URL to crawl")
    parser.add_argument("--limit", type=int, default=None, help="Max pages to crawl (for testing)")
    parser.add_argument("--local", type=str, default=None, help="Path to local wget mirror (use file:// instead of live)")
    args = parser.parse_args()

    base_url = args.url
    if args.local:
        base_url = f"file://{os.path.abspath(args.local)}/index.html"

    print("=" * 60)
    print(f"  Crawl4AI Site Extraction")
    print(f"  Target: {base_url}")
    if args.limit:
        print(f"  Limit: {args.limit} pages")
    print("=" * 60)

    # Configure browser
    browser_config = BrowserConfig(
        headless=True,
        verbose=False,
    )

    # Configure crawl with PruningContentFilter for noise removal
    prune_filter = PruningContentFilter(
        threshold=0.4,
        threshold_type="fixed",
        min_word_threshold=20,
    )

    crawl_config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        markdown_generator=DefaultMarkdownGenerator(
            content_filter=prune_filter,
            options={
                "skip_internal_links": False,  # Keep links for discovery
                "include_sup_sub": True,
            },
        ),
        exclude_external_links=False,
        word_count_threshold=5,
    )

    async with AsyncWebCrawler(config=browser_config) as crawler:
        # Phase 1: Discover all pages
        pages = await discover_pages(crawler, base_url, crawl_config, limit=args.limit)

        if not pages:
            print("\n❌ No pages discovered!")
            sys.exit(1)

        # Phase 2: Extract each page
        results = await extract_pages(crawler, pages, base_url, crawl_config)

    # Write manifest
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = REPORTS_DIR / "crawl-manifest.json"

    success_count = sum(1 for r in results if r.get("success"))
    fail_count = sum(1 for r in results if not r.get("success"))

    manifest = {
        "base_url": args.url,
        "crawled_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_pages": len(results),
        "success": success_count,
        "failed": fail_count,
        "pages": results,
    }

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    # Summary
    print(f"\n{'=' * 60}")
    print(f"  Crawl complete!")
    print(f"  ✅ Success: {success_count}/{len(results)}")
    print(f"  ❌ Failed:  {fail_count}/{len(results)}")
    print(f"  📂 Output:  {OUTPUT_DIR}")
    print(f"  📄 Manifest: {manifest_path}")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    asyncio.run(main())
