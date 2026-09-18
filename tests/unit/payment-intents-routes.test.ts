import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Container } from "@/server/container";
import { GET } from "@/app/v1/payment-intents/[id]/route";
import { POST } from "@/app/v1/payment-intents/route";
import { AppError } from "@/lib/errors";
import { REQUEST_ID_HEADER } from "@/lib/http";
import { newPaymentIntentId } from "@/lib/ids";
import { createPaymentIntent } from "@/services/create-payment-intent";
import { getPaymentIntent } from "@/services/get-payment-intent";

import { FakeChainProvider, InMemoryPaymentRepository } from "../service/fakes";

// Route tests replace the composition root with services wired to in-memory
// fakes; the HTTP layer and the real services are exercised end to end.
const state: { container: Container } = { container: undefined as unknown as Container };
vi.mock("@/server/container", () => ({ getContainer: () => state.container }));

const RECIPIENT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAYER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

function wire(chainProvider: FakeChainProvider): InMemoryPaymentRepository {
  const paymentRepository = new InMemoryPaymentRepository();
  state.container = {
    createPaymentIntent: (input) => createPaymentIntent(input, { chainProvider, paymentRepository }),
    getPaymentIntent: (id) => getPaymentIntent(id, { paymentRepository }),
  };
  return paymentRepository;
}

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request("http://localhost/v1/payment-intents", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function get(id: string): Promise<Response> {
  return GET(new Request(`http://localhost/v1/payment-intents/${id}`), { params: Promise.resolve({ id }) });
}

const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const validBody = {
  externalReference: "INV-204",
  chain: "base",
  asset: "USDC",
  amount: "850.00",
  recipient: RECIPIENT,
  payer: PAYER,
  expiresAt,
  requiredConfirmations: 3,
};

describe("POST /v1/payment-intents", () => {
  beforeEach(() => {
    wire(new FakeChainProvider({ latestBlock: 35_000_000n }));
  });

  it("creates an intent and returns 201 with the public representation", async () => {
    const response = await post(validBody);
    expect(response.status).toBe(201);
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(/^req_/);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      id: expect.stringMatching(/^pi_[A-Za-z0-9_-]{32}$/) as string,
      status: "pending",
      externalReference: "INV-204",
      chain: "base",
      asset: "USDC",
      expectedAmount: "850.00",
      receivedAmount: "0.00",
      remainingAmount: "850.00",
      recipient: RECIPIENT,
      payer: PAYER,
      requiredConfirmations: 3,
      matchConfidence: "none",
      paidAt: null,
      createdAt: expect.stringMatching(/Z$/) as string,
      expiresAt,
    });
    expect(body).not.toHaveProperty("startBlock");
    expect(body).not.toHaveProperty("accountId");
  });

  it("persists startBlock = latest block + 1 and defaults payer/confirmations", async () => {
    const repository = wire(new FakeChainProvider({ latestBlock: 41_999_999n }));
    const response = await post({ chain: "base", asset: "USDC", amount: "25", recipient: RECIPIENT, expiresAt });
    expect(response.status).toBe(201);
    const { id, payer, requiredConfirmations, expectedAmount } = (await response.json()) as Record<string, unknown>;
    expect(payer).toBeNull();
    expect(requiredConfirmations).toBe(3);
    expect(expectedAmount).toBe("25.00");
    expect(repository.intents.get(id as string)?.startBlock).toBe(42_000_000n);
  });

  it.each([
    ["unknown field", { ...validBody, chainId: 8453 }, 400, "VALIDATION_ERROR"],
    ["bad amount", { ...validBody, amount: "1e3" }, 400, "VALIDATION_ERROR"],
    ["past expiry", { ...validBody, expiresAt: "2020-01-01T00:00:00Z" }, 400, "VALIDATION_ERROR"],
    ["other chain", { ...validBody, chain: "ethereum" }, 400, "UNSUPPORTED_CHAIN"],
    ["other asset", { ...validBody, asset: "USDT" }, 400, "UNSUPPORTED_ASSET"],
    ["bad recipient", { ...validBody, recipient: "0xRecipient" }, 400, "INVALID_ADDRESS"],
    ["malformed JSON", "{not json", 400, "VALIDATION_ERROR"],
  ])("returns %s → %d %s", async (_label, body, status, code) => {
    const repository = wire(new FakeChainProvider({ latestBlock: 1n }));
    const response = await post(body);
    expect(response.status).toBe(status);
    const envelope = (await response.json()) as { error: { code: string; retryable: boolean } };
    expect(envelope.error.code).toBe(code);
    expect(envelope.error.retryable).toBe(false);
    expect(repository.intents.size).toBe(0);
  });

  it("rejects a wrong content type", async () => {
    const response = await post(validBody, { "content-type": "text/plain" });
    expect(response.status).toBe(400);
  });

  it("returns 503 UPSTREAM_UNAVAILABLE and creates nothing when the provider is down", async () => {
    const repository = wire(
      new FakeChainProvider({
        error: new AppError("UPSTREAM_UNAVAILABLE", "Blockchain provider is temporarily unavailable"),
      }),
    );
    const response = await post(validBody);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Blockchain provider is temporarily unavailable",
        retryable: true,
      },
    });
    expect(repository.intents.size).toBe(0);
  });
});

describe("GET /v1/payment-intents/:id", () => {
  it("returns the persisted intent with 200", async () => {
    wire(new FakeChainProvider({ latestBlock: 10n }));
    const created = (await (await post(validBody)).json()) as { id: string };

    const response = await get(created.id);
    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(/^req_/);
    await expect(response.json()).resolves.toEqual(created);
  });

  it("returns 404 INTENT_NOT_FOUND for a well-formed unknown ID", async () => {
    wire(new FakeChainProvider({ latestBlock: 10n }));
    const response = await get(newPaymentIntentId());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "INTENT_NOT_FOUND", message: "Payment intent not found", retryable: false },
    });
  });

  it("returns 400 VALIDATION_ERROR for a malformed ID", async () => {
    wire(new FakeChainProvider({ latestBlock: 10n }));
    const response = await get("not-an-id");
    expect(response.status).toBe(400);
    const envelope = (await response.json()) as { error: { code: string } };
    expect(envelope.error.code).toBe("VALIDATION_ERROR");
  });
});
