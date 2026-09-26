import { z } from "zod";

export const operationTypes = [
  "receipt",
  "delivery",
  "transfer",
  "adjustment",
] as const;

export const operationStatuses = [
  "draft",
  "waiting",
  "ready",
  "done",
  "canceled",
] as const;

export type OperationType = (typeof operationTypes)[number];
export type OperationStatus = (typeof operationStatuses)[number];

const operationLineSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().min(0),
  countedQuantity: z.number().min(0).optional().nullable(),
});

export const operationSchema = z
  .object({
    type: z.enum(operationTypes),
    partner: z.string().trim().max(100).optional().nullable(),
    sourceLocationId: z.number().int().positive().optional().nullable(),
    destinationLocationId: z.number().int().positive().optional().nullable(),
    scheduledAt: z.string().datetime(),
    notes: z.string().trim().max(500).optional().nullable(),
    lines: z.array(operationLineSchema).min(1).max(100),
  })
  .superRefine((input, context) => {
    const productIds = new Set<number>();

    input.lines.forEach((line, index) => {
      if (productIds.has(line.productId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lines", index, "productId"],
          message: "Each product can only appear once per operation.",
        });
      }
      productIds.add(line.productId);

      if (input.type === "adjustment") {
        if (line.countedQuantity == null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["lines", index, "countedQuantity"],
            message: "A physical count is required for adjustments.",
          });
        }
      } else if (line.quantity <= 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lines", index, "quantity"],
          message: "Quantity must be greater than zero.",
        });
      }
    });
  });

export type OperationInput = z.infer<typeof operationSchema>;

export function validateOperationRoute(input: OperationInput) {
  if (input.type === "receipt" && !input.destinationLocationId) {
    throw new Error("Receipts require a destination location.");
  }
  if (
    (input.type === "delivery" || input.type === "adjustment") &&
    !input.sourceLocationId
  ) {
    throw new Error(`${input.type} requires a source location.`);
  }
  if (
    input.type === "transfer" &&
    (!input.sourceLocationId ||
      !input.destinationLocationId ||
      input.sourceLocationId === input.destinationLocationId)
  ) {
    throw new Error(
      "Transfers require different source and destination locations.",
    );
  }
}

const nextStatuses: Record<
  OperationType,
  Partial<Record<OperationStatus, OperationStatus>>
> = {
  receipt: { draft: "ready", ready: "done" },
  delivery: { draft: "waiting", waiting: "ready", ready: "done" },
  transfer: { draft: "waiting", waiting: "ready", ready: "done" },
  adjustment: { draft: "ready", ready: "done" },
};

export function getNextOperationStatus(
  type: OperationType,
  status: OperationStatus,
) {
  return nextStatuses[type][status] ?? null;
}

export function validateStatusTransition(
  type: OperationType,
  currentStatus: OperationStatus,
  nextStatus: OperationStatus,
) {
  if (currentStatus === "done" || currentStatus === "canceled") {
    throw new Error("Completed or canceled operations cannot be changed.");
  }
  if (nextStatus === "canceled") return;

  const expectedStatus = getNextOperationStatus(type, currentStatus);
  if (nextStatus !== expectedStatus || nextStatus === "done") {
    throw new Error(
      expectedStatus
        ? `The next status must be ${expectedStatus}.`
        : "This operation has no available status transition.",
    );
  }
}

export function validateReadyForCompletion(status: OperationStatus) {
  if (status !== "ready") {
    throw new Error("Only ready operations can be validated.");
  }
}
