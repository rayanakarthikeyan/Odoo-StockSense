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
import {
  databaseMode,
  execute,
  initializeDatabase,
  queryAll,
  queryOne,
  writeTransaction,
  type SqlValue,
} from "./db.js";
import {
  type OperationStatus,
  type OperationType,
  operationStatuses,
  operationSchema,
  operationTypes,
  validateReadyForCompletion,
  validateOperationRoute,
  validateStatusTransition,
} from "./operations.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const databaseReady = initializeDatabase();

app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production" ? undefined : false,
  }),
);
app.use(cors());
app.use(express.json({ limit: "256kb" }));
app.use((_req, _res, next) => databaseReady.then(() => next()).catch(next));

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

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => unknown,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", database: "connected", provider: databaseMode }),
);

app.get(
  "/api/meta",
  asyncRoute(async (_req, res) => {
    const [locations, categories] = await Promise.all([
      queryAll<{ id: number; name: string; code: string; warehouse: string }>(`
      SELECT l.id, l.name, l.code, w.name AS warehouse
      FROM locations l JOIN warehouses w ON w.id = l.warehouse_id ORDER BY w.name, l.name
    `),
      queryAll<{ category: string }>(
        "SELECT DISTINCT category FROM products WHERE active = 1 ORDER BY category",
      ),
    ]);
    res.json({ locations, categories: categories.map((row) => row.category) });
  }),
);

app.get(
  "/api/dashboard",
  asyncRoute(async (req, res) => {
    const type = z
      .enum(operationTypes)
      .optional()
      .safeParse(req.query.type || undefined);
    const status = z
      .enum(operationStatuses)
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

    const [inventory, pending, operations, alerts] = await Promise.all([
      queryOne<Record<string, number>>(`
      SELECT COUNT(*) AS totalProducts, COALESCE(SUM(total_quantity), 0) AS totalUnits,
        SUM(CASE WHEN total_quantity <= reorder_level THEN 1 ELSE 0 END) AS lowStock,
        SUM(CASE WHEN total_quantity <= 0 THEN 1 ELSE 0 END) AS outOfStock
      FROM (
        SELECT p.id, p.reorder_level, COALESCE(SUM(sb.quantity), 0) AS total_quantity
        FROM products p LEFT JOIN stock_balances sb ON sb.product_id = p.id
        WHERE p.active = 1 GROUP BY p.id
      ) totals
    `),
      queryOne<Record<string, number>>(`
      SELECT
        SUM(CASE WHEN type = 'receipt' AND status NOT IN ('done','canceled') THEN 1 ELSE 0 END) AS pendingReceipts,
        SUM(CASE WHEN type = 'delivery' AND status NOT IN ('done','canceled') THEN 1 ELSE 0 END) AS pendingDeliveries,
        SUM(CASE WHEN type = 'transfer' AND status NOT IN ('done','canceled') THEN 1 ELSE 0 END) AS scheduledTransfers
      FROM operations
    `),
      queryAll(
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
        params,
      ),
      queryAll(`
      SELECT p.id, p.name, p.sku, p.category, p.unit, p.reorder_level AS reorderLevel,
        COALESCE(SUM(sb.quantity), 0) AS quantity
      FROM products p LEFT JOIN stock_balances sb ON sb.product_id = p.id
      WHERE p.active = 1 GROUP BY p.id
      HAVING quantity <= p.reorder_level ORDER BY quantity ASC, p.name LIMIT 6
    `),
    ]);
    res.json({ kpis: { ...inventory, ...pending }, operations, alerts });
  }),
);

app.get(
  "/api/products",
  asyncRoute(async (req, res) => {
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
    const products = await queryAll(
      `
    SELECT p.id, p.name, p.sku, p.category, p.unit, p.reorder_level AS reorderLevel,
      COALESCE(SUM(sb.quantity), 0) AS quantity,
      CASE WHEN COALESCE(SUM(sb.quantity), 0) <= 0 THEN 'out'
           WHEN COALESCE(SUM(sb.quantity), 0) <= p.reorder_level THEN 'low' ELSE 'healthy' END AS stockStatus
    FROM products p LEFT JOIN stock_balances sb ON sb.product_id = p.id
    WHERE ${where.join(" AND ")} GROUP BY p.id ORDER BY p.name
  `,
      params,
    );
    res.json(products);
  }),
);

app.post(
  "/api/products",
  asyncRoute(async (req, res) => {
    const input = productSchema.parse(req.body);
    const productId = await writeTransaction(async (transaction) => {
      const result = await transaction.execute({
        sql: "INSERT INTO products (name, sku, category, unit, reorder_level) VALUES (?, ?, ?, ?, ?)",
        args: [
          input.name,
          input.sku.toUpperCase(),
          input.category,
          input.unit,
          input.reorderLevel,
        ],
      });
      const id = Number(result.lastInsertRowid);
      await transaction.execute({
        sql: "INSERT INTO stock_balances (product_id, location_id, quantity) VALUES (?, ?, ?)",
        args: [id, input.locationId, input.initialStock],
      });
      return id;
    });
    res.status(201).json({ id: productId });
  }),
);

