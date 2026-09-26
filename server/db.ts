import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultPath = path.resolve(here, "../data/stocksense.db");
const databasePath = process.env.DATABASE_PATH
  ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
  : defaultPath;

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    reorder_level REAL NOT NULL DEFAULT 0 CHECK(reorder_level >= 0),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stock_balances (
    product_id INTEGER NOT NULL REFERENCES products(id),
    location_id INTEGER NOT NULL REFERENCES locations(id),
    quantity REAL NOT NULL DEFAULT 0,
    PRIMARY KEY(product_id, location_id)
  );

  CREATE TABLE IF NOT EXISTS operations (
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
  );

  CREATE TABLE IF NOT EXISTS operation_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity REAL NOT NULL CHECK(quantity >= 0),
    counted_quantity REAL CHECK(counted_quantity >= 0)
  );

  CREATE TABLE IF NOT EXISTS stock_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id INTEGER NOT NULL REFERENCES operations(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    location_id INTEGER NOT NULL REFERENCES locations(id),
    change_quantity REAL NOT NULL,
    balance_after REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_operations_type_status ON operations(type, status);
  CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON stock_ledger(created_at DESC);
`);

function seed() {
  const productCount = db
    .prepare("SELECT COUNT(*) AS count FROM products")
    .get() as { count: number };
  if (productCount.count > 0) return;

  const transaction = db.transaction(() => {
    const insertWarehouse = db.prepare(
      "INSERT INTO warehouses (name, code) VALUES (?, ?)",
    );
    const mainWarehouseId = Number(
      insertWarehouse.run("Main Warehouse", "WH-MAIN").lastInsertRowid,
    );
    const secondaryWarehouseId = Number(
      insertWarehouse.run("Secondary Warehouse", "WH-SEC").lastInsertRowid,
    );

    const insertLocation = db.prepare(
      "INSERT INTO locations (warehouse_id, name, code) VALUES (?, ?, ?)",
    );
    const mainStockId = Number(
      insertLocation.run(mainWarehouseId, "Main Stock", "MAIN/STOCK")
        .lastInsertRowid,
    );
    const productionId = Number(
      insertLocation.run(mainWarehouseId, "Production Floor", "MAIN/PROD")
        .lastInsertRowid,
    );
    const dispatchId = Number(
      insertLocation.run(mainWarehouseId, "Dispatch Zone", "MAIN/OUT")
        .lastInsertRowid,
    );
    const secondaryStockId = Number(
      insertLocation.run(secondaryWarehouseId, "Secondary Stock", "SEC/STOCK")
        .lastInsertRowid,
    );

    const insertProduct = db.prepare(
      "INSERT INTO products (name, sku, category, unit, reorder_level) VALUES (?, ?, ?, ?, ?)",
    );
    const products = [
      ["Steel Rods", "STL-ROD-12", "Raw Materials", "kg", 60, 184],
      ["Ergonomic Chair", "FUR-CHR-08", "Finished Goods", "units", 12, 8],
      ["Packing Carton - Large", "PKG-CTN-L", "Packaging", "units", 40, 32],
      ["Aluminium Sheet", "ALU-SHT-04", "Raw Materials", "sheets", 25, 0],
      ["Safety Gloves", "SAF-GLV-M", "Safety", "pairs", 30, 76],
      ["Hex Bolts M8", "BLT-M8-100", "Components", "boxes", 18, 42],
    ] as const;

    const insertBalance = db.prepare(
      "INSERT INTO stock_balances (product_id, location_id, quantity) VALUES (?, ?, ?)",
    );
    for (const [name, sku, category, unit, reorder, quantity] of products) {
      const productId = Number(
        insertProduct.run(name, sku, category, unit, reorder).lastInsertRowid,
      );
      insertBalance.run(productId, mainStockId, quantity);
    }

    const insertOperation = db.prepare(`
      INSERT INTO operations
        (reference, type, status, partner, source_location_id, destination_location_id, scheduled_at, completed_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertLine = db.prepare(
      "INSERT INTO operation_lines (operation_id, product_id, quantity, counted_quantity) VALUES (?, ?, ?, ?)",
    );
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 86_400_000).toISOString();
    const yesterday = new Date(now.getTime() - 86_400_000).toISOString();

    const receiptId = Number(
      insertOperation.run(
        "REC-2026-0018",
        "receipt",
        "ready",
        "Apex Metals",
        null,
        mainStockId,
        tomorrow,
        null,
        "Routine material replenishment",
      ).lastInsertRowid,
    );
    insertLine.run(receiptId, 1, 50, null);

    const deliveryId = Number(
      insertOperation.run(
        "DEL-2026-0031",
        "delivery",
        "waiting",
        "Orbit Furnishings",
        mainStockId,
        dispatchId,
        tomorrow,
        null,
        "Customer shipment",
      ).lastInsertRowid,
    );
    insertLine.run(deliveryId, 2, 4, null);

    const transferId = Number(
      insertOperation.run(
        "INT-2026-0009",
        "transfer",
        "draft",
        null,
        mainStockId,
        productionId,
        tomorrow,
        null,
        "Move material for production batch",
      ).lastInsertRowid,
    );
    insertLine.run(transferId, 1, 24, null);

    const completedId = Number(
      insertOperation.run(
        "REC-2026-0017",
        "receipt",
        "done",
        "BoltWorks",
        null,
        mainStockId,
        yesterday,
        yesterday,
        "Completed receipt",
      ).lastInsertRowid,
    );
    insertLine.run(completedId, 6, 12, null);

    void secondaryStockId;
  });

  transaction();
}

seed();

export type SqlValue = string | number | null;
