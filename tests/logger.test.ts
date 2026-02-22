/**
 * logger.test.ts
 *
 * Tests for the shared logging module.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  logInfo,
  logSuccess,
  logError,
  logWarning,
  logStart,
  logRaw,
  enableFileLogging,
  closeFileLogging,
  _resetForTesting,
  _getEarlyBuffer,
} from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempLogPath(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "logger-test-"));
  return path.join(tmpDir, "test.log");
}

function readLog(logPath: string): string {
  return fs.readFileSync(logPath, "utf-8");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("logger", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _resetForTesting();
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    _resetForTesting();
    stderrSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // stderr output
  // -------------------------------------------------------------------------

  it("logInfo writes to stderr with INFO prefix", () => {
    logInfo("hello world");
    expect(stderrSpy).toHaveBeenCalledOnce();
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toMatch(/\[\d{2}:\d{2}:\d{2}\] INFO  hello world\n/);
  });

  it("logSuccess writes to stderr with OK prefix", () => {
    logSuccess("done");
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toMatch(/\] OK    done\n/);
  });

  it("logError writes to stderr with ERROR prefix", () => {
    logError("failed");
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toMatch(/\] ERROR failed\n/);
  });

  it("logWarning writes to stderr with WARN prefix", () => {
    logWarning("watch out");
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toMatch(/\] WARN  watch out\n/);
  });

  it("logStart writes starting message", () => {
    logStart("Test Script", "1.0.0");
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain("Starting: Test Script Ver: 1.0.0");
  });

  it("logRaw writes text without timestamp prefix", () => {
    logRaw("raw output line\n");
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toBe("raw output line\n");
    // Should NOT have timestamp prefix
    expect(output).not.toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
  });

  // -------------------------------------------------------------------------
  // Early buffer
  // -------------------------------------------------------------------------

  it("buffers lines before file logging is enabled", () => {
    logInfo("early line 1");
    logInfo("early line 2");
    const buffer = _getEarlyBuffer();
    expect(buffer).toHaveLength(2);
    expect(buffer[0]).toContain("early line 1");
    expect(buffer[1]).toContain("early line 2");
  });

  it("logRaw also buffers before file logging", () => {
    logRaw("raw early\n");
    const buffer = _getEarlyBuffer();
    expect(buffer).toHaveLength(1);
    expect(buffer[0]).toBe("raw early\n");
  });

  // -------------------------------------------------------------------------
  // File logging
  // -------------------------------------------------------------------------

  it("enableFileLogging creates the log file", () => {
    const logPath = makeTempLogPath();
    enableFileLogging(logPath);
    closeFileLogging();
    expect(fs.existsSync(logPath)).toBe(true);
  });

  it("replays early buffer to file when enabled", () => {
    const logPath = makeTempLogPath();
    logInfo("before enable");
    enableFileLogging(logPath);
    closeFileLogging();

    const content = readLog(logPath);
    expect(content).toContain("before enable");
  });

  it("writes subsequent log lines to file", () => {
    const logPath = makeTempLogPath();
    enableFileLogging(logPath);
    logInfo("after enable");
    closeFileLogging();

    const content = readLog(logPath);
    expect(content).toContain("after enable");
  });

  it("writes header when provided", () => {
    const logPath = makeTempLogPath();
    enableFileLogging(logPath, {
      scriptName: "Test Script",
      scriptVer: "2.0.0",
      extra: { Config: "/path/to/config.yaml" },
    });
    closeFileLogging();

    const content = readLog(logPath);
    expect(content).toContain("# Log: Test Script v2.0.0");
    expect(content).toContain("# Started:");
    expect(content).toContain("# Config: /path/to/config.yaml");
  });

  it("clears early buffer after replay", () => {
    logInfo("buffered");
    const logPath = makeTempLogPath();
    enableFileLogging(logPath);
    expect(_getEarlyBuffer()).toHaveLength(0);
    closeFileLogging();
  });

  it("logRaw writes to file without prefix", () => {
    const logPath = makeTempLogPath();
    enableFileLogging(logPath);
    logRaw("subprocess output\n");
    closeFileLogging();

    const content = readLog(logPath);
    expect(content).toContain("subprocess output");
    // The raw line should not have a timestamp prefix in the file
    const lines = content.split("\n");
    const rawLine = lines.find((l) => l.includes("subprocess output"));
    expect(rawLine).not.toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
  });

  it("closeFileLogging can be called multiple times safely", () => {
    const logPath = makeTempLogPath();
    enableFileLogging(logPath);
    closeFileLogging();
    closeFileLogging(); // Should not throw
    expect(fs.existsSync(logPath)).toBe(true);
  });

  it("enableFileLogging is idempotent (second call is a no-op)", () => {
    const logPath1 = makeTempLogPath();
    const logPath2 = makeTempLogPath();
    enableFileLogging(logPath1);
    enableFileLogging(logPath2); // Should be ignored
    logInfo("test line");
    closeFileLogging();

    expect(readLog(logPath1)).toContain("test line");
    expect(fs.existsSync(logPath2)).toBe(false);
  });

  it("creates parent directories for log file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "logger-test-"));
    const logPath = path.join(tmpDir, "nested", "deep", "test.log");
    enableFileLogging(logPath);
    logInfo("nested dir test");
    closeFileLogging();

    expect(fs.existsSync(logPath)).toBe(true);
    expect(readLog(logPath)).toContain("nested dir test");
  });
});
