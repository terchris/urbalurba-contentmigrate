/**
 * check-ollama.ts
 *
 * Verifies the connection to Ollama and checks that the required model
 * is available. Runs a small test extraction with structured output.
 * Also checks if ANTHROPIC_API_KEY is set for the Claude tier.
 *
 * Now config-driven: reads model name from site-config.yaml.
 *
 * Usage:
 *   npx tsx scripts/check-ollama.ts [--config site-config.yaml]
 *
 * Follow the standard: docs/ai-developer/rules/script-standard.md
 * TypeScript specifics: docs/ai-developer/rules/typescript.md
 */

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────

import { Ollama } from "ollama";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { loadSiteConfig, createSiteConfigFacade } from "../src/config/index.js";
import { logInfo, logSuccess, logError, logWarning, logStart } from "../lib/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// SCRIPT METADATA
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT_ID = "check-ollama";
const SCRIPT_NAME = "Check Ollama";
const SCRIPT_VER = "0.1.0";
const SCRIPT_DESCRIPTION = "Verify Ollama connection, model availability, and structured output.";
const SCRIPT_CATEGORY = "MIGRATION";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const DEFAULT_CONFIG_PATH = "./site-config.yaml";
const DEFAULT_EXTRACTION_MODEL = "gemma3:4b";
const DEFAULT_ANALYSIS_MODEL = "claude-sonnet-4-20250514";

const SAMPLE_HTML = `
<html>
<head><title>Test Site — Nabolag som bryr seg</title></head>
<body>
  <article>
    <h1>Nabolag som bryr seg</h1>
    <time datetime="2021-03-15">15. mars 2021</time>
    <p>En ny satsing på nabolagsutvikling.
       Målet er å styrke lokale fellesskap gjennom digital innovasjon
       og bærekraftige løsninger.</p>
  </article>
</body>
</html>
`;

// Logging: imported from lib/logger.ts

// ─────────────────────────────────────────────────────────────────────────────
// HELP
// ─────────────────────────────────────────────────────────────────────────────

function showHelp(): void {
  const text = `
${SCRIPT_NAME} (v${SCRIPT_VER})
${SCRIPT_DESCRIPTION}

Usage:
  npx tsx scripts/${SCRIPT_ID}.ts [options]

Options:
  --config PATH  Path to site-config.yaml (default: ${DEFAULT_CONFIG_PATH})
  -h, --help     Show this help message

Prerequisites:
  - Ollama must be running (ollama serve)
  - Required model must be pulled (ollama pull gemma3:4b)

Metadata:
  ID:       ${SCRIPT_ID}
  Category: ${SCRIPT_CATEGORY}
`.trim();
  console.error(text);
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// ARGUMENT PARSING
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): { configPath: string } {
  const args = process.argv.slice(2);

  // Check for help flag first
  if (args.includes("-h") || args.includes("--help")) {
    showHelp();
    process.exit(0);
  }

  let configPath = DEFAULT_CONFIG_PATH;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config" && args[i + 1]) {
      configPath = args[++i];
    }
  }

  return { configPath };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: check functions
// ─────────────────────────────────────────────────────────────────────────────

async function checkConnection(ollama: Ollama): Promise<boolean> {
  logInfo(`Checking connection to Ollama at ${OLLAMA_HOST}...`);
  try {
    const response = await ollama.list();
    logSuccess(`Connected. ${response.models.length} model(s) available.`);
    return true;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(`ERR001: Cannot connect to Ollama at ${OLLAMA_HOST}`);
    logError(`ERR001: ${msg}`);
    logInfo("Troubleshooting:");
    logInfo("  1. Is Ollama running? Start it with: ollama serve");
    logInfo("  2. If inside a devcontainer, the host should be http://host.docker.internal:11434");
    logInfo("  3. If running locally, try: OLLAMA_HOST=http://localhost:11434 npm run check-ollama");
    return false;
  }
}

