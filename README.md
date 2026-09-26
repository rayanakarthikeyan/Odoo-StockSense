# StockSense

StockSense is a local-first inventory management system for receipts, deliveries, internal transfers, stock adjustments, low-stock alerts, and a complete stock ledger.

## Stack

- React + TypeScript + Vite
- Express API
- SQLite with transactional stock updates
- Zod validation

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The API runs on `http://localhost:4000` and creates a local database at `data/stocksense.db` with demo inventory on first launch.

## Engineering guardrails

All work must use dynamic API/database data, robust input validation, responsive and consistent UI patterns, intuitive navigation, local-first behavior, and a collaborative Git workflow. AI-assisted code must be understood, adapted, and verified before it is merged.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete development rules and definition-of-done checklist. Pull requests use the same checks through the repository template.

## Current vertical slice

- Responsive live dashboard with KPI and operation filters
- Product catalog, SKU search, opening stock, and reorder alerts
- Receipt, delivery, transfer, and adjustment drafts
- Multi-line operation editor with duplicate-product prevention
- Searchable operation queue with enforced workflow transitions
- Operation detail view with complete product-line context
- Atomic operation validation with negative-stock protection
- Immutable stock movement ledger
- Local SQLite persistence and production build support

## Next milestones

1. Barcode/SKU scanner and rapid line entry
2. Authentication, roles, and OTP password recovery
3. Warehouse/location administration and reordering automation
4. Picking and packing workflow states
5. CSV import/export, tests, and deployment packaging
