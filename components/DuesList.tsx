"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatAge, formatDateTime } from "@/lib/dates";
import { formatINR, formatOrderNumber, normalizePhone, type OrderStatusValue } from "@/lib/money";
import { PaymentHistory, type PaymentRow } from "./OrderActions";
import { PaymentSheet, type PayableOrder } from "./PaymentSheet";
import { CollectSheet, type CustomerDue } from "./CollectSheet";
import { OverdueBadge, StatusBadge, btn, inputClass } from "./ui";

export interface DueOrder extends PayableOrder {
  customerPhone: string | null;
  tableNumber: string | null;
  createdAt: Date;
  ageHours: number;
  status: OrderStatusValue;
  itemsSummary: string;
  payments: PaymentRow[];
}

function ageLabel(hours: number): string {
  if (hours < 24) return "Today";
  return `${Math.floor(hours / 24)}d`;
}

export function DuesList({ orders, initialQuery = "" }: { orders: DueOrder[]; initialQuery?: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [paying, setPaying] = useState<DueOrder | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState(initialQuery);
  const [collecting, setCollecting] = useState<CustomerDue | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    const digits = normalizePhone(q).replace(/\D/g, "");
    return orders.filter(
      (o) =>
        (digits.length >= 3 && (o.customerPhone ?? "").replace(/\D/g, "").includes(digits)) ||
        (o.customerName ?? "").toLowerCase().includes(q) ||
        formatOrderNumber(o.orderNumber).includes(q.replace(/^#?/, "#")),
    );
  }, [orders, query]);

  const filteredDue = filtered.reduce((s, o) => s + o.balanceDue, 0);

  // Customers (identified by phone) with more than one open bill: one payment can clear several.
  const customers = useMemo(() => {
    const byPhone = new Map<string, CustomerDue>();
    for (const o of filtered) {
      const key = normalizePhone(o.customerPhone ?? "").replace(/\D/g, "").slice(-10);
      if (key.length < 10) continue;
      const entry = byPhone.get(key) ?? { phone: o.customerPhone!, name: o.customerName || "Walk-in customer", totalDue: 0, orders: [] };
      entry.totalDue += o.balanceDue;
      entry.orders.push({ id: o.id, orderNumber: o.orderNumber, balanceDue: o.balanceDue });
      if (!entry.name && o.customerName) entry.name = o.customerName;
      byPhone.set(key, entry);
    }
    // Oldest bill first, same order the server settles them in.
    return [...byPhone.values()].filter((c) => c.orders.length > 1).sort((a, b) => b.totalDue - a.totalDue);
  }, [filtered]);

  return (
    <>
      <div className="relative mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-espresso-400" aria-hidden>
          <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
        </svg>
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by phone, name or order #"
          aria-label="Filter dues by phone, name or order number"
          className={`${inputClass} pl-11`}
        />
      </div>
      {query.trim() ? (
        <p className="mb-3 text-sm text-espresso-600">
          {filtered.length} match{filtered.length === 1 ? "" : "es"} · <span className="font-bold text-red-700">{formatINR(filteredDue)}</span> due
        </p>
      ) : null}

      {message ? (
        <p role="status" className="mb-3 rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
          {message}
        </p>
      ) : null}

      {customers.length > 0 ? (
        <section className="mb-4 rounded-3xl bg-white p-3 shadow-card ring-1 ring-cream-200">
          <p className="mb-2 px-1 text-[11px] font-bold tracking-widest text-espresso-500 uppercase">Collect in one go</p>
          <ul className="space-y-2">
            {customers.map((c) => (
              <li key={c.phone} className="flex flex-wrap items-center gap-3 rounded-2xl bg-cream-50 p-3 ring-1 ring-cream-200">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-espresso-900">{c.name}</p>
                  <p className="text-sm text-espresso-500">
                    <span className="font-mono">{c.phone}</span> · {c.orders.length} bills ·{" "}
                    <span className="font-bold text-red-700">{formatINR(c.totalDue)}</span> due
                  </p>
                </div>
                <button type="button" onClick={() => setCollecting(c)} className={`${btn.success} px-5`}>
                  Collect
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-3xl bg-white/70 px-6 py-10 text-center text-espresso-500 ring-1 ring-cream-200">No dues match “{query}”.</p>
      ) : null}

      <ul className="space-y-3">
        {filtered.map((o) => {
          const overdue = o.ageHours > 24;
          const open = expanded === o.id;
          return (
            <li key={o.id} data-due-card className="flex overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-cream-200">
              {/* Age rail */}
              <div
                className={`flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 text-center ${
                  overdue ? "bg-red-600 text-white" : "bg-amber-300 text-espresso-900"
                }`}
                aria-hidden
              >
                <span className="font-display text-xl leading-none font-bold">{ageLabel(o.ageHours)}</span>
                <span className="text-[10px] font-bold tracking-wider uppercase opacity-80">{overdue ? "waiting" : "open"}</span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display truncate text-xl font-semibold text-espresso-900">{o.customerName || "Walk-in customer"}</p>
                      <p className="text-sm text-espresso-500">
                        <span className="font-mono">{formatOrderNumber(o.orderNumber)}</span>
                        {o.tableNumber ? ` · Table ${o.tableNumber}` : ""}
                        {o.customerPhone ? (
                          <>
                            {" · "}
                            <a href={`tel:${o.customerPhone}`} className="font-mono underline decoration-dotted">
                              {o.customerPhone}
                            </a>
                          </>
                        ) : null}
                      </p>
                      <p className="text-xs text-espresso-400">
                        {formatDateTime(o.createdAt)} · {formatAge(o.ageHours)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {overdue ? <OverdueBadge /> : null}
                      <StatusBadge status={o.status} />
                    </div>
                  </div>

                  <dl className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-cream-50 p-3 text-sm ring-1 ring-cream-200">
                    <div>
                      <dt className="text-xs text-espresso-500">Total</dt>
                      <dd className="font-mono font-semibold">{formatINR(o.total)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-espresso-500">Paid</dt>
                      <dd className="font-mono font-semibold text-emerald-700">{formatINR(o.amountPaid)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-espresso-500">Due</dt>
                      <dd className="font-display text-xl leading-tight font-bold text-red-700">{formatINR(o.balanceDue)}</dd>
                    </div>
                  </dl>

                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setPaying(o)} className={`${btn.success} flex-1`}>
                      Record payment
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : o.id)}
                      aria-expanded={open}
                      aria-controls={`due-${o.id}`}
                      className={`${btn.secondary} px-4`}
                    >
                      {open ? "Hide" : "Details"}
                    </button>
                  </div>
                </div>

                {open ? (
                  <div id={`due-${o.id}`} className="space-y-3 border-t border-dashed border-cream-300 bg-cream-50/70 p-4">
                    <div>
                      <p className="text-[11px] font-bold tracking-widest text-espresso-500 uppercase">Items</p>
                      <p className="text-sm text-espresso-800">{o.itemsSummary}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold tracking-widest text-espresso-500 uppercase">Payment history</p>
                      <PaymentHistory payments={o.payments} />
                    </div>
                    <Link href={`/orders/${o.id}`} className="inline-flex min-h-10 items-center text-sm font-bold text-caramel-600 underline">
                      Open full order →
                    </Link>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {paying ? <PaymentSheet key={paying.id} order={paying} onClose={() => setPaying(null)} onRecorded={setMessage} /> : null}
      {collecting ? (
        <CollectSheet key={collecting.phone} customer={collecting} onClose={() => setCollecting(null)} onCollected={setMessage} />
      ) : null}
    </>
  );
}
