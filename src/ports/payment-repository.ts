/**
 * Persistence port for payment obligations. Repositories are the only layer
 * that runs application database queries; they convert database values to
 * domain types (`bigint` units and block numbers, `Date` timestamps).
 */
import type { NewPaymentIntent, PaymentIntent } from "@/domain/payment-intent";

export interface PaymentRepository {
  /** Inserts a new `pending` intent and returns the persisted row. */
  createPaymentIntent(intent: NewPaymentIntent): Promise<PaymentIntent>;
  /** Returns the intent or `null` when no row has that ID. */
  getPaymentIntentById(id: string): Promise<PaymentIntent | null>;
}
