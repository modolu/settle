import { describe, expect, it } from "vitest";

import { createLogger, isLogLevel, parseLogLevel, type LogLevel } from "@/lib/logger";

function capture() {
  const lines: Array<{ line: string; level: LogLevel }> = [];
  const write = (line: string, level: LogLevel): void => {
    lines.push({ line, level });
  };
  return { lines, write };
}

describe("createLogger", () => {
  it("emits one single-line JSON object per call with level, time and msg", () => {
    const { lines, write } = capture();
    createLogger({ level: "debug", write }).info("hello", { requestId: "req_1" });

    expect(lines).toHaveLength(1);
    const [entry] = lines;
    expect(entry?.line.includes("\n")).toBe(false);
    const parsed = JSON.parse(entry?.line ?? "") as Record<string, unknown>;
    expect(parsed["level"]).toBe("info");
    expect(parsed["msg"]).toBe("hello");
    expect(parsed["requestId"]).toBe("req_1");
    expect(typeof parsed["time"]).toBe("string");
    expect(() => new Date(parsed["time"] as string).toISOString()).not.toThrow();
  });

  it("filters entries below the configured level", () => {
    const { lines, write } = capture();
    const log = createLogger({ level: "warn", write });
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(lines.map((entry) => entry.level)).toEqual(["warn", "error"]);
  });

  it("emits nothing at level silent", () => {
    const { lines, write } = capture();
    const log = createLogger({ level: "silent", write });
    log.error("e");
    expect(lines).toHaveLength(0);
  });

  it("includes child bindings on every line and lets fields override them", () => {
    const { lines, write } = capture();
    const log = createLogger({ level: "info", write }).child({ route: "/health", method: "GET" });
    log.info("a");
    log.info("b", { method: "POST" });
    const [first, second] = lines.map((entry) => JSON.parse(entry.line) as Record<string, unknown>);
    expect(first).toMatchObject({ route: "/health", method: "GET", msg: "a" });
    expect(second).toMatchObject({ route: "/health", method: "POST", msg: "b" });
  });

  it("serializes bigint values and Error objects", () => {
    const { lines, write } = capture();
    const cause = new Error("root cause");
    const err = new Error("outer", { cause });
    createLogger({ level: "info", write }).error("failed", { units: 850_000_000n, err });
    const parsed = JSON.parse(lines[0]?.line ?? "") as {
      units: unknown;
      err: { name: string; message: string; stack?: string; cause?: { message: string } };
    };
    expect(parsed.units).toBe("850000000");
    expect(parsed.err.name).toBe("Error");
    expect(parsed.err.message).toBe("outer");
    expect(typeof parsed.err.stack).toBe("string");
    expect(parsed.err.cause?.message).toBe("root cause");
  });
});

describe("parseLogLevel", () => {
  it("accepts known levels and falls back to info otherwise", () => {
    expect(parseLogLevel("debug")).toBe("debug");
    expect(parseLogLevel("silent")).toBe("silent");
    expect(parseLogLevel(undefined)).toBe("info");
    expect(parseLogLevel("verbose")).toBe("info");
    expect(isLogLevel("warn")).toBe(true);
    expect(isLogLevel("WARN")).toBe(false);
  });
});
