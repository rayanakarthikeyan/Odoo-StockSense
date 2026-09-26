import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { db, type SqlValue } from "./db.js";

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production" ? undefined : false,
  }),
);
app.use(cors());
app.use(express.json({ limit: "256kb" }));

const operationTypes = [
  "receipt",
  "delivery",
  "transfer",
  "adjustment",
] as const;
const statuses = ["draft", "waiting", "ready", "done", "canceled"] as const;

const productSchema = z.object({
  name: z.string().trim().min(2).max(100),
  sku: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  category: z.string().trim().min(2).max(60),
  unit: z.string().trim().min(1).max(20),
  reorderLevel: z.number().min(0),
  initialStock: z.number().min(0).default(0),
  locationId: z.number().int().positive(),
});

const operationSchema = z.object({
  type: z.enum(operationTypes),
  partner: z.string().trim().max(100).optional().nullable(),
  sourceLocationId: z.number().int().positive().optional().nullable(),
  destinationLocationId: z.number().int().positive().optional().nullable(),
  scheduledAt: z.string().datetime(),
  notes: z.string().trim().max(500).optional().nullable(),
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().positive(),
        countedQuantity: z.number().min(0).optional().nullable(),
      }),
    )
    .min(1),
});

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => unknown,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", database: "connected" }),
);

app.get("/api/meta", (_req, res) => {
  const locations = db
    .prepare(
      `
    SELECT l.id, l.name, l.code, w.name AS warehouse
    FROM locations l JOIN warehouses w ON w.id = l.warehouse_id ORDER BY w.name, l.name
  `,
    )
    .all();
  const categories = db
    .prepare(
      "SELECT DISTINCT category FROM products WHERE active = 1 ORDER BY category",
    )
    .all();
  res.json({
    locations,
    categories: categories.map((row) => (row as { category: string }).category),
  });
});

app.get("/api/dashboard", (req, res) => {
  const type = z
    .enum(operationTypes)
    .optional()
    .safeParse(req.query.type || undefined);
  const status = z
    .enum(statuses)
    .optional()
    .safeParse(req.query.status || undefined);
  const location = z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .safeParse(req.query.location || undefined);
  const category = z
    .string()
    .trim()
    .optional()
    .safeParse(req.query.category || undefined);

  const where = ["1 = 1"];
  const params: SqlValue[] = [];
  if (type.success && type.data) {
    where.push("o.type = ?");
    params.push(type.data);
  }
  if (status.success && status.data) {
    where.push("o.status = ?");
    params.push(status.data);
  }
  if (location.success && location.data) {
    where.push("(o.source_location_id = ? OR o.destination_location_id = ?)");
    params.push(location.data, location.data);
  }
  if (category.success && category.data) {
    where.push(
      "EXISTS (SELECT 1 FROM operation_lines ol2 JOIN products p2 ON p2.id = ol2.product_id WHERE ol2.operation_id = o.id AND p2.category = ?)",
    );
    params.push(category.data);
  }

  const inventory = db
    .prepare(
      `
    SELECT
      COUNT(*) AS totalProducts,
      COALESCE(SUM(total_quantity), 0) AS totalUnits,
      SUM(CASE WHEN total_quantity <= reorder_level THEN 1 ELSE 0 END) AS lowStock,
      SUM(CASE WHEN total_quantity <= 0 THEN 1 ELSE 0 END) AS outOfStock
    FROM (
      SELECT p.id, p.reorder_level, COALESCE(SUM(sb.quantity), 0) AS total_quantity
      FROM products p LEFT JOIN stock_balances sb ON sb.product_id = p.id
      WHERE p.active = 1 GROUP BY p.id
    ) totals
  `,
    )
    .get();

  const pending = db
    .prepare(
      `
    SELECT
      SUM(CASE WHEN type = 'receipt' AND status NOT IN ('done','canceled') THEN 1 ELSE 0 END) AS pendingReceipts,
      SUM(CASE WHEN type = 'delivery' AND status NOT IN ('done','canceled') THEN 1 ELSE 0 END) AS pendingDeliveries,
      SUM(CASE WHEN type = 'transfer' AND status NOT IN ('done','canceled') THEN 1 ELSE 0 END) AS scheduledTransfers
    FROM operations
  `,
    )
    .get();

  const operations = db
    .prepare(
      `
    SELECT o.id, o.reference, o.type, o.status, o.partner, o.scheduled_at AS scheduledAt,
      src.name AS sourceLocation, dest.name AS destinationLocation,
      COUNT(ol.id) AS lineCount, COALESCE(SUM(ol.quantity), 0) AS totalQuantity
    FROM operations o
    LEFT JOIN locations src ON src.id = o.source_location_id
    LEFT JOIN locations dest ON dest.id = o.destination_location_id
    LEFT JOIN operation_lines ol ON ol.operation_id = o.id
    WHERE ${where.join(" AND ")}
    GROUP BY o.id ORDER BY datetime(o.created_at) DESC, o.id DESC LIMIT 20
  `,
    )
    .all(...params);

  const alerts = db
    .prepare(
      `
    SELECT p.id, p.name, p.sku, p.category, p.unit, p.reorder_level AS reorderLevel,
      COALESCE(SUM(sb.quantity), 0) AS quantity
    FROM products p LEFT JOIN stock_balances sb ON sb.product_id = p.id
    WHERE p.active = 1 GROUP BY p.id
    HAVING quantity <= p.reorder_level
    ORDER BY quantity ASC, p.name LIMIT 6
  `,
    )
    .all();

  res.json({
    kpis: { ...(inventory as object), ...(pending as object) },
    operations,
    alerts,
  });
});

