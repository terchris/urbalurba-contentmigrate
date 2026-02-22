/**
 * script-template.ts
 *
 * TEMPLATE — copy this file when creating a new TypeScript CLI script.
 * Follow the standard: docs/ai-developer/rules/script-standard.md
 * TypeScript specifics: docs/ai-developer/rules/typescript.md
 *
 * Usage:
 *   npx tsx scripts/my-script.ts [options]
 */

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────

// import fs from "node:fs";
// import path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// SCRIPT METADATA
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT_ID = "my-script";
const SCRIPT_NAME = "My Script";
const SCRIPT_VER = "0.0.1";
const SCRIPT_DESCRIPTION = "One-line description of what this script does.";
const SCRIPT_CATEGORY = "MIGRATION";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

// Put all configurable values here — no hardcoded values in functions.
// const DEFAULT_OUTPUT = "./output";

// ─────────────────────────────────────────────────────────────────────────────
// LOGGING — uses shared logger (lib/logger.ts)
// ─────────────────────────────────────────────────────────────────────────────
//
// import { logInfo, logSuccess, logError, logWarning, logStart,
//          enableFileLogging, closeFileLogging } from "../lib/logger.js";
//
// The shared logger writes to stderr by default. After creating an output
// directory, call enableFileLogging(path) to also write to a .log file.
// Call closeFileLogging() at the end of main().
//

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
  -h, --help  Show this help message

Metadata:
  ID:       ${SCRIPT_ID}
  Category: ${SCRIPT_CATEGORY}
`.trim();
  console.error(text);
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ScriptArgs {
  // Add your CLI arguments here
}

// ─────────────────────────────────────────────────────────────────────────────
// ARGUMENT PARSING
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): ScriptArgs {
  const args = process.argv.slice(2);

  // Check for help flag first
  if (args.includes("-h") || args.includes("--help")) {
    showHelp();
    process.exit(0);
  }

  // Parse remaining args
  for (let i = 0; i < args.length; i++) {
    // if (args[i] === "--my-option" && args[i + 1]) {
    //   myOption = args[++i];
    // }
  }

  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

// Add your helper functions here.

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const _opts = parseArgs();
  logStart(SCRIPT_NAME, SCRIPT_VER);

  // After creating your output directory, enable file logging:
  // enableFileLogging(path.join(reportsDir, `${SCRIPT_ID}.log`), {
  //   scriptName: SCRIPT_NAME,
  //   scriptVer: SCRIPT_VER,
  //   extra: { Config: configPath, Site: siteUrl },
  // });

  // Your implementation here
  logInfo("Hello from the template!");

  logSuccess("Done");
  // closeFileLogging();
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECT RUN GUARD
// ─────────────────────────────────────────────────────────────────────────────

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith(`${SCRIPT_ID}.ts`) ||
   process.argv[1].endsWith(`${SCRIPT_ID}.js`));

if (isDirectRun) {
  main().catch((err) => {
    logError(`Unexpected error: ${err}`);
    process.exit(1);
  });
}
