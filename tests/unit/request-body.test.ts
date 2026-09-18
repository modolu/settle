import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { MAX_JSON_BODY_BYTES, readJsonBody } from "@/lib/request-body";

function jsonRequest(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/v1/payment-intents", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

async function expectValidationError(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AppError);
  expect((caught as AppError).code).toBe("VALIDATION_ERROR");
  expect((caught as AppError).message).toMatch(pattern);
}

describe("readJsonBody", () => {
  it("fixes the body limit at 16 KiB", () => {
    expect(MAX_JSON_BODY_BYTES).toBe(16_384);
  });

  it("parses a JSON object", async () => {
    await expect(readJsonBody(jsonRequest(JSON.stringify({ amount: "1" })))).resolves.toEqual({ amount: "1" });
  });

  it("accepts a charset parameter on the content type", async () => {
    await expect(
      readJsonBody(jsonRequest("{}", { "content-type": "application/json; charset=utf-8" })),
    ).resolves.toEqual({});
  });

  it("rejects a non-JSON content type", async () => {
    await expectValidationError(readJsonBody(jsonRequest("{}", { "content-type": "text/plain" })), /Content-Type/);
    await expectValidationError(
      readJsonBody(new Request("http://localhost/x", { method: "POST", body: "{}" })),
      /Content-Type/,
    );
  });

  it("rejects an empty body", async () => {
    await expectValidationError(readJsonBody(jsonRequest(null)), /JSON object/);
    await expectValidationError(readJsonBody(jsonRequest("")), /JSON object/);
  });

  it("rejects malformed JSON and invalid UTF-8", async () => {
    await expectValidationError(readJsonBody(jsonRequest("{oops")), /not valid JSON/);
    await expectValidationError(readJsonBody(jsonRequest(new Uint8Array([0xff, 0xfe, 0x7b]))), /not valid JSON/);
  });

  it("accepts a body exactly at the limit and rejects one byte over", async () => {
    const atLimit = `{"a":"${"x".repeat(MAX_JSON_BODY_BYTES - 8)}"}`;
    expect(Buffer.byteLength(atLimit)).toBe(MAX_JSON_BODY_BYTES);
    await expect(readJsonBody(jsonRequest(atLimit))).resolves.toBeTypeOf("object");

    const overLimit = `{"a":"${"x".repeat(MAX_JSON_BODY_BYTES - 7)}"}`;
    expect(Buffer.byteLength(overLimit)).toBe(MAX_JSON_BODY_BYTES + 1);
    await expectValidationError(readJsonBody(jsonRequest(overLimit)), /must not exceed/);
  });

  it("enforces the limit while streaming, ignoring an understated Content-Length", async () => {
    const chunk = new TextEncoder().encode("x".repeat(4096));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 10) {
          controller.close();
          return;
        }
        sent += 1;
        controller.enqueue(chunk);
      },
    });
    const request = new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "10" },
      body: stream,
      // @ts-expect-error -- undici requires duplex for streaming bodies; not in lib.dom types
      duplex: "half",
    });
    await expectValidationError(readJsonBody(request), /must not exceed/);
    expect(sent).toBeLessThan(10);
  });

  it("rejects early on an overstated Content-Length", async () => {
    await expectValidationError(
      readJsonBody(jsonRequest("{}", { "content-length": String(MAX_JSON_BODY_BYTES + 1) })),
      /must not exceed/,
    );
  });
});