app.get("/api/products", (req, res) => {
  const query = String(req.query.q || "").trim();
  const category = String(req.query.category || "").trim();
  const where = ["p.active = 1"];
  const params: SqlValue[] = [];
  if (query) {
    where.push("(p.name LIKE ? OR p.sku LIKE ?)");
    params.push(`%${query}%`, `%${query}%`);
  }
  if (category) {
    where.push("p.category = ?");
    params.push(category);
  }
  const products = db
    .prepare(
      `
    SELECT p.id, p.name, p.sku, p.category, p.unit, p.reorder_level AS reorderLevel,
      COALESCE(SUM(sb.quantity), 0) AS quantity,
      CASE WHEN COALESCE(SUM(sb.quantity), 0) <= 0 THEN 'out'
           WHEN COALESCE(SUM(sb.quantity), 0) <= p.reorder_level THEN 'low' ELSE 'healthy' END AS stockStatus
    FROM products p LEFT JOIN stock_balances sb ON sb.product_id = p.id
    WHERE ${where.join(" AND ")} GROUP BY p.id ORDER BY p.name
  `,
    )
    .all(...params);
  res.json(products);
});

app.post("/api/products", (req, res) => {
  const input = productSchema.parse(req.body);
  const create = db.transaction(() => {
    const result = db
      .prepare(
        `
      INSERT INTO products (name, sku, category, unit, reorder_level) VALUES (?, ?, ?, ?, ?)
    `,
      )
      .run(
        input.name,
        input.sku.toUpperCase(),
        input.category,
        input.unit,
        input.reorderLevel,
      );
    const productId = Number(result.lastInsertRowid);
    db.prepare(
      "INSERT INTO stock_balances (product_id, location_id, quantity) VALUES (?, ?, ?)",
    ).run(productId, input.locationId, input.initialStock);
    return productId;
  });
  res.status(201).json({ id: create() });
});

app.get("/api/operations", (req, res) => {
  const rows = db
    .prepare(
      `
    SELECT o.id, o.reference, o.type, o.status, o.partner, o.scheduled_at AS scheduledAt,
      o.completed_at AS completedAt, o.notes, src.name AS sourceLocation, dest.name AS destinationLocation,
      COUNT(ol.id) AS lineCount, COALESCE(SUM(ol.quantity), 0) AS totalQuantity
    FROM operations o
    LEFT JOIN locations src ON src.id = o.source_location_id
    LEFT JOIN locations dest ON dest.id = o.destination_location_id
    LEFT JOIN operation_lines ol ON ol.operation_id = o.id
    GROUP BY o.id ORDER BY datetime(o.created_at) DESC, o.id DESC
  `,
    )
    .all();
  res.json(rows);
});

