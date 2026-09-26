import { createClient, type InValue, type Transaction } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultPath = path.resolve(here, "../data/stocksense.db");
const localPath = process.env.DATABASE_PATH
  ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
  : defaultPath;
const remoteUrl = process.env.TURSO_DATABASE_URL?.trim();

if (!remoteUrl) fs.mkdirSync(path.dirname(localPath), { recursive: true });

export const databaseUrl =
  remoteUrl || `file:${localPath.replaceAll("\\", "/")}`;
export const databaseMode = remoteUrl ? "turso" : "local";

export const db = createClient({
  url: databaseUrl,
  authToken: remoteUrl ? process.env.TURSO_AUTH_TOKEN : undefined,
});

export type SqlValue = string | number | null;

export async function queryAll<T>(sql: string, args: SqlValue[] = []) {
  const result = await db.execute({ sql, args });
  return result.rows as unknown as T[];
}

export async function queryOne<T>(sql: string, args: SqlValue[] = []) {
  const rows = await queryAll<T>(sql, args);
  return rows[0];
}

export async function execute(sql: string, args: InValue[] = []) {
  return db.execute({ sql, args });
}

export async function writeTransaction<T>(
  callback: (transaction: Transaction) => Promise<T>,
) {
  const transaction = await db.transaction("write");
  try {
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

const schema = [
  `CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    reorder_level REAL NOT NULL DEFAULT 0 CHECK(reorder_level >= 0),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS stock_balances (
    product_id INTEGER NOT NULL REFERENCES products(id),
    location_id INTEGER NOT NULL REFERENCES locations(id),
    quantity REAL NOT NULL DEFAULT 0,
    PRIMARY KEY(product_id, location_id)
  )`,
  `CREATE TABLE IF NOT EXISTS operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('receipt','delivery','transfer','adjustment')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','waiting','ready','done','canceled')),
    partner TEXT,
    source_location_id INTEGER REFERENCES locations(id),
    destination_location_id INTEGER REFERENCES locations(id),
    scheduled_at TEXT NOT NULL,
    completed_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS operation_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity REAL NOT NULL CHECK(quantity >= 0),
    counted_quantity REAL CHECK(counted_quantity >= 0)
  )`,
  `CREATE TABLE IF NOT EXISTS stock_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id INTEGER NOT NULL REFERENCES operations(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    location_id INTEGER NOT NULL REFERENCES locations(id),
    change_quantity REAL NOT NULL,
    balance_after REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS idx_operations_type_status ON operations(type, status)",
  "CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON stock_ledger(created_at DESC)",
];

async function seed() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86_400_000).toISOString();
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString();
  const products = [
    [1, "Steel Rods", "STL-ROD-12", "Raw Materials", "kg", 60, 184],
    [2, "Ergonomic Chair", "FUR-CHR-08", "Finished Goods", "units", 12, 8],
    [3, "Packing Carton - Large", "PKG-CTN-L", "Packaging", "units", 40, 32],
    [4, "Aluminium Sheet", "ALU-SHT-04", "Raw Materials", "sheets", 25, 0],
    [5, "Safety Gloves", "SAF-GLV-M", "Safety", "pairs", 30, 76],
    [6, "Hex Bolts M8", "BLT-M8-100", "Components", "boxes", 18, 42],
  ] as const;

  await writeTransaction(async (transaction) => {
    const productCount = await transaction.execute(
      "SELECT COUNT(*) AS count FROM products",
    );
    if (Number(productCount.rows[0]?.count || 0) > 0) return;

    const statements = [
      {
        sql: "INSERT INTO warehouses (id, name, code) VALUES (?, ?, ?)",
        args: [1, "Main Warehouse", "WH-MAIN"],
      },
      {
        sql: "INSERT INTO warehouses (id, name, code) VALUES (?, ?, ?)",
        args: [2, "Secondary Warehouse", "WH-SEC"],
      },
      {
        sql: "INSERT INTO locations (id, warehouse_id, name, code) VALUES (?, ?, ?, ?)",
        args: [1, 1, "Main Stock", "MAIN/STOCK"],
      },
      {
        sql: "INSERT INTO locations (id, warehouse_id, name, code) VALUES (?, ?, ?, ?)",
        args: [2, 1, "Production Floor", "MAIN/PROD"],
      },
      {
        sql: "INSERT INTO locations (id, warehouse_id, name, code) VALUES (?, ?, ?, ?)",
        args: [3, 1, "Dispatch Zone", "MAIN/OUT"],
      },
      {
        sql: "INSERT INTO locations (id, warehouse_id, name, code) VALUES (?, ?, ?, ?)",
        args: [4, 2, "Secondary Stock", "SEC/STOCK"],
      },
      ...products.flatMap(
        ([id, name, sku, category, unit, reorder, quantity]) => [
          {
            sql: "INSERT INTO products (id, name, sku, category, unit, reorder_level) VALUES (?, ?, ?, ?, ?, ?)",
            args: [id, name, sku, category, unit, reorder],
          },
          {
            sql: "INSERT INTO stock_balances (product_id, location_id, quantity) VALUES (?, ?, ?)",
            args: [id, 1, quantity],
          },
        ],
      ),
      {
        sql: `INSERT INTO operations
          (id, reference, type, status, partner, source_location_id, destination_location_id, scheduled_at, completed_at, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          1,
          "REC-2026-0018",
          "receipt",
          "ready",
          "Apex Metals",
          null,
          1,
          tomorrow,
          null,
          "Routine material replenishment",
        ],
      },
      {
        sql: "INSERT INTO operation_lines (operation_id, product_id, quantity, counted_quantity) VALUES (?, ?, ?, ?)",
        args: [1, 1, 50, null],
      },
      {
        sql: `INSERT INTO operations
          (id, reference, type, status, partner, source_location_id, destination_location_id, scheduled_at, completed_at, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          2,
          "DEL-2026-0031",
          "delivery",
          "waiting",
          "Orbit Furnishings",
          1,
          3,
          tomorrow,
          null,
          "Customer shipment",
        ],
      },
      {
        sql: "INSERT INTO operation_lines (operation_id, product_id, quantity, counted_quantity) VALUES (?, ?, ?, ?)",
        args: [2, 2, 4, null],
      },
      {
        sql: `INSERT INTO operations
          (id, reference, type, status, partner, source_location_id, destination_location_id, scheduled_at, completed_at, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          3,
          "INT-2026-0009",
          "transfer",
          "draft",
          null,
          1,
          2,
          tomorrow,
          null,
          "Move material for production batch",
        ],
      },
      {
        sql: "INSERT INTO operation_lines (operation_id, product_id, quantity, counted_quantity) VALUES (?, ?, ?, ?)",
        args: [3, 1, 24, null],
      },
      {
        sql: `INSERT INTO operations
          (id, reference, type, status, partner, source_location_id, destination_location_id, scheduled_at, completed_at, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          4,
          "REC-2026-0017",
          "receipt",
          "done",
          "BoltWorks",
          null,
          1,
          yesterday,
          yesterday,
          "Completed receipt",
        ],
      },
      {
        sql: "INSERT INTO operation_lines (operation_id, product_id, quantity, counted_quantity) VALUES (?, ?, ?, ?)",
        args: [4, 6, 12, null],
      },
    ];

    for (const statement of statements) {
      await transaction.execute(statement);
    }
  });
}

let initialization: Promise<void> | undefined;

export function initializeDatabase() {
  initialization ??= (async () => {
    await execute("PRAGMA foreign_keys = ON");
    await db.batch(schema, "write");
    await seed();
  })();
  return initialization;
}
