/**
 * logger.ts
 *
 * Shared logging module for all CLI scripts.
 * Provides dual output: stderr (live terminal) + optional log file.
 *
 * Usage:
 *   import { logInfo, logError, logStart, enableFileLogging, closeFileLogging } from "../lib/logger.js";
 *
 *   logStart("My Script", "0.1.0");          // logs to stderr immediately
 *   enableFileLogging("/path/to/run.log");   // from now on, also writes to file
 *   logInfo("Processing...");                // goes to both stderr and file
 *   closeFileLogging();                      // mark done
 *
 * Early buffer: lines logged before enableFileLogging() are buffered in memory
 * and replayed to the log file when it opens, so the file contains the complete run.
 *
 * Uses synchronous file I/O (appendFileSync) for reliability — log lines are
 * guaranteed to be on disk immediately, even if the process crashes.
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let logFilePath: string | null = null;
let fileLoggingEnabled = false;
let earlyBuffer: string[] = [];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function logTime(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

/**
 * Write a string to the log file (synchronous, crash-safe).
 */
function writeToFile(text: string): void {
  if (logFilePath) {
    fs.appendFileSync(logFilePath, text);
  }
}

/**
 * Core emit function — writes a formatted line to stderr and (if enabled) to the log file.
 */
function emit(line: string): void {
  process.stderr.write(line + "\n");

  if (fileLoggingEnabled) {
    writeToFile(line + "\n");
  } else {
    earlyBuffer.push(line);
  }
}

// ---------------------------------------------------------------------------
// Public API: log functions
// ---------------------------------------------------------------------------

export function logInfo(msg: string): void {
  emit(`[${logTime()}] INFO  ${msg}`);
}

export function logSuccess(msg: string): void {
  emit(`[${logTime()}] OK    ${msg}`);
}

export function logError(msg: string): void {
  emit(`[${logTime()}] ERROR ${msg}`);
}

export function logWarning(msg: string): void {
  emit(`[${logTime()}] WARN  ${msg}`);
}

/**
 * Log the script startup line. Called once at the beginning of main().
 */
export function logStart(scriptName: string, scriptVer: string): void {
  logInfo(`Starting: ${scriptName} Ver: ${scriptVer}`);
}

/**
 * Write raw text to both outputs without timestamp prefix.
 * Used for subprocess output (e.g. Python crawler) that has its own formatting.
 */
export function logRaw(text: string): void {
  process.stderr.write(text);

  if (fileLoggingEnabled) {
    writeToFile(text);
  } else {
    earlyBuffer.push(text);
  }
}

// ---------------------------------------------------------------------------
// Public API: file logging control
// ---------------------------------------------------------------------------

/**
 * Enable file logging. Creates the log file and replays any buffered early lines.
 * Call this after the output directory has been created.
 *
 * @param filePath - Full path to the log file (e.g. output/<slug>/reports/analyse.log)
 * @param header - Optional metadata lines to write at the top of the log file
 */
export function enableFileLogging(
  filePath: string,
  header?: { scriptName: string; scriptVer: string; extra?: Record<string, string> }
): void {
  if (fileLoggingEnabled) return; // Already enabled

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  // Create (or truncate) the file
  logFilePath = filePath;
  fs.writeFileSync(logFilePath, "");
  fileLoggingEnabled = true;

  // Write header if provided
  if (header) {
    const timestamp = new Date().toISOString();
    writeToFile(`# Log: ${header.scriptName} v${header.scriptVer}\n`);
    writeToFile(`# Started: ${timestamp}\n`);
    if (header.extra) {
      for (const [key, value] of Object.entries(header.extra)) {
        writeToFile(`# ${key}: ${value}\n`);
      }
    }
    writeToFile(`#\n`);
  }

  // Replay early buffer
  for (const line of earlyBuffer) {
    writeToFile(line.endsWith("\n") ? line : line + "\n");
  }
  earlyBuffer = [];
}

/**
 * Close file logging. After this, log lines only go to stderr.
 */
export function closeFileLogging(): void {
  logFilePath = null;
  fileLoggingEnabled = false;
}

/**
 * Reset logger state. Used in tests to ensure clean state between test cases.
 */
export function _resetForTesting(): void {
  closeFileLogging();
  earlyBuffer = [];
}

/**
 * Get the current early buffer contents. Used in tests.
 */
export function _getEarlyBuffer(): string[] {
  return [...earlyBuffer];
}
