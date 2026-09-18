/**
 * Database integration tests (ARCHITECTURE.md §13). They run only when
 * `TEST_DATABASE_URL` points at a dedicated Neon test/preview database —
 * never production. The migration in `drizzle/` is applied to that database
 * before the suite runs.
 *
 *   TEST_DATABASE_URL=postgres://... pnpm test tests/integration
 */
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, type DatabaseHandle } from "@/db/client";
import { paymentIntents } from "@/db/schema";
import { newPaymentIntentId } from "@/lib/ids";
import { createDrizzlePaymentRepository } from "@/repositories/drizzle-payment-repository";

const TEST_DATABASE_URL = process.env["TEST_DATABASE_URL"];

/** Drizzle wraps driver failures in `DrizzleQueryError`; the pg error with the constraint name is its `cause`. */
async function expectConstraintViolation(promise: Promise<unknown>, constraint: string): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  const cause = (caught as Error).cause as { constraint?: string } | undefined;
  expect(cause?.constraint).toBe(constraint);
}

describe.skipIf(TEST_DATABASE_URL === undefined)("DrizzlePaymentRepository (Neon)", () => {
  let handle: DatabaseHandle;
  const createdIds: string[] = [];

  beforeAll(async () => {
    handle = createDatabase(TEST_DATABASE_URL as string);
    await migrate(handle.db, { migrationsFolder: "drizzle" });
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await handle.db.execute(
        sql`delete from payment_intents where id in (${sql.join(
          createdIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    }
    await handle.pool.end();
  });

  function newIntent(overrides: Partial<Parameters<ReturnType<typeof createDrizzlePaymentRepository>["createPaymentIntent"]>[0]> = {}) {
    const id = newPaymentIntentId();
    createdIds.push(id);
    return {
      id,
      externalReference: "INV-204",
      expectedAmountUnits: 850_000_000n,
      recipientAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      payerAddress: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      requiredConfirmations: 3,
      startBlock: 35_000_001n,
      ...overrides,
    };
  }

  it("applies the migration idempotently", async () => {
    await expect(migrate(handle.db, { migrationsFolder: "drizzle" })).resolves.toBeUndefined();
    const tables = await handle.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    const names = tables.rows.map((row) => row.table_name);
    expect(names).toEqual(expect.arrayContaining(["payment_intents", "matched_transfers", "reconciliation_attempts"]));
  });

  it("inserts a pending intent with the initial state and reads it back by ID", async () => {
    const repository = createDrizzlePaymentRepository(handle.db);
    const input = newIntent();

    const created = await repository.createPaymentIntent(input);
    expect(created).toMatchObject({
      id: input.id,
      status: "pending",
      chain: "base",
      asset: "USDC",
      tokenAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      expectedAmountUnits: 850_000_000n,
      receivedAmountUnits: 0n,
      detectedAmountUnits: 0n,
      matchConfidence: "none",
      startBlock: 35_000_001n,
      expiryBlock: null,
      paidAt: null,
      lastReconciledBlock: null,
      lastReconciledAt: null,
      requiredConfirmations: 3,
    });
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.expiresAt.getTime()).toBe(input.expiresAt.getTime());

    await expect(repository.getPaymentIntentById(input.id)).resolves.toEqual(created);
  });

  it("round-trips numeric(78,0) token units and bigint block numbers exactly", async () => {
    const repository = createDrizzlePaymentRepository(handle.db);
    const huge = 123_456_789_012_345_678_901_234_567_890_000_000n;
    const created = await repository.createPaymentIntent(
      newIntent({ expectedAmountUnits: huge, startBlock: 9_007_199_254_740_993n }),
    );
    const loaded = await repository.getPaymentIntentById(created.id);
    expect(loaded?.expectedAmountUnits).toBe(huge);
    expect(loaded?.startBlock).toBe(9_007_199_254_740_993n);
    expect(typeof loaded?.expectedAmountUnits).toBe("bigint");

    const tiny = await repository.createPaymentIntent(newIntent({ expectedAmountUnits: 1n }));
    expect((await repository.getPaymentIntentById(tiny.id))?.expectedAmountUnits).toBe(1n);
  });

  it("returns null for an unknown ID", async () => {
    const repository = createDrizzlePaymentRepository(handle.db);
    await expect(repository.getPaymentIntentById(newPaymentIntentId())).resolves.toBeNull();
  });

  it("stores a null payer", async () => {
    const repository = createDrizzlePaymentRepository(handle.db);
    const created = await repository.createPaymentIntent(newIntent({ payerAddress: null }));
    expect((await repository.getPaymentIntentById(created.id))?.payerAddress).toBeNull();
  });

  it("rejects invalid persisted states through CHECK constraints", async () => {
    const repository = createDrizzlePaymentRepository(handle.db);
    await expectConstraintViolation(
      repository.createPaymentIntent(newIntent({ expectedAmountUnits: 0n })),
      "payment_intents_expected_amount_positive",
    );
    await expectConstraintViolation(
      repository.createPaymentIntent(newIntent({ requiredConfirmations: 65 })),
      "payment_intents_required_confirmations_range",
    );
    await expectConstraintViolation(
      repository.createPaymentIntent(newIntent({ expiresAt: new Date(Date.now() - 1000) })),
      "payment_intents_expires_after_creation",
    );
    await expectConstraintViolation(
      repository.createPaymentIntent(newIntent({ expiresAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000) })),
      "payment_intents_expires_after_creation",
    );
    await expectConstraintViolation(
      handle.db.insert(paymentIntents).values({
        ...newIntent(),
        chain: "ethereum",
        asset: "USDC",
        tokenAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      }),
      "payment_intents_chain_check",
    );
    await expectConstraintViolation(
      handle.db.insert(paymentIntents).values({
        ...newIntent(),
        chain: "base",
        asset: "USDT",
        tokenAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      }),
      "payment_intents_asset_check",
    );
  });

  it("rejects duplicate IDs", async () => {
    const repository = createDrizzlePaymentRepository(handle.db);
    const input = newIntent();
    await repository.createPaymentIntent(input);
    await expectConstraintViolation(repository.createPaymentIntent(input), "payment_intents_pkey");
  });
});
