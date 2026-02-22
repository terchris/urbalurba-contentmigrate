# TypeScript Script Rules

TypeScript-specific syntax and conventions for CLI entry-point scripts in this repo. **Read [script-standard.md](script-standard.md) first** — it defines the universal rules (metadata, help format, logging, error codes, etc.) that this file shows how to implement in TypeScript.

---

## Scope

These rules apply to **CLI entry-point scripts** in `scripts/` that are invoked via `npm run <name>` or `npx tsx scripts/<name>.ts`. They do NOT apply to:
- Library modules in `src/` (these follow normal TypeScript conventions)
- Test files in `tests/`
- Config files

The distinction: if a user runs it from the command line and sees output, it's a script and must follow the standard. If it's `import`-ed by other code, it's a library module.

---

## The Golden Rule

**Every CLI entry-point `.ts` file in `scripts/` must follow the standard script template. No exceptions.**

---

## Step-by-Step

### 1. Copy the template

```bash
cp docs/ai-developer/templates/typescript/script-template.ts scripts/my-script.ts
```

### 2. Fill in the metadata

Edit the 5 required metadata fields near the top of the script:

```typescript
const SCRIPT_ID = "my-script";
const SCRIPT_NAME = "My Script";
const SCRIPT_VER = "0.0.1";
const SCRIPT_DESCRIPTION = "One-line description of what this script does.";
const SCRIPT_CATEGORY = "MIGRATION";
```

### 3. Implement main()

Add your logic to the `main()` function. The template provides the standard structure — keep the sections in order.

### 4. Run and verify

```bash
npx tsx scripts/my-script.ts --help
npx tsx scripts/my-script.ts
npm test
```

---

## TypeScript Metadata Fields

Declare metadata as top-level `const` values, right after imports:

```typescript
const SCRIPT_ID = "analyse";
const SCRIPT_NAME = "Analyse Site";
const SCRIPT_VER = "0.1.0";
const SCRIPT_DESCRIPTION = "Analyse a website and generate site-config.yaml.";
const SCRIPT_CATEGORY = "MIGRATION";
```

---

## Shared Logger (`lib/logger.ts`)

All scripts use the **shared logger module** — never define inline logging functions.

```typescript
import {
  logInfo, logSuccess, logError, logWarning,
  logStart, logRaw,
  enableFileLogging, closeFileLogging,
} from "../lib/logger.js";
```

### Available functions

| Function | Purpose |
|----------|---------|
| `logInfo(msg)` | General progress messages |
| `logSuccess(msg)` | Completion / success messages |
| `logError(msg)` | Error messages |
| `logWarning(msg)` | Warning messages |
| `logStart(name, ver)` | Standard "Starting: Name Ver: x.y.z" banner |
| `logRaw(text)` | Raw text with no timestamp prefix (subprocess output) |
| `enableFileLogging(path, header?)` | Start writing logs to a file (also replays early buffer) |
| `closeFileLogging()` | Flush and close the log file |

### How it works

1. **stderr always**: Every log call writes to stderr immediately.
2. **Early buffer**: Lines logged *before* `enableFileLogging()` are buffered in memory.
3. **File logging**: After calling `enableFileLogging(path)`, the buffer is replayed to the file, and all subsequent log calls write to both stderr and the file.
4. **Close**: Call `closeFileLogging()` at the end of `main()` to flush.

### Typical usage in a script

```typescript
async function main() {
  const opts = parseArgs();
  logStart(SCRIPT_NAME, SCRIPT_VER);   // logged to stderr + early buffer

  // ... create output directories ...

  enableFileLogging(path.join(reportsDir, `${SCRIPT_ID}.log`), {
    scriptName: SCRIPT_NAME,
    scriptVer: SCRIPT_VER,
    extra: { Config: configPath, Site: siteUrl },
  });

  // ... do work — all logInfo/logError/etc go to stderr AND file ...

  logSuccess("Done");
  closeFileLogging();
}
```

### File logging header

When `enableFileLogging` receives a `header` object, the log file starts with:

```
═══════════════════════════════════════════════════════════════
  ScriptName vX.Y.Z — started 2026-02-22 14:30:00
  Config: ./site-config.yaml
  Site:   https://example.com
═══════════════════════════════════════════════════════════════
```

This makes log files self-describing for both humans and LLM agents.

### Library modules

Library modules in `lib/` and `src/` should also use the shared logger instead of `console.log`/`console.error`. This ensures their output is captured in the log file.