async function checkModel(ollama: Ollama, modelName: string): Promise<boolean> {
  logInfo(`Checking for model: ${modelName}...`);
  try {
    const response = await ollama.list();
    const modelNames = response.models.map((m) => m.name);

    const found = modelNames.some(
      (name) =>
        name === modelName ||
        name === `${modelName}:latest` ||
        name.startsWith(`${modelName.split(":")[0]}:`)
    );

    if (found) {
      const match = modelNames.find(
        (name) =>
          name === modelName ||
          name.startsWith(`${modelName.split(":")[0]}:`)
      );
      logSuccess(`Model found: ${match}`);
      return true;
    } else {
      logError(`ERR002: Model ${modelName} not found.`);
      logInfo("Available models:");
      for (const name of modelNames) {
        logInfo(`  - ${name}`);
      }
      logInfo(`Install it with: ollama pull ${modelName}`);
      return false;
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(`ERR003: Failed to list models`);
    logError(`ERR003: ${msg}`);
    return false;
  }
}

async function checkStructuredOutput(ollama: Ollama, modelName: string): Promise<boolean> {
  logInfo("Testing structured extraction...");
  logInfo(`Model: ${modelName}`);

  try {
    const jsonSchema = zodToJsonSchema(TestExtractionSchema);
    const startTime = Date.now();

    const response = await ollama.chat({
      model: modelName,
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

    const parsed: TestExtraction = TestExtractionSchema.parse(
      JSON.parse(rawContent)
    );

    logSuccess(`Structured output works! (${elapsed}ms)`);
    logInfo("Extracted data:");
    logInfo(`  title:          "${parsed.title}"`);
    logInfo(`  language:       "${parsed.language}"`);
    logInfo(`  date_published: "${parsed.date_published}"`);
    logInfo(`  summary:        "${parsed.summary}"`);

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
      for (const issue of issues) {
        logWarning(`Quality: ${issue}`);
      }
    } else {
      logSuccess("Extraction quality looks good!");
    }

    return true;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(`ERR004: Structured output test failed`);
    logError(`ERR004: ${msg}`);
    if (msg.includes("format")) {
      logInfo("Your Ollama version may not support structured outputs.");
      logInfo("Update Ollama: curl -fsSL https://ollama.com/install.sh | sh");
    }
    return false;
  }
}

function checkClaudeApiKey(analysisModel: string): boolean {
  logInfo("Checking for ANTHROPIC_API_KEY...");
  if (process.env.ANTHROPIC_API_KEY) {
    const key = process.env.ANTHROPIC_API_KEY;
    const masked = `${key.slice(0, 10)}...${key.slice(-4)}`;
    logSuccess(`API key found: ${masked}`);
    logInfo(`Claude model: ${analysisModel}`);
    return true;
  } else {
    logWarning("ANTHROPIC_API_KEY not set.");
    logInfo("Claude tier will not be available for complex page extraction.");
    logInfo("Set it with: export ANTHROPIC_API_KEY=sk-ant-...");
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const { configPath } = parseArgs();
  logStart(SCRIPT_NAME, SCRIPT_VER);

  // Load site config to get model name
  let siteName = "Content Migration";
  let extractionModel = DEFAULT_EXTRACTION_MODEL;
  let analysisModel = DEFAULT_ANALYSIS_MODEL;

  try {
    const config = await loadSiteConfig(configPath);
    const site = createSiteConfigFacade(config);
    siteName = site.siteName;
    extractionModel = site.llm.extractionModel;
    analysisModel = site.llm.analysisModel;
  } catch {
    logWarning(`Could not load config from "${configPath}", using defaults.`);
  }

  logInfo(`Site: ${siteName}`);

  const ollamaClient = new Ollama({ host: OLLAMA_HOST });

  const connected = await checkConnection(ollamaClient);
  if (!connected) {
    process.exit(1);
  }

  const modelReady = await checkModel(ollamaClient, extractionModel);
  if (!modelReady) {
    process.exit(1);
  }

  const extractionWorks = await checkStructuredOutput(ollamaClient, extractionModel);
  if (!extractionWorks) {
    process.exit(1);
  }

  const claudeReady = checkClaudeApiKey(analysisModel);

  // Summary
  logSuccess(`Ollama: Connected, model ${extractionModel} ready, structured output works`);
  if (claudeReady) {
    logSuccess("Claude: API key configured");
    logInfo("Both tiers ready! Run: npm run extract -- --config site-config.yaml");
  } else {
    logWarning("Claude: API key not set (optional)");
    logInfo("Ollama tier ready! Set ANTHROPIC_API_KEY for Claude tier.");
    logInfo("You can still run: npm run extract -- --config site-config.yaml");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECT RUN GUARD
// ─────────────────────────────────────────────────────────────────────────────

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("check-ollama.ts") ||
   process.argv[1].endsWith("check-ollama.js"));

if (isDirectRun) {
  main().catch((err) => {
    logError(`Unexpected error: ${err}`);
    process.exit(1);
  });
}
