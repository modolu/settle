import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "@/lib/config";

const SHA = "0123456789abcdef0123456789abcdef01234567";

describe("loadConfig", () => {
  it("applies defaults when nothing is set", () => {
    const config = loadConfig({});
    expect(config).toEqual({
      nodeEnv: "development",
      deploymentEnv: "development",
      commitSha: null,
      xagentSlug: null,
      logLevel: "info",
    });
  });

  it("reads Vercel platform variables", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_SHA: SHA,
      XAGENT_SLUG: "settle",
      LOG_LEVEL: "debug",
    });
    expect(config).toEqual({
      nodeEnv: "production",
      deploymentEnv: "production",
      commitSha: SHA,
      xagentSlug: "settle",
      logLevel: "debug",
    });
  });

  it("derives the test deployment environment from NODE_ENV when not on Vercel", () => {
    expect(loadConfig({ NODE_ENV: "test" }).deploymentEnv).toBe("test");
  });

  it("treats empty-string variables as unset", () => {
    const config = loadConfig({ VERCEL_GIT_COMMIT_SHA: "", XAGENT_SLUG: "", LOG_LEVEL: "" });
    expect(config.commitSha).toBeNull();
    expect(config.xagentSlug).toBeNull();
    expect(config.logLevel).toBe("info");
  });

  it("rejects a commit SHA that is not 40 lowercase hex characters", () => {
    expect(() => loadConfig({ VERCEL_GIT_COMMIT_SHA: "abc123" })).toThrow(ConfigError);
    expect(() => loadConfig({ VERCEL_GIT_COMMIT_SHA: SHA.toUpperCase() })).toThrow(ConfigError);
  });

  it("rejects unknown LOG_LEVEL and NODE_ENV values", () => {
    expect(() => loadConfig({ LOG_LEVEL: "verbose" })).toThrow(ConfigError);
    expect(() => loadConfig({ NODE_ENV: "staging" })).toThrow(ConfigError);
  });

  it("names offending variables but never their values", () => {
    let caught: unknown;
    try {
      loadConfig({ VERCEL_GIT_COMMIT_SHA: "not-a-sha-value", LOG_LEVEL: "loud" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    const error = caught as ConfigError;
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.httpStatus).toBe(500);
    expect(error.message).toBe("Server configuration is invalid");
    expect(error.issues).toHaveLength(2);
    expect(error.issues.join("\n")).toMatch(/VERCEL_GIT_COMMIT_SHA/);
    expect(error.issues.join("\n")).toMatch(/LOG_LEVEL/);
    expect(error.issues.join("\n")).not.toMatch(/not-a-sha-value|loud/);
  });
});