app.get(
  "/api/operations",
  asyncRoute(async (req, res) => {
    const query = z
      .string()
      .trim()
      .max(100)
      .parse(req.query.q || "");
    const type = z
      .enum(operationTypes)
      .optional()
      .parse(req.query.type || undefined);
    const status = z
      .enum(operationStatuses)
      .optional()
      .parse(req.query.status || undefined);
    const where = ["1 = 1"];
    const params: SqlValue[] = [];
    if (query) {
      where.push(`(o.reference LIKE ? OR o.partner LIKE ? OR EXISTS (
      SELECT 1 FROM operation_lines search_line
      JOIN products search_product ON search_product.id = search_line.product_id
      WHERE search_line.operation_id = o.id AND (search_product.name LIKE ? OR search_product.sku LIKE ?)
    ))`);
      const pattern = `%${query}%`;
      params.push(pattern, pattern, pattern, pattern);
    }
    if (type) {
      where.push("o.type = ?");
      params.push(type);
    }
    if (status) {
      where.push("o.status = ?");
      params.push(status);
    }
    const rows = await queryAll(
      `
    SELECT o.id, o.reference, o.type, o.status, o.partner, o.scheduled_at AS scheduledAt,
      o.completed_at AS completedAt, o.notes, src.name AS sourceLocation,
      dest.name AS destinationLocation, COUNT(ol.id) AS lineCount, COALESCE(SUM(ol.quantity), 0) AS totalQuantity
    FROM operations o
    LEFT JOIN locations src ON src.id = o.source_location_id
    LEFT JOIN locations dest ON dest.id = o.destination_location_id
    LEFT JOIN operation_lines ol ON ol.operation_id = o.id
    WHERE ${where.join(" AND ")} GROUP BY o.id ORDER BY datetime(o.created_at) DESC, o.id DESC
  `,
      params,
    );
    res.json(rows);
  }),
);

app.get(
  "/api/operations/:id",
  asyncRoute(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const operation = await queryOne<Record<string, unknown>>(
      `
    SELECT o.id, o.reference, o.type, o.status, o.partner, o.scheduled_at AS scheduledAt,
      o.completed_at AS completedAt, o.notes, src.name AS sourceLocation,
      dest.name AS destinationLocation, COUNT(ol.id) AS lineCount, COALESCE(SUM(ol.quantity), 0) AS totalQuantity
    FROM operations o
    LEFT JOIN locations src ON src.id = o.source_location_id
    LEFT JOIN locations dest ON dest.id = o.destination_location_id
    LEFT JOIN operation_lines ol ON ol.operation_id = o.id
    WHERE o.id = ? GROUP BY o.id
  `,
      [id],
    );
    if (!operation)
      return res.status(404).json({ error: "Operation not found." });
    const lines = await queryAll(
      `
    SELECT ol.id, p.id AS productId, p.name AS product, p.sku, p.unit,
      ol.quantity, ol.counted_quantity AS countedQuantity
    FROM operation_lines ol JOIN products p ON p.id = ol.product_id
    WHERE ol.operation_id = ? ORDER BY ol.id
  `,
      [id],
    );
    res.json({ ...operation, lines });
  }),
);

