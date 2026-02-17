/**
 * check-ollama.ts
 *
 * Verifies the connection to Ollama and checks that the required model
 * is available. Runs a small test extraction with structured output.
 * Also checks if ANTHROPIC_API_KEY is set for the Claude tier.
 *
 * Usage: npm run check-ollama
 */

import { Ollama } from "ollama";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OLLAMA_HOST, MODELS } from "../lib/config.js";

// ---------------------------------------------------------------------------
// Test schema — a minimal extraction to verify structured output works
// ---------------------------------------------------------------------------

const TestExtractionSchema = z.object({
  title: z.string().describe("The title of the page"),
  language: z
    .enum(["nb", "en"])
    .describe("Language: nb for Norwegian bokmål, en for English"),
  date_published: z
    .string()
    .describe("Publication date in ISO 8601 format, or empty string if unknown"),
  summary: z
    .string()
    .describe("A one-sentence summary of the page content"),
});

type TestExtraction = z.infer<typeof TestExtractionSchema>;

// ---------------------------------------------------------------------------
// Sample HTML — a small snippet of Norwegian content for testing
// ---------------------------------------------------------------------------

const SAMPLE_HTML = `
<html>
<head><title>Smarte Byer Norge — Nabolag som bryr seg</title></head>
<body>
  <article>
    <h1>Nabolag som bryr seg</h1>
    <time datetime="2021-03-15">15. mars 2021</time>
    <p>Smarte Byer Norge lanserer en ny satsing på nabolagsutvikling.
       Målet er å styrke lokale fellesskap gjennom digital innovasjon
       og bærekraftige løsninger.</p>
  </article>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// Check functions
// ---------------------------------------------------------------------------

async function checkConnection(ollama: Ollama): Promise<boolean> {
  console.log(`\n🔌 Checking connection to Ollama at ${OLLAMA_HOST}...`);
  try {
    const response = await ollama.list();
    console.log(`   ✅ Connected. ${response.models.length} model(s) available.`);
    return true;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`   ❌ Cannot connect to Ollama at ${OLLAMA_HOST}`);
    console.error(`      Error: ${msg}`);
    console.error(`\n   Troubleshooting:`);
    console.error(`   1. Is Ollama running? Start it with: ollama serve`);
    console.error(`   2. If inside a devcontainer, the host should be http://host.docker.internal:11434`);
    console.error(`   3. If running locally, try: OLLAMA_HOST=http://localhost:11434 npm run check-ollama`);
    return false;
  }
}

async function checkModel(ollama: Ollama): Promise<boolean> {
  console.log(`\n🤖 Checking for model: ${MODELS.ollama}...`);
  try {
    const response = await ollama.list();
    const modelNames = response.models.map((m) => m.name);

    const found = modelNames.some(
      (name) =>
        name === MODELS.ollama ||
        name === `${MODELS.ollama}:latest` ||
        name.startsWith(`${MODELS.ollama.split(":")[0]}:`)
    );

    if (found) {
      const match = modelNames.find(
        (name) =>
          name === MODELS.ollama ||
          name.startsWith(`${MODELS.ollama.split(":")[0]}:`)
      );
      console.log(`   ✅ Model found: ${match}`);
      return true;
    } else {
      console.error(`   ❌ Model ${MODELS.ollama} not found.`);
      console.error(`\n   Available models:`);
      for (const name of modelNames) {
        console.error(`     - ${name}`);
      }
      console.error(`\n   Install it with: ollama pull ${MODELS.ollama}`);
      return false;
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`   ❌ Failed to list models: ${msg}`);
    return false;
  }
}

