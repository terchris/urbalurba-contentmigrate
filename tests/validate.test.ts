/**
 * validate.test.ts
 *
 * Tests the validateFile function from the refactored validate.ts.
 * Uses temporary .md files with known-good and known-bad frontmatter.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { validateFile } from "../scripts/validate.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let tempDir: string;
let contentDir: string;

const REQUIRED_FIELDS: Record<string, string[]> = {
  blog: ["title", "slug", "date", "body"],
  event: ["title", "slug", "body", "event_date"],
  person: ["title", "slug", "full_name"],
};

const KNOWN_TYPES = ["blog", "event", "person", "page"];

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-test-"));
  contentDir = tempDir;
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function writeTestFile(name: string, content: string): string {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateFile", () => {
  it("passes for a valid blog post", () => {
    const file = writeTestFile(
      "good-blog.md",
      `---
content_type: blog
title: My Great Post
slug: my-great-post
date: "2024-01-15"
language: nb
author: Terje Christensen
description: A great post about things.
source_url: https://example.com/my-great-post
tags:
  - smart city
  - arendalsuka
---

This is the body of a great blog post. It has enough content to be valid.
`
    );

    const result = validateFile(file, contentDir, REQUIRED_FIELDS, KNOWN_TYPES);
    expect(result.valid).toBe(true);
    expect(result.archetype).toBe("blog");
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("fails when content_type is missing", () => {
    const file = writeTestFile(
      "no-type.md",
      `---
title: No Type
slug: no-type
---

Body content here.
`
    );

    const result = validateFile(file, contentDir, REQUIRED_FIELDS, KNOWN_TYPES);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("Missing content_type"))).toBe(true);
  });

  it("fails when required title is missing for blog", () => {
    const file = writeTestFile(
      "no-title.md",
      `---
content_type: blog
slug: no-title
date: "2024-01-15"
---

Body content here.
`
    );

    const result = validateFile(file, contentDir, REQUIRED_FIELDS, KNOWN_TYPES);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("title"))).toBe(true);
  });

  it("fails when body is too short for blog", () => {
    const file = writeTestFile(
      "short-body.md",
      `---
content_type: blog
title: Short Body
slug: short-body
date: "2024-01-15"
---

Hi.
`
    );

    const result = validateFile(file, contentDir, REQUIRED_FIELDS, KNOWN_TYPES);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("Body content"))).toBe(true);
  });

  it("fails when event_date is missing for event", () => {
    const file = writeTestFile(
      "no-event-date.md",
      `---
content_type: event
title: Smartbydebatten
slug: smartbydebatten
---

A debate about smart cities with panelists discussing urban development.
`
    );

    const result = validateFile(file, contentDir, REQUIRED_FIELDS, KNOWN_TYPES);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("event_date"))).toBe(true);
  });

  it("warns about invalid date format", () => {
    const file = writeTestFile(
      "bad-date.md",
      `---
content_type: blog
title: Bad Date
slug: bad-date
date: "January 15, 2024"
---

This blog post has a badly formatted date in the frontmatter.
`
    );

    const result = validateFile(file, contentDir, REQUIRED_FIELDS, KNOWN_TYPES);
    expect(result.issues.some((i) => i.message.includes("Invalid date format"))).toBe(true);
  });

  it("warns about invalid language", () => {
    const file = writeTestFile(
      "bad-lang.md",
      `---
content_type: blog
title: Bad Language
slug: bad-lang
date: "2024-01-15"
language: fr
---

Content with French language code which we don't support.
`
    );

    const result = validateFile(file, contentDir, REQUIRED_FIELDS, KNOWN_TYPES);
    expect(result.issues.some((i) => i.message.includes("Invalid language"))).toBe(true);
  });

  it("warns about unknown archetype", () => {
    const file = writeTestFile(
      "unknown-type.md",
      `---
content_type: podcast
title: Unknown Type
slug: unknown-type
---

Content with an unknown content type.
`
    );

    const result = validateFile(file, contentDir, REQUIRED_FIELDS, KNOWN_TYPES);
    expect(result.issues.some((i) => i.message.includes("Unknown archetype"))).toBe(true);
  });

  it("warns about slug with uppercase", () => {
    const file = writeTestFile(
      "upper-slug.md",
      `---
content_type: page
title: Upper Slug
slug: Upper-Slug
---

Content with uppercase slug.
`
    );

    const result = validateFile(file, contentDir, REQUIRED_FIELDS, KNOWN_TYPES);
    expect(result.issues.some((i) => i.message.includes("Slug contains uppercase"))).toBe(true);
  });

  it("passes for a valid person entry", () => {
    const file = writeTestFile(
      "good-person.md",
      `---
content_type: person
title: Ola Nordmann
slug: ola-nordmann
full_name: Ola Nordmann
job_title: Director
organization: Smart Cities Norway
---

A profile page.
`
    );

    const result = validateFile(file, contentDir, REQUIRED_FIELDS, KNOWN_TYPES);
    expect(result.valid).toBe(true);
    expect(result.archetype).toBe("person");
  });
});
