#!/usr/bin/env python3
"""
setup.py — Install and verify Crawl4AI in the devcontainer.

Usage:
    cd /workspace/migration/crawl
    pip install -r requirements.txt
    crawl4ai-setup          # installs Playwright browsers
    python setup.py         # verify everything works
"""

import asyncio
import sys

async def verify():
    print("=" * 60)
    print("  Crawl4AI Environment Check")
    print("=" * 60)

    # 1. Import check
    try:
        from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode
        from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator
        from crawl4ai.content_filter_strategy import PruningContentFilter
        print("\n✅ Crawl4AI imported successfully")
    except ImportError as e:
        print(f"\n❌ Import failed: {e}")
        print("   Run: pip install -r requirements.txt && crawl4ai-setup")
        sys.exit(1)

    # 2. Quick crawl test
    print("\n🔍 Testing with a simple crawl...")
    try:
        async with AsyncWebCrawler() as crawler:
            config = CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                markdown_generator=DefaultMarkdownGenerator(
                    options={"skip_internal_links": True}
                ),
            )
            result = await crawler.arun(
                url="https://www.smartebyernorge.no/about",
                config=config,
            )

            if result.success:
                md = result.markdown
                md_text = md.raw_markdown if hasattr(md, 'raw_markdown') else str(md)
                print(f"✅ Crawl succeeded!")
                print(f"   URL: {result.url}")
                print(f"   Markdown length: {len(md_text)} chars")
                print(f"   Links found: {len(result.links.get('internal', []))} internal, {len(result.links.get('external', []))} external")
                print(f"   Media found: {len(result.media.get('images', []))}")
                print(f"\n   First 300 chars of markdown:")
                print(f"   {md_text[:300]}")
            else:
                print(f"❌ Crawl failed: {result.error_message}")
                sys.exit(1)

    except Exception as e:
        print(f"❌ Crawl test failed: {e}")
        print("   Make sure crawl4ai-setup has been run (installs Playwright browsers)")
        sys.exit(1)

    print(f"\n{'=' * 60}")
    print("  ✅ Crawl4AI is ready!")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    asyncio.run(verify())
