// Pure money helpers — safe to import from server, client and the seed script.
// All amounts are integer paise (₹1 = 100 paise).

export type OrderStatusValue = "PAID" | "UNPAID" | "PARTIAL";
export type PaymentMethodValue = "CASH" | "UPI" | "CARD";
export type DiscountTypeValue = "FLAT" | "PERCENT";

export const PAYMENT_METHODS: PaymentMethodValue[] = ["CASH", "UPI", "CARD"];
export const METHOD_LABEL: Record<PaymentMethodValue, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
};
export const STATUS_LABEL: Record<OrderStatusValue, string> = {
  PAID: "Paid",
  UNPAID: "Unpaid",
  PARTIAL: "Partial",
};

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const inrFraction = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹1,250 or ₹1,250.50 — paise shown only when non-zero. */
export function formatINR(paise: number): string {
  return paise % 100 === 0 ? inrWhole.format(paise / 100) : inrFraction.format(paise / 100);
}

/** Compact axis label: ₹950, ₹12.5k, ₹1.2L */
export function formatINRCompact(paise: number): string {
  const r = paise / 100;
  if (r >= 100000) return `₹${trimZero(r / 100000)}L`;
  if (r >= 1000) return `₹${trimZero(r / 1000)}k`;
  return `₹${Math.round(r)}`;
}

function trimZero(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, "");
}

export function formatOrderNumber(n: number): string {
  return `#${String(n).padStart(4, "0")}`;
}

export interface BillLine {
  unitPrice: number;
  quantity: number;
}

export interface BillTotals {
  subtotal: number;
  discountAmount: number;
  total: number;
}

/**
 * discountValue is the raw user input: rupees for FLAT, percent for PERCENT.
 * The applied discount is clamped so the total never goes below zero.
 */
export function computeBill(
  lines: BillLine[],
  discountType: DiscountTypeValue | null,
  discountValue: number | null,
): BillTotals {
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  let discountAmount = 0;
  if (discountType && discountValue && discountValue > 0) {
    discountAmount =
      discountType === "FLAT"
        ? rupeesToPaise(discountValue)
        : Math.round((subtotal * Math.min(discountValue, 100)) / 100);
  }
  discountAmount = Math.max(0, Math.min(discountAmount, subtotal));
  return { subtotal, discountAmount, total: subtotal - discountAmount };
}

export function deriveStatus(total: number, amountPaid: number): OrderStatusValue {
  if (amountPaid >= total) return "PAID";
  if (amountPaid > 0) return "PARTIAL";
  return "UNPAID";
}

/** "Cappuccino · Large" — how an order line is shown on bills, lists and reports. */
export function lineLabel(itemName: string, variantName: string | null | undefined): string {
  return variantName ? `${itemName} · ${variantName}` : itemName;
}

/** Sizes offered by default when a drink is given size options. */
export const DEFAULT_SIZES = ["Medium", "Large"] as const;

/** Keep only digits and a leading "+", so "98765 43210" and "98765-43210" match. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") && digits ? `+${digits}` : digits;
}
