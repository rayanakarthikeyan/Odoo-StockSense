import { describe, expect, it } from "vitest";
import {
  getNextOperationStatus,
  operationSchema,
  validateOperationRoute,
  validateReadyForCompletion,
  validateStatusTransition,
} from "./operations.js";

const receipt = {
  type: "receipt" as const,
  partner: "Apex Metals",
  sourceLocationId: null,
  destinationLocationId: 1,
  scheduledAt: "2026-09-26T06:00:00.000Z",
  notes: null,
  lines: [
    { productId: 1, quantity: 10, countedQuantity: null },
    { productId: 2, quantity: 5, countedQuantity: null },
  ],
};

describe("operation input validation", () => {
  it("accepts a multi-line receipt", () => {
    const input = operationSchema.parse(receipt);
    expect(input.lines).toHaveLength(2);
    expect(() => validateOperationRoute(input)).not.toThrow();
  });

  it("rejects duplicate products", () => {
    const result = operationSchema.safeParse({
      ...receipt,
      lines: [receipt.lines[0], receipt.lines[0]],
    });
    expect(result.success).toBe(false);
  });

  it("requires positive movement quantities", () => {
    const result = operationSchema.safeParse({
      ...receipt,
      lines: [{ productId: 1, quantity: 0, countedQuantity: null }],
    });
    expect(result.success).toBe(false);
  });

  it("allows a zero physical count for adjustments", () => {
    const input = operationSchema.parse({
      ...receipt,
      type: "adjustment",
      sourceLocationId: 1,
      destinationLocationId: null,
      lines: [{ productId: 1, quantity: 0, countedQuantity: 0 }],
    });
    expect(() => validateOperationRoute(input)).not.toThrow();
  });

  it("rejects a transfer with identical locations", () => {
    const input = operationSchema.parse({
      ...receipt,
      type: "transfer",
      sourceLocationId: 1,
      destinationLocationId: 1,
    });
    expect(() => validateOperationRoute(input)).toThrow(
      "Transfers require different source and destination locations.",
    );
  });
});

describe("operation workflow", () => {
  it("moves receipts directly from draft to ready", () => {
    expect(getNextOperationStatus("receipt", "draft")).toBe("ready");
    expect(() =>
      validateStatusTransition("receipt", "draft", "ready"),
    ).not.toThrow();
  });

  it("moves deliveries through stock waiting", () => {
    expect(getNextOperationStatus("delivery", "draft")).toBe("waiting");
    expect(getNextOperationStatus("delivery", "waiting")).toBe("ready");
  });

  it("rejects skipped workflow states", () => {
    expect(() =>
      validateStatusTransition("delivery", "draft", "ready"),
    ).toThrow("The next status must be waiting.");
  });

  it("allows cancellation before completion", () => {
    expect(() =>
      validateStatusTransition("transfer", "waiting", "canceled"),
    ).not.toThrow();
  });

  it("only validates ready operations", () => {
    expect(() => validateReadyForCompletion("ready")).not.toThrow();
    expect(() => validateReadyForCompletion("waiting")).toThrow(
      "Only ready operations can be validated.",
    );
  });
});
