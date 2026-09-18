import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Container } from "@/server/container";
import { GET as GET_EVIDENCE } from "@/app/v1/payment-intents/[id]/evidence/route";
import { POST as POST_RECONCILE } from "@/app/v1/payment-intents/[id]/reconcile/route";
import { GET } from "@/app/v1/payment-intents/[id]/route";
import { POST } from "@/app/v1/payment-intents/route";
import { AppError } from "@/lib/errors";
import { REQUEST_ID_HEADER } from "@/lib/http";
import { newPaymentIntentId } from "@/lib/ids";
import { createPaymentIntent } from "@/services/create-payment-intent";
import { getPaymentEvidence } from "@/services/get-payment-evidence";
import { getPaymentIntent } from "@/services/get-payment-intent";
import { reconcilePaymentIntent } from "@/services/reconcile-payment-intent";

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
    reconcilePaymentIntent: (id, requestId) =>
      reconcilePaymentIntent(id, { chainProvider, paymentRepository, requestId }),
    getPaymentEvidence: (id, options) => getPaymentEvidence(id, options, { paymentRepository }),
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

function reconcile(id: string): Promise<Response> {
  return POST_RECONCILE(new Request(`http://localhost/v1/payment-intents/${id}/reconcile`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

function evidence(id: string, query = ""): Promise<Response> {
  return GET_EVIDENCE(new Request(`http://localhost/v1/payment-intents/${id}/evidence${query}`), {
    params: Promise.resolve({ id }),
  });
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

describe("POST /v1/payment-intents/:id/reconcile", () => {
  it("returns 200 with the reconciled intent at top level, X-Request-Id and no-store", async () => {
    const chainProvider = new FakeChainProvider({ latestBlock: 100n, transfers: [] });
    const repository = wire(chainProvider);
    const created = (await (await post({ ...validBody, amount: "25.00" })).json()) as { id: string };
    expect(repository.intents.get(created.id)?.startBlock).toBe(101n);

    chainProvider.state.latestBlock = 150n;
    chainProvider.state.transfers = [
      {
        txHash: `0x${"e".repeat(64)}`,
        logIndex: 3,
        blockNumber: 120n,
        blockHash: `0x${"f".repeat(64)}`,
        from: PAYER.toLowerCase(),
        to: RECIPIENT.toLowerCase(),
        amountUnits: 25_000_000n,
      },
    ];
    chainProvider.state.timestamps = new Map([[120n, new Date("2026-09-17T22:30:00.000Z")]]);

    const response = await reconcile(created.id);
    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(/^req_/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      id: created.id,
      status: "paid",
      externalReference: "INV-204",
      chain: "base",
      asset: "USDC",
      expectedAmount: "25.00",
      receivedAmount: "25.00",
      remainingAmount: "0.00",
      recipient: RECIPIENT,
      payer: PAYER,
      requiredConfirmations: 3,
      matchConfidence: "exact_payer",
      paidAt: "2026-09-17T22:30:00.000Z",
      createdAt: expect.stringMatching(/Z$/) as string,
      expiresAt,
    });
    await expect((await get(created.id)).json()).resolves.toEqual(body);
  });

  it("returns pending with no evidence when nothing matched", async () => {
    const chainProvider = new FakeChainProvider({ latestBlock: 100n, transfers: [] });
    wire(chainProvider);
    const created = (await (await post(validBody)).json()) as { id: string };
    const body = (await (await reconcile(created.id)).json()) as Record<string, unknown>;
    expect(body).toMatchObject({ status: "pending", receivedAmount: "0.00", matchConfidence: "none", paidAt: null });
  });

  it("returns 503 UPSTREAM_UNAVAILABLE when the provider fails and leaves the intent unchanged", async () => {
    const chainProvider = new FakeChainProvider({ latestBlock: 100n, transfers: [] });
    wire(chainProvider);
    const created = (await (await post(validBody)).json()) as Record<string, unknown>;
    chainProvider.state.failLatestBlock = new AppError("UPSTREAM_UNAVAILABLE", "Blockchain provider is temporarily unavailable");
    const response = await reconcile(created["id"] as string);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: { code: "UPSTREAM_UNAVAILABLE", message: "Blockchain provider is temporarily unavailable", retryable: true },
    });
    await expect((await get(created["id"] as string)).json()).resolves.toEqual(created);
  });

  it("returns 404 for an unknown intent and 400 for a malformed ID", async () => {
    wire(new FakeChainProvider({ latestBlock: 1n, transfers: [] }));
    expect((await reconcile(newPaymentIntentId())).status).toBe(404);
    expect((await reconcile("nope")).status).toBe(400);
  });

  it("MILESTONE 2 LIMITATION: returns 400 VALIDATION_ERROR for an intent without a payer", async () => {
    wire(new FakeChainProvider({ latestBlock: 1n, transfers: [] }));
    const withoutPayer: Record<string, unknown> = { ...validBody };
    delete withoutPayer["payer"];
    const created = (await (await post(withoutPayer)).json()) as { id: string; payer: null };
    expect(created.payer).toBeNull();
    const response = await reconcile(created.id);
    expect(response.status).toBe(400);
    const envelope = (await response.json()) as { error: { code: string; message: string } };
    expect(envelope.error.code).toBe("VALIDATION_ERROR");
    expect(envelope.error.message).toMatch(/without a declared payer/);
  });
});

describe("GET /v1/payment-intents/:id/evidence", () => {
  async function seededIntent() {
    const chainProvider = new FakeChainProvider({ latestBlock: 100n, transfers: [] });
    wire(chainProvider);
    const created = (await (await post({ ...validBody, amount: "3.00" })).json()) as { id: string };
    chainProvider.state.latestBlock = 200n;
    chainProvider.state.transfers = [1, 2, 3].map((i) => ({
      txHash: `0x${String(i).repeat(64)}`,
      logIndex: i,
      blockNumber: 110n + BigInt(i),
      blockHash: `0x${"f".repeat(64)}`,
      from: PAYER.toLowerCase(),
      to: RECIPIENT.toLowerCase(),
      amountUnits: 1_000_000n,
    }));
    expect((await reconcile(created.id)).status).toBe(200);
    return created.id;
  }

  it("returns evidence in canonical order with the public shape", async () => {
    const id = await seededIntent();
    const response = await evidence(id);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { evidence: Array<Record<string, unknown>>; nextCursor: string | null };
    expect(body.nextCursor).toBeNull();
    expect(body.evidence).toHaveLength(3);
    expect(body.evidence[0]).toEqual({
      transactionHash: `0x${"1".repeat(64)}`,
      logIndex: 1,
      blockNumber: "111",
      from: PAYER,
      to: RECIPIENT,
      amount: "1.00",
      confirmations: 90,
      blockTimestamp: new Date(111 * 2_000).toISOString(),
      association: "matched",
    });
    expect(body.evidence.map((row) => row["blockNumber"])).toEqual(["111", "112", "113"]);
  });

  it("paginates with limit and an opaque cursor", async () => {
    const id = await seededIntent();
    const first = (await (await evidence(id, "?limit=2")).json()) as { evidence: Array<{ blockNumber: string }>; nextCursor: string | null };
    expect(first.evidence.map((row) => row.blockNumber)).toEqual(["111", "112"]);
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);

    const second = (await (await evidence(id, `?limit=2&cursor=${first.nextCursor}`)).json()) as {
      evidence: Array<{ blockNumber: string }>;
      nextCursor: string | null;
    };
    expect(second.evidence.map((row) => row.blockNumber)).toEqual(["113"]);
    expect(second.nextCursor).toBeNull();
  });

  it("rejects a bad limit or cursor with 400 and unknown intents with 404", async () => {
    const id = await seededIntent();
    expect((await evidence(id, "?limit=0")).status).toBe(400);
    expect((await evidence(id, "?limit=101")).status).toBe(400);
    expect((await evidence(id, "?cursor=garbage")).status).toBe(400);
    expect((await evidence(newPaymentIntentId())).status).toBe(404);
    expect((await evidence("nope")).status).toBe(400);
  });
});
