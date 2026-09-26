import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpFromLine,
  Ban,
  Boxes,
  ChevronDown,
  ClipboardCheck,
  History,
  Eye,
  LayoutDashboard,
  Menu,
  Package,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Warehouse,
  X,
} from "lucide-react";
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { api } from "./api";
import type {
  DashboardData,
  Location,
  Operation,
  OperationDetail,
  OperationStatus,
  OperationType,
  Product,
} from "./types";

const navItems = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/products", label: "Products", icon: Package },
  { to: "/operations", label: "Operations", icon: ClipboardCheck },
  { to: "/ledger", label: "Move history", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
];

const operationLabel: Record<OperationType, string> = {
  receipt: "Receipt",
  delivery: "Delivery",
  transfer: "Transfer",
  adjustment: "Adjustment",
};

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setSidebarOpen(false), [location.pathname]);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Boxes size={22} />
          </div>
          <span>StockSense</span>
        </div>
        <nav>
          <p className="nav-caption">Workspace</p>
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="warehouse-chip">
            <Warehouse size={17} />
            <div>
              <span>Active warehouse</span>
              <strong>Main Warehouse</strong>
            </div>
            <ChevronDown size={15} />
          </div>
          <div className="profile">
            <div className="avatar">RK</div>
            <div>
              <strong>Rayana K.</strong>
              <span>Inventory manager</span>
            </div>
          </div>
        </div>
      </aside>
      {sidebarOpen && (
        <button
          className="backdrop"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <main className="main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={21} />
          </button>
          <div className="global-search">
            <Search size={18} />
            <input
              aria-label="Global search"
              placeholder="Search products, SKUs or operations..."
            />
          </div>
          <div className="live-pill">
            <span className="live-dot" />
            Live inventory
          </div>
        </header>
        <div className="page-wrap">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/operations" element={<OperationsPage />} />
            <Route path="/ledger" element={<LedgerPage />} />
            <Route path="/settings" element={<PlaceholderPage />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [meta, setMeta] = useState<{
    locations: Location[];
    categories: string[];
  }>({ locations: [], categories: [] });
  const [filters, setFilters] = useState({
    type: "",
    status: "",
    location: "",
    category: "",
  });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams(
        Object.entries(filters).filter(([, value]) => value),
      );
      const [dashboard, metadata] = await Promise.all([
        api<DashboardData>(`/api/dashboard?${query}`),
        api<{ locations: Location[]; categories: string[] }>("/api/meta"),
      ]);
      setData(dashboard);
      setMeta(metadata);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const validate = async (id: number) => {
    try {
      await api(`/api/operations/${id}/validate`, { method: "POST" });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!data) return <LoadingState error={error} />;
  const cards = [
    {
      label: "Products tracked",
      value: data.kpis.totalProducts,
      detail: `${formatNumber(data.kpis.totalUnits)} units on hand`,
      icon: Package,
      tone: "violet",
    },
    {
      label: "Stock alerts",
      value: data.kpis.lowStock,
      detail: `${data.kpis.outOfStock} out of stock`,
      icon: AlertTriangle,
      tone: "amber",
    },
    {
      label: "Pending receipts",
      value: data.kpis.pendingReceipts,
      detail: "Incoming inventory",
      icon: ArrowDownToLine,
      tone: "mint",
    },
    {
      label: "Pending deliveries",
      value: data.kpis.pendingDeliveries,
      detail: `${data.kpis.scheduledTransfers} transfers scheduled`,
      icon: ArrowUpFromLine,
      tone: "blue",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Inventory command center"
        title="Good morning, Rayana"
        description="Here is what is moving across your warehouses today."
      >
        <button
          className="button secondary"
          onClick={() => navigate("/products")}
        >
          <Plus size={17} /> Add product
        </button>
        <button
          className="button primary"
          onClick={() => navigate("/operations")}
        >
          <ArrowLeftRight size={17} /> New operation
        </button>
      </PageHeader>
      {error && <InlineError message={error} onClose={() => setError("")} />}
      <section className="kpi-grid">
        {cards.map(({ label, value, detail, icon: Icon, tone }) => (
          <article className="kpi-card" key={label}>
            <div className={`kpi-icon ${tone}`}>
              <Icon size={20} />
            </div>
            <span>{label}</span>
            <strong>{value ?? 0}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </section>
      <section className="dashboard-grid">
        <div className="panel operations-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Work queue</span>
              <h2>Inventory operations</h2>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("/operations")}
            >
              View all <span>→</span>
            </button>
          </div>
          <div className="filters">
            <FilterSelect
              label="All types"
              value={filters.type}
              options={operationTypes()}
              onChange={(type) => setFilters({ ...filters, type })}
            />
            <FilterSelect
              label="All statuses"
              value={filters.status}
              options={["draft", "waiting", "ready", "done", "canceled"]}
              onChange={(status) => setFilters({ ...filters, status })}
            />
            <FilterSelect
              label="All locations"
              value={filters.location}
              options={meta.locations.map((item) => ({
                value: String(item.id),
                label: item.name,
              }))}
              onChange={(location) => setFilters({ ...filters, location })}
            />
            <FilterSelect
              label="All categories"
              value={filters.category}
              options={meta.categories}
              onChange={(category) => setFilters({ ...filters, category })}
            />
          </div>
          <OperationTable operations={data.operations} onValidate={validate} />
        </div>
        <div className="side-stack">
          <div className="panel alert-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Needs attention</span>
                <h2>Stock alerts</h2>
              </div>
              <span className="count-badge">{data.alerts.length}</span>
            </div>
            <div className="alert-list">
              {data.alerts.map((product) => (
                <div className="alert-row" key={product.id}>
                  <div className="product-monogram">
                    {initials(product.name)}
                  </div>
                  <div>
                    <strong>{product.name}</strong>
                    <span>
                      {product.sku} · Reorder at {product.reorderLevel}
                    </span>
                  </div>
                  <b className={product.quantity <= 0 ? "danger" : "warning"}>
                    {product.quantity} {product.unit}
                  </b>
                </div>
              ))}
            </div>
            <button
              className="button full secondary"
              onClick={() => navigate("/products")}
            >
              Review inventory
            </button>
          </div>
          <div className="insight-card">
            <div className="insight-icon">
              <Sparkles size={20} />
            </div>
            <div>
              <span>StockSense insight</span>
              <strong>
                {data.kpis.outOfStock
                  ? `${data.kpis.outOfStock} product needs immediate replenishment.`
                  : "Your critical stock levels look healthy."}
              </strong>
              <p>Use reordering levels to prevent production delays.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<{
    locations: Location[];
    categories: string[];
  }>({ locations: [], categories: [] });
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [items, metadata] = await Promise.all([
        api<Product[]>(`/api/products?q=${encodeURIComponent(query)}`),
        api<{ locations: Location[]; categories: string[] }>("/api/meta"),
      ]);
      setProducts(items);
      setMeta(metadata);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [query]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Products"
        description="Manage SKUs, reordering levels, and stock availability."
      >
        <button className="button primary" onClick={() => setModal(true)}>
          <Plus size={17} /> Add product
        </button>
      </PageHeader>
      {error && <InlineError message={error} onClose={() => setError("")} />}
      <div className="panel">
        <div className="toolbar">
          <div className="table-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or SKU"
            />
          </div>
          <span className="muted">{products.length} products</span>
        </div>
        <div className="product-grid">
          {products.map((product) => (
            <article className="product-card" key={product.id}>
              <div className="product-card-top">
                <div className="product-monogram large">
                  {initials(product.name)}
                </div>
                <StockBadge status={product.stockStatus} />
              </div>
              <span className="sku">{product.sku}</span>
              <h3>{product.name}</h3>
              <p>{product.category}</p>
              <div className="stock-line">
                <strong>{formatNumber(product.quantity)}</strong>
                <span>{product.unit} available</span>
              </div>
              <div className="reorder-line">
                <span>Reorder level</span>
                <b>
                  {product.reorderLevel} {product.unit}
                </b>
              </div>
            </article>
          ))}
        </div>
      </div>
      {modal && (
        <ProductModal
          locations={meta.locations}
          categories={meta.categories}
          onClose={() => setModal(false)}
          onSaved={() => {
            setModal(false);
            void load();
          }}
        />
      )}
    </>
  );
}

function ProductModal({
  locations,
  categories,
  onClose,
  onSaved,
}: {
  locations: Location[];
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/products", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          sku: form.get("sku"),
          category: form.get("category"),
          unit: form.get("unit"),
          reorderLevel: Number(form.get("reorderLevel")),
          initialStock: Number(form.get("initialStock")),
          locationId: Number(form.get("locationId")),
        }),
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Add a product"
      description="Create a tracked SKU and its opening stock."
      onClose={onClose}
    >
      <form className="form" onSubmit={submit}>
        {error && <InlineError message={error} onClose={() => setError("")} />}
        <label className="full-field">
          Product name
          <input
            name="name"
            required
            minLength={2}
            placeholder="e.g. Steel Rods"
          />
        </label>
        <label>
          SKU / code
          <input
            name="sku"
            required
            pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
            placeholder="STL-ROD-12"
          />
        </label>
        <label>
          Category
          <input
            name="category"
            required
            list="category-list"
            placeholder="Raw Materials"
          />
          <datalist id="category-list">
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </datalist>
        </label>
        <label>
          Unit of measure
          <input name="unit" required placeholder="units, kg, boxes" />
        </label>
        <label>
          Reorder level
          <input
            name="reorderLevel"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            required
          />
        </label>
        <label>
          Opening stock
          <input
            name="initialStock"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            required
          />
        </label>
        <label>
          Stock location
          <select name="locationId" required defaultValue="">
            <option value="" disabled>
              Select location
            </option>
            {locations.map((location) => (
              <option value={location.id} key={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions full-field">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Creating..." : "Create product"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function OperationsPage() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [createModal, setCreateModal] = useState(false);
  const [selectedOperation, setSelectedOperation] = useState<number | null>(
    null,
  );
  const [filters, setFilters] = useState({ query: "", type: "", status: "" });
  const [error, setError] = useState("");

  const loadOperations = useCallback(async () => {
    try {
      const query = new URLSearchParams();
      if (filters.query.trim()) query.set("q", filters.query.trim());
      if (filters.type) query.set("type", filters.type);
      if (filters.status) query.set("status", filters.status);
      const ops = await api<Operation[]>(`/api/operations?${query}`);
      setOperations(ops);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [filters]);

  useEffect(() => {
    void loadOperations();
  }, [loadOperations]);

  useEffect(() => {
    Promise.all([
      api<Product[]>("/api/products"),
      api<{ locations: Location[] }>("/api/meta"),
    ])
      .then(([items, meta]) => {
        setProducts(items);
        setLocations(meta.locations);
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  const validate = async (id: number) => {
    try {
      await api(`/api/operations/${id}/validate`, { method: "POST" });
      await loadOperations();
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  };

  const changeStatus = async (id: number, status: OperationStatus) => {
    try {
      await api(`/api/operations/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadOperations();
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  };

  const advance = async (operation: Operation) => {
    const next = nextOperationStatus(operation);
    if (next) await changeStatus(operation.id, next);
  };

  return (
    <>
      <PageHeader
        eyebrow="Stock movement"
        title="Operations"
        description="Receive, deliver, transfer, or reconcile inventory."
      >
        <button className="button primary" onClick={() => setCreateModal(true)}>
          <Plus size={17} /> New operation
        </button>
      </PageHeader>
      {error && <InlineError message={error} onClose={() => setError("")} />}
      <div className="panel">
        <div className="toolbar operations-toolbar">
          <div className="table-search operation-search">
            <Search size={17} />
            <input
              value={filters.query}
              onChange={(event) =>
                setFilters({ ...filters, query: event.target.value })
              }
              placeholder="Search reference, partner, product, or SKU"
              aria-label="Search operations"
            />
          </div>
          <div className="operation-filter-group">
            <FilterSelect
              label="All types"
              value={filters.type}
              options={operationTypes()}
              onChange={(type) => setFilters({ ...filters, type })}
            />
            <FilterSelect
              label="All statuses"
              value={filters.status}
              options={["draft", "waiting", "ready", "done", "canceled"]}
              onChange={(status) => setFilters({ ...filters, status })}
            />
            <span className="muted operation-count">
              {operations.length} operation{operations.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <OperationTable
          operations={operations}
          onValidate={validate}
          onAdvance={advance}
          onOpen={setSelectedOperation}
        />
      </div>
      {createModal && (
        <OperationModal
          products={products}
          locations={locations}
          onClose={() => setCreateModal(false)}
          onSaved={() => {
            setCreateModal(false);
            void loadOperations();
          }}
        />
      )}
      {selectedOperation && (
        <OperationDetailModal
          operationId={selectedOperation}
          onClose={() => setSelectedOperation(null)}
          onAdvance={advance}
          onValidate={validate}
          onCancel={(id) => changeStatus(id, "canceled")}
        />
      )}
    </>
  );
}

function OperationModal({
  products,
  locations,
  onClose,
  onSaved,
}: {
  products: Product[];
  locations: Location[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<OperationType>("receipt");
  const [lines, setLines] = useState([
    { id: 1, productId: "", quantity: "", countedQuantity: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const needsSource = type !== "receipt";
  const needsDestination = type === "receipt" || type === "transfer";

  const updateLine = (
    id: number,
    field: "productId" | "quantity" | "countedQuantity",
    value: string,
  ) => {
    setLines((current) =>
      current.map((line) =>
        line.id === id ? { ...line, [field]: value } : line,
      ),
    );
  };

  const addLine = () => {
    setLines((current) => [
      ...current,
      {
        id: Math.max(...current.map((line) => line.id)) + 1,
        productId: "",
        quantity: "",
        countedQuantity: "",
      },
    ]);
  };

  const removeLine = (id: number) => {
    setLines((current) => current.filter((line) => line.id !== id));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const productIds = lines.map((line) => Number(line.productId));
      if (new Set(productIds).size !== productIds.length) {
        throw new Error("Add each product only once per operation.");
      }
      await api("/api/operations", {
        method: "POST",
        body: JSON.stringify({
          type,
          partner: form.get("partner") || null,
          sourceLocationId: needsSource
            ? Number(form.get("sourceLocationId"))
            : null,
          destinationLocationId: needsDestination
            ? Number(form.get("destinationLocationId"))
            : null,
          scheduledAt: new Date(String(form.get("scheduledAt"))).toISOString(),
          notes: form.get("notes") || null,
          lines: lines.map((line) => ({
            productId: Number(line.productId),
            quantity: type === "adjustment" ? 0 : Number(line.quantity),
            countedQuantity:
              type === "adjustment" ? Number(line.countedQuantity) : null,
          })),
        }),
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  const tomorrow = useMemo(() => {
    const date = new Date(Date.now() + 86_400_000);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }, []);
  return (
    <Modal
      title="Create an operation"
      description="Move several products together in one traceable stock operation."
      onClose={onClose}
      wide
    >
      <form className="form" onSubmit={submit}>
        {error && <InlineError message={error} onClose={() => setError("")} />}
        <label>
          Operation type
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value as OperationType);
              setError("");
            }}
          >
            {operationTypes().map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Scheduled for
          <input
            name="scheduledAt"
            type="datetime-local"
            required
            defaultValue={tomorrow}
          />
        </label>
        <label>
          Partner / reference
          <input
            name="partner"
            placeholder={
              type === "receipt"
                ? "Supplier name"
                : type === "delivery"
                  ? "Customer name"
                  : "Optional"
            }
          />
        </label>
        {needsSource && (
          <label>
            Source location
            <select name="sourceLocationId" required defaultValue="">
              <option value="" disabled>
                Select source
              </option>
              {locations.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {needsDestination && (
          <label>
            Destination location
            <select name="destinationLocationId" required defaultValue="">
              <option value="" disabled>
                Select destination
              </option>
              {locations.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="operation-lines full-field">
          <div className="operation-lines-heading">
            <div>
              <strong>Product lines</strong>
              <span>
                {lines.length} {lines.length === 1 ? "item" : "items"} in this
                operation
              </span>
            </div>
            <button
              type="button"
              className="button secondary compact"
              onClick={addLine}
              disabled={lines.length >= products.length}
            >
              <Plus size={15} /> Add line
            </button>
          </div>
          <div className="operation-line-list">
            {lines.map((line, index) => {
              const product = products.find(
                (item) => String(item.id) === line.productId,
              );
              return (
                <div className="operation-line" key={line.id}>
                  <span className="line-number">{index + 1}</span>
                  <label>
                    Product
                    <select
                      aria-label={`Product for line ${index + 1}`}
                      required
                      value={line.productId}
                      onChange={(event) =>
                        updateLine(line.id, "productId", event.target.value)
                      }
                    >
                      <option value="" disabled>
                        Select product
                      </option>
                      {products.map((item) => (
                        <option
                          value={item.id}
                          key={item.id}
                          disabled={lines.some(
                            (other) =>
                              other.id !== line.id &&
                              other.productId === String(item.id),
                          )}
                        >
                          {item.name} · {item.quantity} {item.unit}
                        </option>
                      ))}
                    </select>
                    {product && (
                      <small>
                        {product.sku} · {product.quantity} {product.unit} on
                        hand
                      </small>
                    )}
                  </label>
                  <label>
                    {type === "adjustment" ? "Physical count" : "Quantity"}
                    <input
                      aria-label={`${
                        type === "adjustment" ? "Physical count" : "Quantity"
                      } for line ${index + 1}`}
                      type="number"
                      min={type === "adjustment" ? "0" : "0.01"}
                      step="0.01"
                      required
                      value={
                        type === "adjustment"
                          ? line.countedQuantity
                          : line.quantity
                      }
                      onChange={(event) =>
                        updateLine(
                          line.id,
                          type === "adjustment"
                            ? "countedQuantity"
                            : "quantity",
                          event.target.value,
                        )
                      }
                      placeholder="0.00"
                    />
                    {product && <small>Measured in {product.unit}</small>}
                  </label>
                  <button
                    type="button"
                    className="remove-line"
                    onClick={() => removeLine(line.id)}
                    disabled={lines.length === 1}
                    aria-label={`Remove line ${index + 1}`}
                    title={
                      lines.length === 1
                        ? "An operation needs at least one line"
                        : "Remove product line"
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <label className="full-field">
          Notes
          <textarea
            name="notes"
            rows={3}
            placeholder="Add handling instructions or context"
          />
        </label>
        <div className="form-actions full-field">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Creating..." : "Create draft"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function OperationDetailModal({
  operationId,
  onClose,
  onAdvance,
  onValidate,
  onCancel,
}: {
  operationId: number;
  onClose: () => void;
  onAdvance: (operation: Operation) => Promise<void>;
  onValidate: (id: number) => Promise<void>;
  onCancel: (id: number) => Promise<void>;
}) {
  const [operation, setOperation] = useState<OperationDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setOperation(
        await api<OperationDetail>(`/api/operations/${operationId}`),
      );
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [operationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const execute = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={operation?.reference || "Operation details"}
      description={
        operation
          ? `${operationLabel[operation.type]} · ${operation.lineCount} product ${
              operation.lineCount === 1 ? "line" : "lines"
            }`
          : "Loading the complete inventory movement."
      }
      onClose={onClose}
      wide
    >
      {!operation ? (
        <div className="detail-loading">
          {error ? (
            <InlineError message={error} onClose={() => setError("")} />
          ) : (
            <>
              <span className="spinner" />
              <span>Loading operation...</span>
            </>
          )}
        </div>
      ) : (
        <div className="operation-detail">
          {error && (
            <InlineError message={error} onClose={() => setError("")} />
          )}
          <div className="detail-summary">
            <div>
              <span>Status</span>
              <StatusBadge status={operation.status} />
            </div>
            <div>
              <span>Scheduled</span>
              <strong>{formatDate(operation.scheduledAt)}</strong>
            </div>
            <div>
              <span>Partner</span>
              <strong>
                {operation.partner || operationContext(operation.type)}
              </strong>
            </div>
            <div>
              <span>Route</span>
              <strong>{routeLabel(operation)}</strong>
            </div>
          </div>

          <div className="detail-lines">
            <div className="detail-section-heading">
              <div>
                <span className="eyebrow">Inventory lines</span>
                <h3>Products in this operation</h3>
              </div>
              <span className="count-badge">{operation.lines.length}</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th className="numeric-cell">
                      {operation.type === "adjustment"
                        ? "Physical count"
                        : "Quantity"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {operation.lines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        <strong>{line.product}</strong>
                        <small>{line.unit}</small>
                      </td>
                      <td>{line.sku}</td>
                      <td className="numeric-cell">
                        <strong>
                          {formatNumber(
                            operation.type === "adjustment"
                              ? (line.countedQuantity ?? 0)
                              : line.quantity,
                          )}
                        </strong>
                        <small>{line.unit}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {operation.notes && (
            <div className="detail-notes">
              <span>Notes</span>
              <p>{operation.notes}</p>
            </div>
          )}

          <div className="detail-actions">
            {operation.status !== "done" && operation.status !== "canceled" && (
              <button
                type="button"
                className="button danger-button"
                disabled={busy}
                onClick={() => void execute(() => onCancel(operation.id))}
              >
                <Ban size={16} /> Cancel operation
              </button>
            )}
            <div className="detail-actions-primary">
              <button
                type="button"
                className="button secondary"
                onClick={onClose}
              >
                Close
              </button>
              {operation.status === "ready" && (
                <button
                  type="button"
                  className="button primary"
                  disabled={busy}
                  onClick={() => void execute(() => onValidate(operation.id))}
                >
                  <ShieldCheck size={16} /> Validate movement
                </button>
              )}
              {(operation.status === "draft" ||
                operation.status === "waiting") && (
                <button
                  type="button"
                  className="button primary"
                  disabled={busy}
                  onClick={() => void execute(() => onAdvance(operation))}
                >
                  <ArrowRight size={16} /> {workflowActionLabel(operation)}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function nextOperationStatus(operation: Operation): OperationStatus | null {
  if (operation.status === "draft") {
    return operation.type === "delivery" || operation.type === "transfer"
      ? "waiting"
      : "ready";
  }
  if (operation.status === "waiting") return "ready";
  if (operation.status === "ready") return "done";
  return null;
}

function workflowActionLabel(operation: Operation) {
  const next = nextOperationStatus(operation);
  if (next === "waiting") return "Start availability check";
  if (next === "ready") return "Mark as ready";
  return "Validate movement";
}

interface LedgerRow {
  id: number;
  createdAt: string;
  reference: string;
  type: OperationType;
  product: string;
  sku: string;
  unit: string;
  location: string;
  changeQuantity: number;
  balanceAfter: number;
}
function LedgerPage() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<LedgerRow[]>("/api/ledger")
      .then(setRows)
      .catch((err) => setError(err.message));
  }, []);
  return (
    <>
      <PageHeader
        eyebrow="Audit trail"
        title="Move history"
        description="Every validated stock change, traced to its operation."
      />
      {error && <InlineError message={error} onClose={() => setError("")} />}
      <div className="panel table-scroll">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Reference</th>
              <th>Product</th>
              <th>Location</th>
              <th>Change</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.createdAt)}</td>
                  <td>
                    <span className={`operation-icon ${row.type}`}>
                      <OperationIcon type={row.type} />
                    </span>
                    <b>{row.reference}</b>
                  </td>
                  <td>
                    <strong>{row.product}</strong>
                    <small>{row.sku}</small>
                  </td>
                  <td>{row.location}</td>
                  <td>
                    <b
                      className={
                        row.changeQuantity >= 0 ? "positive" : "danger"
                      }
                    >
                      {row.changeQuantity >= 0 ? "+" : ""}
                      {row.changeQuantity} {row.unit}
                    </b>
                  </td>
                  <td>
                    {row.balanceAfter} {row.unit}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    title="No ledger entries yet"
                    description="Validate an inventory operation to create the first stock movement."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PlaceholderPage() {
  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Warehouses, locations, users, and notification rules."
      />
      <div className="panel placeholder">
        <ShieldCheck size={34} />
        <h2>Workspace settings are planned</h2>
        <p>
          The core inventory engine is ready. Role management, OTP recovery, and
          warehouse setup come next.
        </p>
      </div>
    </>
  );
}

function OperationTable({
  operations,
  onValidate,
  onAdvance,
  onOpen,
}: {
  operations: Operation[];
  onValidate?: (id: number) => void | Promise<void>;
  onAdvance?: (operation: Operation) => void | Promise<void>;
  onOpen?: (id: number) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Type</th>
            <th>Route / partner</th>
            <th>Scheduled</th>
            <th>Status</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {operations.length ? (
            operations.map((operation) => (
              <tr key={operation.id}>
                <td>
                  <div className="reference-cell">
                    <span className={`operation-icon ${operation.type}`}>
                      <OperationIcon type={operation.type} />
                    </span>
                    <div>
                      <strong>{operation.reference}</strong>
                      <small>
                        {operation.lineCount} product line
                        {operation.lineCount === 1 ? "" : "s"}
                      </small>
                    </div>
                  </div>
                </td>
                <td>{operationLabel[operation.type]}</td>
                <td>
                  <strong>
                    {operation.partner || operationContext(operation.type)}
                  </strong>
                  <small>{routeLabel(operation)}</small>
                </td>
                <td>{formatDate(operation.scheduledAt)}</td>
                <td>
                  <StatusBadge status={operation.status} />
                </td>
                <td>
                  <div className="row-actions">
                    {onOpen && (
                      <button
                        className="row-action ghost"
                        onClick={() => onOpen(operation.id)}
                      >
                        <Eye size={14} /> View
                      </button>
                    )}
                    {operation.status === "ready" && onValidate && (
                      <button
                        className="row-action"
                        onClick={() => void onValidate(operation.id)}
                      >
                        <ShieldCheck size={14} /> Validate
                      </button>
                    )}
                    {(operation.status === "draft" ||
                      operation.status === "waiting") &&
                      onAdvance && (
                        <button
                          className="row-action"
                          onClick={() => void onAdvance(operation)}
                        >
                          <ArrowRight size={14} />
                          {operation.status === "waiting" ? "Ready" : "Next"}
                        </button>
                      )}
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6}>
                <EmptyState
                  title="No matching operations"
                  description="Change the filters or create a new inventory operation."
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="header-actions">{children}</div>}
    </div>
  );
}
function Modal({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-layer">
      <button
        className="modal-backdrop"
        onClick={onClose}
        aria-label="Close modal"
      />
      <section
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-head">
          <div>
            <h2 id="modal-title">{title}</h2>
            <p>{description}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: (string | { value: string; label: string })[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{label}</option>
      {options.map((option) => {
        const value = typeof option === "string" ? option : option.value;
        const text =
          typeof option === "string" ? titleCase(option) : option.label;
        return (
          <option key={value} value={value}>
            {text}
          </option>
        );
      })}
    </select>
  );
}
function StatusBadge({ status }: { status: OperationStatus }) {
  return (
    <span className={`status ${status}`}>
      <i />
      {titleCase(status)}
    </span>
  );
}
function StockBadge({ status }: { status: Product["stockStatus"] }) {
  return (
    <span className={`stock-badge ${status}`}>
      {status === "out"
        ? "Out of stock"
        : status === "low"
          ? "Low stock"
          : "In stock"}
    </span>
  );
}
function InlineError({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="inline-error">
      <AlertTriangle size={17} />
      <span>{message}</span>
      <button onClick={onClose}>
        <X size={15} />
      </button>
    </div>
  );
}
function LoadingState({ error }: { error?: string }) {
  return (
    <div className="loading-state">
      {error ? (
        <>
          <AlertTriangle size={28} />
          <h2>Could not load inventory</h2>
          <p>{error}</p>
        </>
      ) : (
        <>
          <span className="spinner" />
          <p>Reading live inventory...</p>
        </>
      )}
    </div>
  );
}
function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <Boxes size={27} />
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}
function OperationIcon({ type }: { type: OperationType }) {
  const Icon =
    type === "receipt"
      ? ArrowDownToLine
      : type === "delivery"
        ? ArrowUpFromLine
        : type === "transfer"
          ? ArrowLeftRight
          : ClipboardCheck;
  return <Icon size={16} />;
}
function operationTypes() {
  return (
    ["receipt", "delivery", "transfer", "adjustment"] as OperationType[]
  ).map((value) => ({ value, label: operationLabel[value] }));
}
function routeLabel(operation: Operation) {
  return operation.sourceLocation && operation.destinationLocation
    ? `${operation.sourceLocation} → ${operation.destinationLocation}`
    : operation.sourceLocation ||
        operation.destinationLocation ||
        "Stock operation";
}
function operationContext(type: OperationType) {
  return {
    receipt: "Inbound stock",
    delivery: "Outbound stock",
    transfer: "Internal movement",
    adjustment: "Physical count",
  }[type];
}
function formatDate(value: string) {
  const date = new Date(
    value.includes("T") ? value : value.replace(" ", "T") + "Z",
  );
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(
    value || 0,
  );
}
function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function initials(value: string) {
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export default App;
