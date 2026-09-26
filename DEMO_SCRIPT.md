# StockSense Demo Script (5–6 minutes)

## Before recording

- Open the production URL and use a desktop-sized browser window.
- Start on **Overview** with all filters cleared.
- Keep the repository page available in another tab for the closing architecture point.
- Use the sample values below so the flow is quick and consistent.

## 0:00–0:35 — Problem and solution

**Say:**

“StockSense is a live inventory operations workspace inspired by Odoo. It replaces disconnected stock sheets with one traceable flow for receipts, deliveries, internal transfers, stock adjustments, low-stock alerts, and a permanent movement ledger.”

Point out the live indicator, responsive navigation, KPI cards, alerts, and operations queue.

## 0:35–1:15 — Live dashboard

**Say:**

“This dashboard is not static JSON. Every KPI, alert, filter, and operation is calculated from the hosted database. I can filter by operation type, status, location, or product category, and the queue updates from the API.”

Select **Receipt** in the type filter, then clear it. Briefly show the low-stock alert panel.

## 1:15–1:50 — Global search and product catalog

Click the global search field and type `Steel`.

**Say:**

“Global search checks both products and operations. It understands product names, SKUs, references, partners, and even products inside an operation.”

Open **Steel Rods**, then click **Edit** on its card.

**Say:**

“Products have validated SKU, category, unit, and reorder rules. Existing stock is never overwritten by editing master data; quantities move only through controlled operations.”

Close the editor without changing data.

## 1:50–3:40 — Complete receipt workflow

Go to **Operations** → **New operation** and enter:

- Type: `Receipt`
- Partner: `Demo Supplier`
- Destination: `Main Stock`
- Product: `Steel Rods`
- Quantity: `25`
- Notes: `Hackathon demo replenishment`

Click **Create draft**.

**Say:**

“An operation starts as a draft, can contain multiple unique product lines, and follows an enforced workflow. Invalid routes, duplicate products, negative values, and illegal status changes are rejected on the server.”

Open the new receipt, click **Mark as ready**, and then **Validate movement**.

**Say:**

“Validation is atomic: StockSense updates the balance and writes the audit ledger in one transaction. If any line fails, the entire movement rolls back. Deliveries and transfers also prevent negative stock.”

Point out the completed timestamp and **Print goods receipt** button.

## 3:40–4:35 — Audit trail and export

Close the detail, open **Move history**, and search for the newly created receipt reference or `Steel`.

**Say:**

“Every validated change records the operation, product, location, quantity delta, and resulting balance. This gives evaluators a clear audit trail rather than editable totals.”

Click **Export CSV**.

**Say:**

“The filtered ledger can also be exported for reporting or reconciliation.”

## 4:35–5:10 — Warehouse configuration

Open **Settings**.

**Say:**

“Warehouse configuration is live as well. Authorized users can add warehouses and stock locations, and those locations immediately become available in operation routes.”

Point out warehouse cards, location codes, product counts, and stock totals. Do not add another warehouse unless the evaluator asks.

## 5:10–5:50 — Architecture and close

**Say:**

“The frontend is React and TypeScript, the API is Express with Zod validation, and production data is stored in Turso using transactional libSQL. Vercel serves the responsive frontend and API. The same code can run locally with SQLite, so development does not depend entirely on cloud connectivity.”

“StockSense delivers the complete inventory loop: configure locations, create products, plan movements, enforce workflow, update stock safely, surface replenishment risks, and preserve an exportable audit history.”

Finish on **Overview** so the updated stock total and operation status are visible.

## If something goes wrong

- If a network call is still loading, wait two seconds; Turso/Vercel may be waking from idle.
- If a delivery reports insufficient stock, reduce its quantity or demonstrate a receipt instead.
- If a SKU already exists, add a timestamp suffix such as `DEMO-1015`.
- Never expose the Turso token or Vercel environment settings in the recording.
