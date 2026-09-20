"use client";

import { useMemo, useState, useTransition } from "react";
import { collectFromCustomer } from "@/app/actions/orders";
import { formatINR, formatOrderNumber, paiseToRupees, rupeesToPaise, type PaymentMethodValue } from "@/lib/money";
import { MethodPicker } from "./MethodPicker";
import { Sheet } from "./Sheet";
import { ErrorText, btn, inputClass, labelClass } from "./ui";

export interface CustomerDue {
  /** Phone as saved on the orders — identifies the customer */
  phone: string;
  name: string;
  totalDue: number;
  orders: { id: string; orderNumber: number; balanceDue: number }[];
}

/** Oldest first, exactly like the server. Shown live so staff see what the amount will settle. */
function allocate(orders: CustomerDue["orders"], amountPaise: number) {
  let remaining = amountPaise;
  return orders.map((o) => {
    const part = Math.max(0, Math.min(remaining, o.balanceDue));
    remaining -= part;
    return { ...o, part, settled: part === o.balanceDue && part > 0 };
  });
}

export function CollectSheet({
  customer,
  onClose,
  onCollected,
}: {
  customer: CustomerDue;
  onClose: () => void;
  onCollected: (message: string) => void;
}) {
  const [amount, setAmount] = useState(String(paiseToRupees(customer.totalDue)));
  const [method, setMethod] = useState<PaymentMethodValue | null>("CASH");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const amountPaise = rupeesToPaise(Number(amount) || 0);
  const tooMuch = amountPaise > customer.totalDue;
  const plan = useMemo(() => allocate(customer.orders, amountPaise), [customer.orders, amountPaise]);
  const covered = plan.filter((p) => p.part > 0);
  const settledCount = plan.filter((p) => p.settled).length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (amountPaise <= 0) {
      setError("Enter an amount greater than zero");
      return;
    }
    if (tooMuch) {
      setError(`That is more than the ${formatINR(customer.totalDue)} owed`);
      return;
    }
    if (!method) {
      setError("Choose how the customer paid");
      return;
    }
    startTransition(async () => {
      const res = await collectFromCustomer({ phone: customer.phone, amount: Number(amount), method });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const settled = res.applied.filter((a) => a.settled).length;
      onCollected(
        `${formatINR(res.total)} collected from ${customer.name} · ${res.applied.length} order${res.applied.length === 1 ? "" : "s"} updated` +
          (settled ? `, ${settled} fully paid` : ""),
      );
      onClose();
    });
  }

  return (
    <Sheet open onClose={pending ? () => {} : onClose} title={`Collect from ${customer.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-center ring-1 ring-red-200">
          <p className="text-xs font-bold tracking-widest text-red-700 uppercase">Owes in total</p>
          <p className="font-display text-3xl font-bold text-red-700">{formatINR(customer.totalDue)}</p>
          <p className="text-sm text-red-800/80">
            across {customer.orders.length} order{customer.orders.length === 1 ? "" : "s"}
          </p>
        </div>

        <div>
          <label htmlFor="collect-amount" className={labelClass}>
            Amount received (₹)
          </label>
          <input
            id="collect-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError("");
            }}
            aria-invalid={tooMuch || undefined}
            className={`${inputClass} font-display text-2xl font-semibold ${tooMuch ? "border-red-400" : ""}`}
            autoFocus
          />
          <button
            type="button"
            onClick={() => setAmount(String(paiseToRupees(customer.totalDue)))}
            className="mt-2 min-h-10 rounded-xl bg-cream-100 px-3 text-sm font-bold text-espresso-700 ring-1 ring-cream-300"
          >
            Full amount · {formatINR(customer.totalDue)}
          </button>
        </div>

        <div>
          <p className={labelClass}>How they paid</p>
          <MethodPicker value={method} onChange={setMethod} />
        </div>

        {/* Live preview of the split, oldest bill first */}
        {amountPaise > 0 && !tooMuch ? (
          <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-cream-200">
            <p className="mb-2 text-[11px] font-bold tracking-widest text-espresso-500 uppercase">
              Settles {settledCount > 0 ? `${settledCount} bill${settledCount === 1 ? "" : "s"} in full` : "part of the oldest bill"}
            </p>
            <ul className="space-y-1.5 text-sm">
              {covered.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-espresso-700">{formatOrderNumber(p.orderNumber)}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular font-semibold text-espresso-900">{formatINR(p.part)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.settled ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                      {p.settled ? "Paid" : `${formatINR(p.balanceDue - p.part)} left`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ErrorText>{error}</ErrorText>

        <button type="submit" disabled={pending} className={`${btn.success} w-full text-lg`}>
          {pending ? "Recording…" : `Record ${formatINR(amountPaise)}`}
        </button>
      </form>
    </Sheet>
  );
}