async function checkStructuredOutput(ollama: Ollama): Promise<boolean> {
  console.log(`\n🧪 Testing structured extraction with Norwegian HTML...`);
  console.log(`   Model: ${MODELS.ollama}`);
  console.log(`   Schema: TestExtractionSchema (title, language, date, summary)`);

  try {
    const jsonSchema = zodToJsonSchema(TestExtractionSchema);
    const startTime = Date.now();

    const response = await ollama.chat({
      model: MODELS.ollama,
      messages: [
        {
          role: "system",
          content: `You are a content extraction engine. Given HTML, extract structured data according to the JSON schema provided. 
Always respond with valid JSON only. 
For Norwegian bokmål content, set language to "nb". For English, set language to "en".
Extract dates in ISO 8601 format (YYYY-MM-DD).`,
        },
        {
          role: "user",
          content: `Extract structured data from this HTML:\n\n${SAMPLE_HTML}`,
        },
      ],
      format: jsonSchema as Record<string, unknown>,
      options: {
        temperature: 0,
      },
    });

    const elapsed = Date.now() - startTime;
    const rawContent = response.message.content;

    // Parse and validate against Zod schema
    const parsed: TestExtraction = TestExtractionSchema.parse(
      JSON.parse(rawContent)
    );

    console.log(`   ✅ Structured output works! (${elapsed}ms)`);
    console.log(`\n   Extracted data:`);
    console.log(`     title:          "${parsed.title}"`);
    console.log(`     language:       "${parsed.language}"`);
    console.log(`     date_published: "${parsed.date_published}"`);
    console.log(`     summary:        "${parsed.summary}"`);

    // Validate the extraction makes sense
    const issues: string[] = [];
    if (!parsed.title.toLowerCase().includes("nabolag")) {
      issues.push(`Title doesn't contain "nabolag" — may be inaccurate`);
    }
    if (parsed.language !== "nb") {
      issues.push(`Language should be "nb" for Norwegian content, got "${parsed.language}"`);
    }
    if (parsed.date_published && !parsed.date_published.startsWith("2021")) {
      issues.push(`Date should start with 2021, got "${parsed.date_published}"`);
    }

    if (issues.length > 0) {
      console.log(`\n   ⚠️  Quality warnings:`);
      for (const issue of issues) {
        console.log(`     - ${issue}`);
      }
    } else {
      console.log(`\n   ✅ Extraction quality looks good!`);
    }

    return true;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`   ❌ Structured output test failed: ${msg}`);
    if (msg.includes("format")) {
      console.error(
        `\n   Your Ollama version may not support structured outputs.`
      );
      console.error(`   Update Ollama: curl -fsSL https://ollama.com/install.sh | sh`);
    }
    return false;
  }
}

function checkClaudeApiKey(): boolean {
  console.log(`\n🔑 Checking for ANTHROPIC_API_KEY...`);
  if (process.env.ANTHROPIC_API_KEY) {
    const key = process.env.ANTHROPIC_API_KEY;
    const masked = `${key.slice(0, 10)}...${key.slice(-4)}`;
    console.log(`   ✅ API key found: ${masked}`);
    console.log(`   Claude model: ${MODELS.claude}`);
    return true;
  } else {
    console.log(`   ⚠️  ANTHROPIC_API_KEY not set.`);
    console.log(`   Claude tier will not be available for complex page extraction.`);
    console.log(`   Set it with: export ANTHROPIC_API_KEY=sk-ant-...`);
    console.log(`   (Ollama tier will still work for simple pages.)`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=".repeat(60));
  console.log("  smartebyernorge.no Migration — Environment Check");
  console.log("=".repeat(60));

  const ollama = new Ollama({ host: OLLAMA_HOST });

  // Step 1: Ollama connection
  const connected = await checkConnection(ollama);
  if (!connected) {
    process.exit(1);
  }

  // Step 2: Model
  const modelReady = await checkModel(ollama);
  if (!modelReady) {
    process.exit(1);
  }

  // Step 3: Structured output test
  const extractionWorks = await checkStructuredOutput(ollama);
  if (!extractionWorks) {
    process.exit(1);
  }

  // Step 4: Claude API key (non-fatal)
  const claudeReady = checkClaudeApiKey();

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Summary:");
  console.log(`  ✅ Ollama:  Connected, model ready, structured output works`);
  console.log(`  ${claudeReady ? "✅" : "⚠️ "} Claude:  ${claudeReady ? "API key configured" : "API key not set (optional)"}`);
  console.log(`${"=".repeat(60)}`);

  if (claudeReady) {
    console.log("\n  🚀 Both tiers ready! Run: npm run filter");
  } else {
    console.log("\n  🚀 Ollama tier ready! Set ANTHROPIC_API_KEY for Claude tier.");
    console.log("  You can still run: npm run filter");
  }
  console.log();
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
