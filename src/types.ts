export type OperationType = "receipt" | "delivery" | "transfer" | "adjustment";
export type OperationStatus =
  "draft" | "waiting" | "ready" | "done" | "canceled";

export interface Location {
  id: number;
  name: string;
  code: string;
  warehouse: string;
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  category: string;
  unit: string;
  reorderLevel: number;
  quantity: number;
  stockStatus: "healthy" | "low" | "out";
}

export interface Operation {
  id: number;
  reference: string;
  type: OperationType;
  status: OperationStatus;
  partner?: string;
  sourceLocation?: string;
  destinationLocation?: string;
  scheduledAt: string;
  lineCount: number;
  totalQuantity: number;
}

export interface OperationLine {
  id: number;
  productId: number;
  product: string;
  sku: string;
  unit: string;
  quantity: number;
  countedQuantity?: number | null;
}

export interface OperationDetail extends Operation {
  completedAt?: string | null;
  notes?: string | null;
  lines: OperationLine[];
}

export interface DashboardData {
  kpis: {
    totalProducts: number;
    totalUnits: number;
    lowStock: number;
    outOfStock: number;
    pendingReceipts: number;
    pendingDeliveries: number;
    scheduledTransfers: number;
  };
  operations: Operation[];
  alerts: Product[];
}
