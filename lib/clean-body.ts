/**
 * clean-body.ts
 *
 * Strips Squarespace boilerplate (navigation, footer, newsletter signup,
 * cookie banners) from Crawl4AI markdown. Used in two places:
 *
 * 1. `trimForExtraction()` in ollama-client.ts — for LLM input (adds 4K cap)
 * 2. `cleanBody()` in orchestrator.ts — for the body written to .md files
 *
 * The cleaning is aggressive on structural boilerplate but preserves all
 * article content, images, and links.
 */

/**
 * Remove Squarespace boilerplate from Crawl4AI markdown.
 * Preserves the article body, images, and inline links.
 *
 * @param markdown - Raw Crawl4AI markdown
 * @returns Cleaned markdown with boilerplate removed
 */
export function cleanBody(markdown: string): string {
  let text = markdown;

  // ---------------------------------------------------------------------------
  // Header / navigation boilerplate
  // ---------------------------------------------------------------------------

  // Nav links block (repeated menu links — appears twice in every page)
  text = text.replace(
    /^\s*\[?\s*(Hjem|Arrangement|Kurs|Tjenester|Nettverk|Ressurser|Om oss|English)\s*\]?\s*\([^)]*\)\s*$/gm,
    ""
  );

  // Logo image line: # [![Smarte Byer Norge](...)](#)
  text = text.replace(
    /^#\s*\[!\[Smarte Byer Norge\]\([^)]*\)\]\([^)]*\)\s*$/gm,
    ""
  );

  // Page title line that duplicates the H1 (first line: "Title — Smarte Byer Norge")
  // Only strip the first occurrence at the very top of the document
  text = text.replace(/^.*\s*—\s*Smarte Byer Norge\s*$/m, "");

  // ---------------------------------------------------------------------------
  // Footer boilerplate
  // ---------------------------------------------------------------------------

  // Newsletter signup block (### MELD DEG PÅ ... through the "SEND" button and response)
  text = text.replace(/###?\s*MELD DEG PÅ VÅRT NYHETSBREV[\s\S]*?(?:Takk!.*\n|SEND\n)/g, "");
  // Catch any remaining "Email Address\nSEND\nTakk..." fragments
  text = text.replace(/^Email Address\s*$/gm, "");
  text = text.replace(/^SEND\s*$/gm, "");
  text = text.replace(/^Takk! Vi har sendt deg en e-post\.\s*$/gm, "");

  // Cookie/privacy footer
  text = text.replace(
    /Vi arbeider etter Vær Varsom.*$/gms,
    ""
  );

  // Address line
  text = text.replace(/^Smarte Byer Norge, c\/o.*$/gm, "");

  // Social media icon links (empty link text with Facebook/LinkedIn URLs)
  // These may appear multiple on the same line: [ ](fb)[ ](linkedin)
  text = text.replace(
    /\[\s*\]\(https?:\/\/(?:www\.)?(?:facebook|linkedin)\.com[^)]*\)\s*/g,
    ""
  );

  // Footer image asset (the small decorative image above the footer)
  text = text.replace(
    /^!\[\]\(https:\/\/images\.squarespace-cdn\.com\/content\/v1\/56fc08f17c65e4e90c66db4c\/1476204400336[^)]*\)\s*$/gm,
    ""
  );

  // ---------------------------------------------------------------------------
  // Post navigation
  // ---------------------------------------------------------------------------

  // "Back to Top" links
  text = text.replace(/\[Back to Top\][^\n]*/g, "");

  // Newer/Older Post navigation
  text = text.replace(/Newer Post\[.*?\]\([^)]*\)/g, "");
  text = text.replace(/Older Post\[.*?\]\([^)]*\)/g, "");

  // ---------------------------------------------------------------------------
  // Duplicate metadata lines (byline, date, category repeated 2-3 times)
  // ---------------------------------------------------------------------------

  // Remove duplicate author links (keep only the first one)
  // Pattern: [Author Name](/agendablog?author=...)
  const authorPattern = /^\[([^\]]+)\]\(https?:\/\/www\.smartebyernorge\.no\/agendablog\?author=[^)]*\)\s*$/gm;
  let authorCount = 0;
  text = text.replace(authorPattern, (match) => {
    authorCount++;
    return authorCount <= 1 ? match : "";
  });

  // Remove duplicate date links (keep only the first one)
  // Pattern: [2. januar 2018](/agendablog/2018/1/2/...)
  const dateLinkPattern = /^\[\d+\.\s+\w+\s+\d{4}\]\(https?:\/\/www\.smartebyernorge\.no\/agendablog\/[^)]*\)\s*$/gm;
  let dateCount = 0;
  text = text.replace(dateLinkPattern, (match) => {
    dateCount++;
    return dateCount <= 1 ? match : "";
  });

  // Remove duplicate category links (keep only the first occurrence)
  // Pattern: [Dag1](/agendablog?category=...) or [Dag1](/agendablog/category/...)
  const categoryPattern = /^\[([^\]]+)\]\(https?:\/\/www\.smartebyernorge\.no\/agendablog[/?]category[=/][^)]*\)\s*$/gm;
  const seenCategories = new Set<string>();
  text = text.replace(categoryPattern, (match, name: string) => {
    if (seenCategories.has(name)) return "";
    seenCategories.add(name);
    return match;
  });

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  // Collapse multiple blank lines
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  return text;
}
