"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { METHOD_LABEL, PAYMENT_METHODS, STATUS_LABEL, type OrderStatusValue, type PaymentMethodValue } from "@/lib/money";
import { inputClass, labelClass } from "./ui";

interface Filters {
  from: string;
  to: string;
  status: OrderStatusValue | "";
  method: PaymentMethodValue | "";
  q: string;
  phone: string;
}

function toQuery(f: Filters): string {
  const sp = new URLSearchParams();
  (Object.keys(f) as (keyof Filters)[]).forEach((k) => {
    if (f[k]) sp.set(k, f[k]);
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function HistoryFilters({ initial }: { initial: Filters }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [filters, setFilters] = useState<Filters>({
    from: initial.from,
    to: initial.to,
    status: initial.status,
    method: initial.method,
    q: initial.q,
    phone: initial.phone,
  });
  const activeCount = [filters.from || filters.to, filters.status, filters.method].filter(Boolean).length;

  // Debounced sync of the filters into the URL (which re-runs the server query).
  // Compared against the current URL rather than "skip first render", so it is
  // robust to remounts and never navigates when nothing changed.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = toQuery(filters);
      const current = new URLSearchParams(window.location.search);
      current.delete("page");
      const currentQs = current.toString() ? `?${current.toString()}` : "";
      if (next === currentQs) return;
      startTransition(() => router.replace(`${pathname}${next}`, { scroll: false }));
    }, 350);
    return () => clearTimeout(t);
  }, [filters, pathname, router]);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
        <div className="relative">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-espresso-400" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={filters.q}
            onChange={(e) => update("q", e.target.value)}
            placeholder="Search name or order #"
            aria-label="Search orders"
            className={`${inputClass} pl-11`}
          />
          {pending ? (
            <span className="absolute top-1/2 right-4 -translate-y-1/2 text-xs text-espresso-400" aria-live="polite">
              Loading…
            </span>
          ) : null}
        </div>
        <div className="relative">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-espresso-400" aria-hidden>
            <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
          </svg>
          <input
            type="tel"
            inputMode="tel"
            value={filters.phone}
            onChange={(e) => update("phone", e.target.value.replace(/[^\d+\s-]/g, ""))}
            placeholder="Customer phone"
            aria-label="Filter by customer phone"
            className={`${inputClass} pl-11 font-mono`}
          />
        </div>
      </div>

      <details className="rounded-3xl border border-cream-200 bg-white/90 shadow-card" open={activeCount > 0}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold text-espresso-700">
          <span>
            Filters
            {activeCount ? (
              <span className="ml-2 rounded-full bg-espresso-700 px-2 py-0.5 text-xs text-cream-50">{activeCount}</span>
            ) : null}
          </span>
          <span className="text-espresso-400" aria-hidden>
            ▾
          </span>
        </summary>
        <div className="grid grid-cols-2 gap-3 px-4 pb-4 md:grid-cols-4">
          <div>
            <label htmlFor="f-from" className={labelClass}>
              From
            </label>
            <input id="f-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => update("from", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="f-to" className={labelClass}>
              To
            </label>
            <input id="f-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => update("to", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="f-status" className={labelClass}>
              Status
            </label>
            <select id="f-status" value={filters.status} onChange={(e) => update("status", e.target.value as Filters["status"])} className={inputClass}>
              <option value="">All</option>
              {(["PAID", "PARTIAL", "UNPAID"] as const).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-method" className={labelClass}>
              Paid via
            </label>
            <select id="f-method" value={filters.method} onChange={(e) => update("method", e.target.value as Filters["method"])} className={inputClass}>
              <option value="">Any</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
          {activeCount || filters.q || filters.phone ? (
            <button
              type="button"
              onClick={() => setFilters({ from: "", to: "", status: "", method: "", q: "", phone: "" })}
              className="col-span-2 min-h-11 rounded-xl text-sm font-semibold text-red-700 hover:bg-red-50 md:col-span-4"
            >
              Clear all filters
            </button>
          ) : null}
        </div>
      </details>
    </div>
  );
}