```typescript
// In lib/ollama-client.ts, src/analyse/sample-crawler.ts, etc.
import { logInfo, logError } from "./logger.js";  // or "../../lib/logger.js"
```

### Rules

- **Never** define inline `logInfo`/`logError` etc. in scripts — always import from `lib/logger.ts`
- **Never** use `console.log` or `console.error` for status messages — use the shared logger
- The only acceptable uses of raw `console.error` are inside the `showHelp()` function
- `logRaw()` is for subprocess output (e.g. Python crawler) that has its own formatting
- Scripts that don't produce output directories (e.g. `check-ollama.ts`) skip `enableFileLogging` — they still get stderr output

---

## TypeScript Help Function

The `--help` flag must produce output matching the standard help format (see [script-standard.md](script-standard.md)).

```typescript
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
```

Scripts may add extra sections (Arguments, Examples, Prerequisites) between Options and Metadata.

---

## TypeScript Template Sections

The template (`docs/ai-developer/templates/typescript/script-template.ts`) has these sections in order. Keep this structure:

| Section | What it contains | Required for |
|---------|-----------------|--------------|
| IMPORTS | Node and npm imports | All scripts |
| SCRIPT METADATA | The 5 required metadata fields | All scripts |
| CONFIGURATION | Variables for URLs, paths, defaults | Scripts with configurable values |
| LOGGING | Shared logger import reference (see `lib/logger.ts`) | All scripts |
| HELP | The `showHelp()` function | All scripts |
| TYPES | TypeScript interfaces | As needed |
| ARGUMENT PARSING | `parseArgs()` function | All scripts |
| HELPER FUNCTIONS | Your custom functions | As needed |
| MAIN | The `main()` entry point | All scripts |
| DIRECT RUN GUARD | `isDirectRun` check and `main()` call | All scripts |

---

## TypeScript Argument Parsing

```typescript
interface ScriptArgs {
  // ... your fields
}

function parseArgs(): ScriptArgs {
  const args = process.argv.slice(2);

  // Check for help flag first
  if (args.includes("-h") || args.includes("--help")) {
    showHelp();
    process.exit(0);
  }

  // Parse remaining args
  let myOption = "default";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--my-option" && args[i + 1]) {
      myOption = args[++i];
    }
  }

  return { myOption };
}
```

---

## TypeScript Error Capture Pattern

```typescript
// Bad — logs that it failed but not why
try {
  execSync(`some command`);
} catch {
  logError("ERR001: Command failed");
  process.exit(1);
}

// Good — captures and logs the actual error
try {
  execSync(`some command`);
} catch (error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  logError("ERR001: Command failed");
  logError(`ERR001: ${msg}`);
  process.exit(1);
}
```

---

## TypeScript Command Checks

For external dependencies (Python, Claude CLI, Ollama), check that they exist before using them:

```typescript
import { execSync } from "node:child_process";

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// In main():
if (!commandExists("python3")) {
  logError("ERR001: python3 is required but not found");
  process.exit(1);
}
```

---

## Direct Run Guard

Every CLI script must include a guard so that `main()` only runs when executed directly (not when imported for testing):

```typescript
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("my-script.ts") ||
   process.argv[1].endsWith("my-script.js"));

if (isDirectRun) {
  main().catch((err) => {
    logError(`Unexpected error: ${err}`);
    process.exit(1);
  });
}
```

---

## Version Bumping

TypeScript scripts use the same `SCRIPT_VER` convention as bash/PowerShell. The pre-commit hook should be extended to handle `.ts` files if automatic version bumping is desired.

For now, bump versions manually when making a release.

---

## Validation

There is no automated validation tool for TypeScript scripts yet. Manual checklist:

- [ ] All 5 metadata fields are set
- [ ] `--help` flag produces standard format output
- [ ] Logging imported from `lib/logger.ts` — no inline logging functions
- [ ] All logging uses `logInfo`/`logSuccess`/`logError`/`logWarning` — no raw `console.log` for status messages
- [ ] `logStart(SCRIPT_NAME, SCRIPT_VER)` is called as the first action after the help check
- [ ] `enableFileLogging()` called after creating the output directory (if applicable)
- [ ] `closeFileLogging()` called at the end of `main()` (if file logging is enabled)
- [ ] All error logs have unique error identifiers (`ERR001`, `ERR002`, etc.)
- [ ] External command dependencies are checked before use
- [ ] Direct run guard is present
- [ ] `npm test` passes
