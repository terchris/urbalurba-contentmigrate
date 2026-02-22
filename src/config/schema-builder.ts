/**
 * schema-builder.ts
 *
 * Builds Zod schemas dynamically from site-config.yaml field definitions.
 *
 * This is the core technical PoC for the config-driven approach: given a
 * YAML content type definition with base + extras, produce a z.ZodObject
 * equivalent to what was previously hardcoded in lib/schemas.ts.
 *
 * The generated schema can then be converted to JSON Schema (via
 * zod-to-json-schema) for sending to Ollama, or used directly for
 * validation.
 */

import { z } from "zod";
import type {
  ContentTypeDefinition,
  FieldDefinition,
  SiteConfig,
} from "./site-config.schema.js";

// ---------------------------------------------------------------------------
// Base schema — matches lib/schemas.ts BaseSchema exactly
// ---------------------------------------------------------------------------

/**
 * The base fields that every content type includes (when schema.base = true).
 * These correspond exactly to the hardcoded BaseSchema in lib/schemas.ts.
 */
export function buildBaseSchema(contentTypeNames: string[]): z.ZodObject<any> {
  return z.object({
    content_type: z
      .enum(contentTypeNames as [string, ...string[]])
      .describe("Content archetype"),
    title: z.string().describe("Page title (H1 or <title>)"),
    slug: z.string().describe("URL slug derived from path"),
    url_path: z
      .string()
      .describe(
        "Original full URL path, e.g. '/arendalsuka-blog/matsikkerhet'"
      ),
    language: z
      .enum(["nb", "en"])
      .describe("ISO 639-1: 'nb' for Norwegian bokmål, 'en' for English"),
    date: z
      .string()
      .describe("Published date ISO 8601: 'YYYY-MM-DD' or empty string"),
    description: z
      .string()
      .describe(
        "Meta description or first paragraph excerpt, max 300 chars"
      ),
    author: z
      .string()
      .describe("Author name, e.g. 'Terje Christensen', or empty string"),
    source_url: z.string().describe("Full original URL"),
    featured_image: z
      .object({
        src: z.string().describe("Original image URL"),
        alt: z.string().describe("Alt text or empty string"),
      })
      .optional()
      .describe("Hero/featured image — omit if none"),
    tags: z.array(z.string()).describe("Free-form tags"),
  });
}

// ---------------------------------------------------------------------------
// Field-to-Zod mapping
// ---------------------------------------------------------------------------

/**
 * Convert a single YAML FieldDefinition to a Zod type.
 *
 * Mapping:
 * - string → z.string()
 * - number → z.number()
 * - boolean → z.boolean()
 * - string[] → z.array(z.string())
 * - image → z.object({ src, alt }).optional()
 * - object → z.array(z.object({ ...nested fields })) when items are defined
 *            (this matches the panelists pattern from schemas.ts)
 */
export function fieldDefinitionToZod(field: FieldDefinition): z.ZodTypeAny {
  const description = field.description ?? "";

  switch (field.type) {
    case "string":
      return z.string().describe(description);

    case "number":
      return z.number().describe(description);

    case "boolean":
      return z.boolean().describe(description);

    case "string[]":
      return z.array(z.string()).describe(description);

    case "image":
      return z
        .object({
          src: z.string().describe("Image URL"),
          alt: z.string().describe("Alt text or empty"),
        })
        .optional()
        .describe(description);

    case "object": {
      // Build nested fields from items
      if (!field.items || Object.keys(field.items).length === 0) {
        // No items defined — use a generic record
        return z.record(z.string(), z.unknown()).describe(description);
      }

      const nestedShape: Record<string, z.ZodTypeAny> = {};
      for (const [key, nestedField] of Object.entries(field.items)) {
        nestedShape[key] = fieldDefinitionToZod(nestedField);
      }

      // Object type with items = an array of objects (e.g. panelists)
      // This matches the pattern in schemas.ts: panelists is z.array(z.object({...}))
      return z.array(z.object(nestedShape)).describe(description);
    }

    default:
      throw new Error(`Unknown field type: ${(field as any).type}`);
  }
}

// ---------------------------------------------------------------------------
// Build extras schema from YAML
// ---------------------------------------------------------------------------

/**
 * Build a Zod object schema from YAML extras field definitions.
 */
export function buildExtrasSchema(
  extras: Record<string, FieldDefinition>
): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [fieldName, fieldDef] of Object.entries(extras)) {
    shape[fieldName] = fieldDefinitionToZod(fieldDef);
  }

  return z.object(shape);
}

// ---------------------------------------------------------------------------
// Build complete schema for a content type
// ---------------------------------------------------------------------------

/**
 * Build the full Zod schema for a content type: base fields (if enabled) + extras.
 *
 * @param contentType - The content type definition from YAML config
 * @param allContentTypeNames - List of all content type names (for the content_type enum)
 * @returns A Zod object schema matching the equivalent hardcoded schema
 */
export function buildContentTypeSchema(
  contentType: ContentTypeDefinition,
  allContentTypeNames: string[]
): z.ZodObject<any> {
  let schema: z.ZodObject<any>;

  if (contentType.schema.base) {
    schema = buildBaseSchema(allContentTypeNames);
  } else {
    schema = z.object({});
  }

  // Merge extras if defined
  const extras = contentType.schema.extras;
  if (extras && Object.keys(extras).length > 0) {
    const extrasSchema = buildExtrasSchema(extras);
    schema = schema.merge(extrasSchema);
  }

  return schema;
}

// ---------------------------------------------------------------------------
// Build all schemas from a SiteConfig
// ---------------------------------------------------------------------------

/**
 * Build a lookup map of content type name → Zod schema for all content types.
 *
 * @param config - The validated SiteConfig
 * @returns A record mapping content type names to their Zod schemas
 */
export function buildAllSchemas(
  config: SiteConfig
): Record<string, z.ZodObject<any>> {
  const typeNames = config.content_types.map((ct) => ct.name);
  const schemas: Record<string, z.ZodObject<any>> = {};

  for (const ct of config.content_types) {
    schemas[ct.name] = buildContentTypeSchema(ct, typeNames);
  }

  return schemas;
}
