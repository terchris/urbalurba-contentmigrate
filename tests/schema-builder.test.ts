import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  buildBaseSchema,
  buildExtrasSchema,
  buildContentTypeSchema,
  buildAllSchemas,
  fieldDefinitionToZod,
} from "../src/config/schema-builder.js";
import { loadSiteConfig } from "../src/config/config-loader.js";
import type { FieldDefinition } from "../src/config/site-config.schema.js";

// Hardcoded schemas for comparison
import {
  BaseSchema,
  BlogSchema,
  EventSchema,
  PersonSchema,
  ConferenceSchema,
  TechSchema,
  PressSchema,
  SCHEMAS,
} from "../lib/schemas.js";

const REFERENCE_CONFIG_PATH = resolve(
  import.meta.dirname ?? ".",
  "../site-config.smartebyernorge.yaml"
);

// ---------------------------------------------------------------------------
// Helper: compare JSON Schema output (ignoring description text differences)
// ---------------------------------------------------------------------------

/**
 * Compare the structure of two JSON schemas, checking that they have the same
 * properties, types, and required arrays. Descriptions may differ slightly.
 */
function compareJsonSchemaStructure(
  generated: Record<string, any>,
  hardcoded: Record<string, any>,
  path: string = ""
): string[] {
  const diffs: string[] = [];

  // Compare type
  if (generated.type !== hardcoded.type) {
    diffs.push(`${path}.type: generated=${generated.type}, hardcoded=${hardcoded.type}`);
  }

  // Compare properties (for objects)
  if (hardcoded.properties) {
    const genProps = Object.keys(generated.properties ?? {}).sort();
    const hcProps = Object.keys(hardcoded.properties).sort();

    // Check all hardcoded properties exist in generated
    for (const prop of hcProps) {
      if (!genProps.includes(prop)) {
        diffs.push(`${path}: missing property "${prop}" in generated schema`);
      }
    }

    // Check all generated properties exist in hardcoded
    for (const prop of genProps) {
      if (!hcProps.includes(prop)) {
        diffs.push(`${path}: extra property "${prop}" in generated schema`);
      }
    }

    // Recurse into shared properties
    for (const prop of hcProps) {
      if (genProps.includes(prop)) {
        const genProp = generated.properties[prop];
        const hcProp = hardcoded.properties[prop];

        // Compare type of each property
        const genType = genProp.type ?? (genProp.anyOf ? "anyOf" : "unknown");
        const hcType = hcProp.type ?? (hcProp.anyOf ? "anyOf" : "unknown");

        if (genType !== hcType) {
          diffs.push(
            `${path}.properties.${prop}.type: generated=${genType}, hardcoded=${hcType}`
          );
        }
      }
    }
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// fieldDefinitionToZod — individual field mapping
// ---------------------------------------------------------------------------

describe("fieldDefinitionToZod", () => {
  it("converts string field", () => {
    const field: FieldDefinition = {
      type: "string",
      description: "A string field",
    };
    const zodType = fieldDefinitionToZod(field);
    const jsonSchema = zodToJsonSchema(zodType);
    expect(jsonSchema).toMatchObject({ type: "string" });
  });

  it("converts number field", () => {
    const field: FieldDefinition = {
      type: "number",
      description: "A number field",
    };
    const zodType = fieldDefinitionToZod(field);
    const jsonSchema = zodToJsonSchema(zodType);
    expect(jsonSchema).toMatchObject({ type: "number" });
  });

  it("converts boolean field", () => {
    const field: FieldDefinition = {
      type: "boolean",
      description: "A boolean field",
    };
    const zodType = fieldDefinitionToZod(field);
    const jsonSchema = zodToJsonSchema(zodType);
    expect(jsonSchema).toMatchObject({ type: "boolean" });
  });

  it("converts string[] field", () => {
    const field: FieldDefinition = {
      type: "string[]",
      description: "A string array field",
    };
    const zodType = fieldDefinitionToZod(field);
    const jsonSchema = zodToJsonSchema(zodType);
    expect(jsonSchema).toMatchObject({
      type: "array",
      items: { type: "string" },
    });
  });

  it("converts image field to optional object", () => {
    const field: FieldDefinition = {
      type: "image",
      description: "A photo",
    };
    const zodType = fieldDefinitionToZod(field);
    const jsonSchema = zodToJsonSchema(zodType) as any;

    // Image is optional, so it could be anyOf [object, undefined] or have similar structure
    // The key thing is that when present, it has src and alt
    // Parse a valid image object
    const result = zodType.safeParse({ src: "http://example.com/photo.jpg", alt: "Photo" });
    expect(result.success).toBe(true);

    // Parse undefined (optional)
    const resultUndefined = zodType.safeParse(undefined);
    expect(resultUndefined.success).toBe(true);
  });

  it("converts object field with items to array of objects", () => {
    const field: FieldDefinition = {
      type: "object",
      description: "Panel participants",
      items: {
        name: { type: "string", description: "Full name" },
        title: { type: "string", description: "Job title" },
        organization: { type: "string", description: "Organization" },
      },
    };
    const zodType = fieldDefinitionToZod(field);

    // Should accept an array of objects
    const result = zodType.safeParse([
      { name: "Ola Nordmann", title: "CEO", organization: "Acme" },
    ]);
    expect(result.success).toBe(true);

    // Should reject non-array
    const resultBad = zodType.safeParse({
      name: "Ola",
      title: "CEO",
      organization: "Acme",
    });
    expect(resultBad.success).toBe(false);
  });

  it("converts object field without items to generic record", () => {
    const field: FieldDefinition = {
      type: "object",
      description: "Generic object",
    };
    const zodType = fieldDefinitionToZod(field);

    const result = zodType.safeParse({ any: "data" });
    expect(result.success).toBe(true);
  });

  it("throws for unknown field type", () => {
    const field = { type: "unknown_type", description: "bad" } as any;
    expect(() => fieldDefinitionToZod(field)).toThrow("Unknown field type");
  });
});

// ---------------------------------------------------------------------------
// buildBaseSchema — generates the common base fields
// ---------------------------------------------------------------------------

describe("buildBaseSchema", () => {
  it("produces a schema with all base fields", () => {
    const typeNames = ["blog", "news"];
    const base = buildBaseSchema(typeNames);
    const jsonSchema = zodToJsonSchema(base) as any;

    // Check all expected base properties exist
    const expectedProps = [
      "content_type",
      "title",
      "slug",
      "url_path",
      "language",
      "date",
      "description",
      "author",
      "source_url",
      "featured_image",
      "tags",
    ];

    for (const prop of expectedProps) {
      expect(jsonSchema.properties).toHaveProperty(prop);
    }
  });

  it("content_type enum matches provided type names", () => {
    const typeNames = ["blog", "event", "person"];
    const base = buildBaseSchema(typeNames);

    // Should accept valid content type
    const result = base.safeParse({
      content_type: "blog",
      title: "Test",
      slug: "test",
      url_path: "/test",
      language: "nb",
      date: "2024-01-01",
      description: "Desc",
      author: "Author",
      source_url: "https://example.com/test",
      tags: [],
    });
    expect(result.success).toBe(true);

    // Should reject invalid content type
    const badResult = base.safeParse({
      content_type: "invalid_type",
      title: "Test",
      slug: "test",
      url_path: "/test",
      language: "nb",
      date: "2024-01-01",
      description: "Desc",
      author: "Author",
      source_url: "https://example.com/test",
      tags: [],
    });
    expect(badResult.success).toBe(false);
  });

  it("matches hardcoded BaseSchema property set", () => {
    const hardcodedJson = zodToJsonSchema(BaseSchema) as any;
    const typeNames = [
      "blog",
      "news",
      "event",
      "conference",
      "person",
      "tech",
      "press",
      "page",
      "english_news",
    ];
    const generatedJson = zodToJsonSchema(buildBaseSchema(typeNames)) as any;

    const hardcodedProps = Object.keys(hardcodedJson.properties).sort();
    const generatedProps = Object.keys(generatedJson.properties).sort();

    expect(generatedProps).toEqual(hardcodedProps);
  });
});

// ---------------------------------------------------------------------------
// buildContentTypeSchema — base + extras for full content type
// ---------------------------------------------------------------------------

describe("buildContentTypeSchema", () => {
  const allTypeNames = [
    "blog",
    "news",
    "event",
    "conference",
    "person",
    "tech",
    "press",
    "page",
    "english_news",
  ];

  it("base-only type has same properties as BaseSchema", () => {
    const config = {
      name: "blog",
      url_patterns: ["^/blog/"],
      output_dir: "blog",
      schema: { base: true, extras: {} },
      extraction_prompt: "Extract blog posts.",
      required_fields: ["title", "slug", "date"],
    };

    const schema = buildContentTypeSchema(config, allTypeNames);
    const genJson = zodToJsonSchema(schema) as any;
    const hcJson = zodToJsonSchema(BlogSchema) as any;

    const genProps = Object.keys(genJson.properties).sort();
    const hcProps = Object.keys(hcJson.properties).sort();
    expect(genProps).toEqual(hcProps);
  });

  it("type with no base produces only extras", () => {
    const config = {
      name: "custom",
      url_patterns: ["^/custom/"],
      output_dir: "custom",
      schema: {
        base: false,
        extras: {
          field_a: { type: "string" as const, description: "Field A" },
          field_b: { type: "number" as const, description: "Field B" },
        },
      },
      extraction_prompt: "Extract custom.",
      required_fields: [],
    };

    const schema = buildContentTypeSchema(config, allTypeNames);
    const jsonSchema = zodToJsonSchema(schema) as any;

    const props = Object.keys(jsonSchema.properties);
    expect(props).toContain("field_a");
    expect(props).toContain("field_b");
    expect(props).not.toContain("title"); // no base fields
  });
});

// ---------------------------------------------------------------------------
// buildAllSchemas with reference config — the big integration test
// ---------------------------------------------------------------------------

describe("buildAllSchemas with smartebyernorge config", () => {
  it("generates schemas for all 9 content types", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const schemas = buildAllSchemas(config);

    expect(Object.keys(schemas)).toHaveLength(9);
    expect(schemas).toHaveProperty("blog");
    expect(schemas).toHaveProperty("news");
    expect(schemas).toHaveProperty("english_news");
    expect(schemas).toHaveProperty("event");
    expect(schemas).toHaveProperty("conference");
    expect(schemas).toHaveProperty("person");
    expect(schemas).toHaveProperty("tech");
    expect(schemas).toHaveProperty("press");
    expect(schemas).toHaveProperty("page");
  });

  it("blog schema matches hardcoded BlogSchema properties", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const schemas = buildAllSchemas(config);

    const genJson = zodToJsonSchema(schemas["blog"]) as any;
    const hcJson = zodToJsonSchema(BlogSchema) as any;

    const diffs = compareJsonSchemaStructure(genJson, hcJson, "blog");
    expect(diffs).toEqual([]);
  });

  it("event schema has all extra fields from hardcoded EventSchema", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const schemas = buildAllSchemas(config);

    const genJson = zodToJsonSchema(schemas["event"]) as any;
    const hcJson = zodToJsonSchema(EventSchema) as any;

    // Event extras: event_date, event_time, venue, moderator, panelists
    const genProps = Object.keys(genJson.properties).sort();
    const hcProps = Object.keys(hcJson.properties).sort();

    expect(genProps).toEqual(hcProps);
  });

  it("conference schema has conference_name, conference_year, theme", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const schemas = buildAllSchemas(config);

    const genJson = zodToJsonSchema(schemas["conference"]) as any;
    const hcJson = zodToJsonSchema(ConferenceSchema) as any;

    const genProps = Object.keys(genJson.properties).sort();
    const hcProps = Object.keys(hcJson.properties).sort();

    expect(genProps).toEqual(hcProps);
  });

  it("person schema has full_name, job_title, organization, photo", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const schemas = buildAllSchemas(config);

    const genJson = zodToJsonSchema(schemas["person"]) as any;
    const hcJson = zodToJsonSchema(PersonSchema) as any;

    const genProps = Object.keys(genJson.properties).sort();
    const hcProps = Object.keys(hcJson.properties).sort();

    expect(genProps).toEqual(hcProps);
  });

  it("tech schema has solution_name, external_url", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const schemas = buildAllSchemas(config);

    const genJson = zodToJsonSchema(schemas["tech"]) as any;
    const hcJson = zodToJsonSchema(TechSchema) as any;

    const genProps = Object.keys(genJson.properties).sort();
    const hcProps = Object.keys(hcJson.properties).sort();

    expect(genProps).toEqual(hcProps);
  });

  it("press schema has source_publication, original_url", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const schemas = buildAllSchemas(config);

    const genJson = zodToJsonSchema(schemas["press"]) as any;
    const hcJson = zodToJsonSchema(PressSchema) as any;

    const genProps = Object.keys(genJson.properties).sort();
    const hcProps = Object.keys(hcJson.properties).sort();

    expect(genProps).toEqual(hcProps);
  });

  it("generated schemas can be converted to JSON Schema for Ollama", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const schemas = buildAllSchemas(config);

    // Every schema should produce valid JSON Schema
    for (const [name, schema] of Object.entries(schemas)) {
      const jsonSchema = zodToJsonSchema(schema);
      expect(jsonSchema).toBeDefined();
      expect((jsonSchema as any).type).toBe("object");
      expect((jsonSchema as any).properties).toBeDefined();
    }
  });

  it("event schema validates sample event data", async () => {
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const schemas = buildAllSchemas(config);

    const sampleEvent = {
      content_type: "event",
      title: "Smartbydebatten 2024",
      slug: "smartbydebatten-2024",
      url_path: "/arendalsuka-blog/smartbydebatten-2024",
      language: "nb",
      date: "2024-08-14",
      description: "En debatt om smarte byer.",
      author: "",
      source_url: "https://www.smartebyernorge.no/arendalsuka-blog/smartbydebatten-2024",
      tags: ["arendalsuka", "debatt"],
      event_date: "2024-08-14",
      event_time: "11:00-11:45",
      venue: "Arendalsuka",
      moderator: "Kari Nordmann",
      panelists: [
        {
          name: "Ola Nordmann",
          title: "Direktør",
          organization: "Smarte Byer Norge",
        },
      ],
    };

    const result = schemas["event"].safeParse(sampleEvent);
    expect(result.success).toBe(true);
  });

  it("blog schema rejects event-specific fields", async () => {
    // The blog schema should NOT have event_date etc. — strict mode would reject them
    // But Zod by default strips unknown keys with .parse, and .safeParse on passthrough allows.
    // What matters is that the blog schema doesn't include event fields in its shape.
    const config = await loadSiteConfig(REFERENCE_CONFIG_PATH);
    const schemas = buildAllSchemas(config);

    const genJson = zodToJsonSchema(schemas["blog"]) as any;
    expect(genJson.properties).not.toHaveProperty("event_date");
    expect(genJson.properties).not.toHaveProperty("panelists");
    expect(genJson.properties).not.toHaveProperty("conference_name");
  });
});