app.post(
  "/api/operations",
  asyncRoute(async (req, res) => {
    const input = operationSchema.parse(req.body);
    validateOperationRoute(input);
    const activeProducts = await queryAll<{ id: number }>(
      `SELECT id FROM products WHERE active = 1 AND id IN (${input.lines.map(() => "?").join(",")})`,
      input.lines.map((line) => line.productId),
    );
    if (activeProducts.length !== input.lines.length)
      throw new Error("One or more selected products are unavailable.");
    const prefix = {
      receipt: "REC",
      delivery: "DEL",
      transfer: "INT",
      adjustment: "ADJ",
    }[input.type];
    const reference = `${prefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const operationId = await writeTransaction(async (transaction) => {
      const result = await transaction.execute({
        sql: `INSERT INTO operations
        (reference, type, status, partner, source_location_id, destination_location_id, scheduled_at, notes)
        VALUES (?, ?, 'draft', ?, ?, ?, ?, ?)`,
        args: [
          reference,
          input.type,
          input.partner || null,
          input.sourceLocationId || null,
          input.destinationLocationId || null,
          input.scheduledAt,
          input.notes || null,
        ],
      });
      const id = Number(result.lastInsertRowid);
      for (const line of input.lines) {
        await transaction.execute({
          sql: "INSERT INTO operation_lines (operation_id, product_id, quantity, counted_quantity) VALUES (?, ?, ?, ?)",
          args: [
            id,
            line.productId,
            line.quantity,
            line.countedQuantity ?? null,
          ],
        });
      }
      return id;
    });
    res.status(201).json({ id: operationId, reference });
  }),
);

app.patch(
  "/api/operations/:id/status",
  asyncRoute(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const status = z
      .enum(["waiting", "ready", "canceled"])
      .parse(req.body.status);
    const operation = await queryOne<{
      type: OperationType;
      status: OperationStatus;
    }>("SELECT type, status FROM operations WHERE id = ?", [id]);
    if (!operation)
      return res.status(404).json({ error: "Operation not found." });
    validateStatusTransition(operation.type, operation.status, status);
    await execute("UPDATE operations SET status = ? WHERE id = ?", [
      status,
      id,
    ]);
    res.json({ id, status });
  }),
);

app.post(
  "/api/operations/:id/validate",
  asyncRoute(async (req, res) => {
    const operationId = z.coerce.number().int().positive().parse(req.params.id);
    await writeTransaction(async (transaction) => {
      const operationResult = await transaction.execute({
        sql: "SELECT * FROM operations WHERE id = ?",
        args: [operationId],
      });
      const operation = operationResult.rows[0];
      if (!operation) throw new Error("Operation not found.");
      validateReadyForCompletion(operation.status as OperationStatus);
      const lineResult = await transaction.execute({
        sql: "SELECT * FROM operation_lines WHERE operation_id = ?",
        args: [operationId],
      });

      const move = async (
        productId: number,
        locationId: number,
        change: number,
      ) => {
        const balanceResult = await transaction.execute({
          sql: "SELECT quantity FROM stock_balances WHERE product_id = ? AND location_id = ?",
          args: [productId, locationId],
        });
        const current = Number(balanceResult.rows[0]?.quantity || 0);
        const next = current + change;
        if (next < 0)
          throw new Error(
            `Insufficient stock for product #${productId}. Available: ${current}.`,
          );
        await transaction.execute({
          sql: `INSERT INTO stock_balances (product_id, location_id, quantity) VALUES (?, ?, ?)
          ON CONFLICT(product_id, location_id) DO UPDATE SET quantity = excluded.quantity`,
          args: [productId, locationId, next],
        });
        await transaction.execute({
          sql: `INSERT INTO stock_ledger
          (operation_id, product_id, location_id, change_quantity, balance_after) VALUES (?, ?, ?, ?, ?)`,
          args: [operationId, productId, locationId, change, next],
        });
      };

      for (const line of lineResult.rows) {
        const productId = Number(line.product_id);
        const quantity = Number(line.quantity);
        if (operation.type === "receipt")
          await move(
            productId,
            Number(operation.destination_location_id),
            quantity,
          );
        if (operation.type === "delivery")
          await move(
            productId,
            Number(operation.source_location_id),
            -quantity,
          );
        if (operation.type === "transfer") {
          await move(
            productId,
            Number(operation.source_location_id),
            -quantity,
          );
          await move(
            productId,
            Number(operation.destination_location_id),
            quantity,
          );
        }
        if (operation.type === "adjustment") {
          const locationId = Number(operation.source_location_id);
          const balanceResult = await transaction.execute({
            sql: "SELECT quantity FROM stock_balances WHERE product_id = ? AND location_id = ?",
            args: [productId, locationId],
          });
          const current = Number(balanceResult.rows[0]?.quantity || 0);
          await move(
            productId,
            locationId,
            Number(line.counted_quantity) - current,
          );
        }
      }
      await transaction.execute({
        sql: "UPDATE operations SET status = 'done', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        args: [operationId],
      });
    });
    res.json({ id: operationId, status: "done" });
  }),
);

app.get(
  "/api/ledger",
  asyncRoute(async (_req, res) => {
    const rows = await queryAll(`
    SELECT sl.id, sl.created_at AS createdAt, o.reference, o.type, p.name AS product, p.sku, p.unit,
      l.name AS location, sl.change_quantity AS changeQuantity, sl.balance_after AS balanceAfter
    FROM stock_ledger sl
    JOIN operations o ON o.id = sl.operation_id
    JOIN products p ON p.id = sl.product_id
    JOIN locations l ON l.id = sl.location_id
    ORDER BY sl.id DESC LIMIT 200
  `);
    res.json(rows);
  }),
);

if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.resolve(dirname, "../dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    return res
      .status(400)
      .json({
        error: "Please check the submitted values.",
        details: error.flatten(),
      });
  }
  const message =
    error instanceof Error ? error.message : "Unexpected server error.";
  const isConflict = message.includes("UNIQUE constraint failed");
  res
    .status(isConflict ? 409 : 400)
    .json({ error: isConflict ? "That SKU already exists." : message });
});

export default app;

if (!process.env.VERCEL) {
  databaseReady
    .then(() =>
      app.listen(port, () =>
        console.log(`StockSense API ready at http://localhost:${port}`),
      ),
    )
    .catch((error) => {
      console.error("Unable to initialize StockSense database.", error);
      process.exitCode = 1;
    });
}
