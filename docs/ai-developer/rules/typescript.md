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

## TypeScript Logging Functions

The TypeScript implementation of the standard logging functions. Copy them from the template — don't modify the format.

```typescript
function logTime(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}
function logInfo(msg: string): void {
  console.error(`[${logTime()}] INFO  ${msg}`);
}
function logSuccess(msg: string): void {
  console.error(`[${logTime()}] OK    ${msg}`);
}
function logError(msg: string): void {
  console.error(`[${logTime()}] ERROR ${msg}`);
}
function logWarning(msg: string): void {
  console.error(`[${logTime()}] WARN  ${msg}`);
}
function logStart(): void {
  logInfo(`Starting: ${SCRIPT_NAME} Ver: ${SCRIPT_VER}`);
}
```

Logs go to stderr (`console.error`) so that stdout remains available for piped data or structured output.

The only acceptable uses of raw `console.log` are:
- Blank lines for visual separation
- Separator lines for formatting
- Inside the `showHelp()` function
- Structured data output that the user pipes to another command

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
| LOGGING | Standard logging functions | All scripts |
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
- [ ] All logging uses `logInfo`/`logSuccess`/`logError`/`logWarning` — no raw `console.log` for status messages
- [ ] `logStart()` is called as the first action after the help check
- [ ] All error logs have unique error identifiers (`ERR001`, `ERR002`, etc.)
- [ ] External command dependencies are checked before use
- [ ] Direct run guard is present
- [ ] `npm test` passes