app.post("/api/operations", (req, res) => {
  const input = operationSchema.parse(req.body);
  if (input.type === "receipt" && !input.destinationLocationId)
    throw new Error("Receipts require a destination location.");
  if (
    ["delivery", "adjustment"].includes(input.type) &&
    !input.sourceLocationId
  )
    throw new Error(`${input.type} requires a source location.`);
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
  if (
    input.type === "adjustment" &&
    input.lines.some((line) => line.countedQuantity == null)
  ) {
    throw new Error("Adjustments require a counted quantity for every line.");
  }

  const prefix = {
    receipt: "REC",
    delivery: "DEL",
    transfer: "INT",
    adjustment: "ADJ",
  }[input.type];
  const reference = `${prefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const create = db.transaction(() => {
    const operation = db
      .prepare(
        `
      INSERT INTO operations
        (reference, type, status, partner, source_location_id, destination_location_id, scheduled_at, notes)
      VALUES (?, ?, 'draft', ?, ?, ?, ?, ?)
    `,
      )
      .run(
        reference,
        input.type,
        input.partner || null,
        input.sourceLocationId || null,
        input.destinationLocationId || null,
        input.scheduledAt,
        input.notes || null,
      );
    const operationId = Number(operation.lastInsertRowid);
    const insertLine = db.prepare(
      "INSERT INTO operation_lines (operation_id, product_id, quantity, counted_quantity) VALUES (?, ?, ?, ?)",
    );
    for (const line of input.lines)
      insertLine.run(
        operationId,
        line.productId,
        line.quantity,
        line.countedQuantity ?? null,
      );
    return operationId;
  });
  res.status(201).json({ id: create(), reference });
});

app.patch("/api/operations/:id/status", (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const status = z
    .enum(["draft", "waiting", "ready", "canceled"])
    .parse(req.body.status);
  const result = db
    .prepare(
      "UPDATE operations SET status = ? WHERE id = ? AND status != 'done'",
    )
    .run(status, id);
  if (!result.changes)
    return res
      .status(404)
      .json({ error: "Operation not found or already completed." });
  res.json({ id, status });
});

app.post("/api/operations/:id/validate", (req, res) => {
  const operationId = z.coerce.number().int().positive().parse(req.params.id);

  const validateOperation = db.transaction(() => {
    const operation = db
      .prepare("SELECT * FROM operations WHERE id = ?")
      .get(operationId) as Record<string, SqlValue> | undefined;
    if (!operation) throw new Error("Operation not found.");
    if (operation.status === "done")
      throw new Error("This operation is already validated.");
    if (operation.status === "canceled")
      throw new Error("Canceled operations cannot be validated.");

    const lines = db
      .prepare("SELECT * FROM operation_lines WHERE operation_id = ?")
      .all(operationId) as Array<Record<string, number | null>>;
    const readBalance = db.prepare(
      "SELECT quantity FROM stock_balances WHERE product_id = ? AND location_id = ?",
    );
    const writeBalance = db.prepare(`
      INSERT INTO stock_balances (product_id, location_id, quantity) VALUES (?, ?, ?)
      ON CONFLICT(product_id, location_id) DO UPDATE SET quantity = excluded.quantity
    `);
    const writeLedger = db.prepare(`
      INSERT INTO stock_ledger (operation_id, product_id, location_id, change_quantity, balance_after)
      VALUES (?, ?, ?, ?, ?)
    `);

    const move = (productId: number, locationId: number, change: number) => {
      const current =
        (
          readBalance.get(productId, locationId) as
            { quantity: number } | undefined
        )?.quantity || 0;
      const next = current + change;
      if (next < 0)
        throw new Error(
          `Insufficient stock for product #${productId}. Available: ${current}.`,
        );
      writeBalance.run(productId, locationId, next);
      writeLedger.run(operationId, productId, locationId, change, next);
    };

    for (const line of lines) {
      const productId = Number(line.product_id);
      const quantity = Number(line.quantity);
      if (operation.type === "receipt")
        move(productId, Number(operation.destination_location_id), quantity);
      if (operation.type === "delivery")
        move(productId, Number(operation.source_location_id), -quantity);
      if (operation.type === "transfer") {
        move(productId, Number(operation.source_location_id), -quantity);
        move(productId, Number(operation.destination_location_id), quantity);
      }
      if (operation.type === "adjustment") {
        const locationId = Number(operation.source_location_id);
        const current =
          (
            readBalance.get(productId, locationId) as
              { quantity: number } | undefined
          )?.quantity || 0;
        move(productId, locationId, Number(line.counted_quantity) - current);
      }
    }
    db.prepare(
      "UPDATE operations SET status = 'done', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(operationId);
  });

  validateOperation();
  res.json({ id: operationId, status: "done" });
});

app.get("/api/ledger", (_req, res) => {
  const rows = db
    .prepare(
      `
    SELECT sl.id, sl.created_at AS createdAt, o.reference, o.type, p.name AS product, p.sku, p.unit,
      l.name AS location, sl.change_quantity AS changeQuantity, sl.balance_after AS balanceAfter
    FROM stock_ledger sl
    JOIN operations o ON o.id = sl.operation_id
    JOIN products p ON p.id = sl.product_id
    JOIN locations l ON l.id = sl.location_id
    ORDER BY sl.id DESC LIMIT 200
  `,
    )
    .all();
  res.json(rows);
});

if (process.env.NODE_ENV === "production") {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.resolve(dirname, "../dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError)
    return res.status(400).json({
      error: "Please check the submitted values.",
      details: error.flatten(),
    });
  const message =
    error instanceof Error ? error.message : "Unexpected server error.";
  const isConflict = message.includes("UNIQUE constraint failed");
  res
    .status(isConflict ? 409 : 400)
    .json({ error: isConflict ? "That SKU already exists." : message });
});

app.listen(port, () =>
  console.log(`StockSense API ready at http://localhost:${port}`),
);
