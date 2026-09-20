"use client";

import { useState, useTransition } from "react";
import { recordPayment } from "@/app/actions/orders";
import { formatINR, formatOrderNumber, paiseToRupees, rupeesToPaise, type PaymentMethodValue } from "@/lib/money";
import { MethodPicker } from "./MethodPicker";
import { Sheet } from "./Sheet";
import { ErrorText, btn, inputClass, labelClass } from "./ui";

export interface PayableOrder {
  id: string;
  orderNumber: number;
  customerName: string | null;
  total: number;
  amountPaid: number;
  balanceDue: number;
}

/** Render with a `key` of the order id so each opening starts fresh. */
export function PaymentSheet({
  order,
  onClose,
  onRecorded,
}: {
  order: PayableOrder;
  onClose: () => void;
  onRecorded?: (message: string) => void;
}) {
  const [amount, setAmount] = useState(String(paiseToRupees(order.balanceDue)));
  const [method, setMethod] = useState<PaymentMethodValue | null>("CASH");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const amountPaise = rupeesToPaise(Number(amount) || 0);
  const remaining = order.balanceDue - amountPaise;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter an amount greater than zero");
    if (rupeesToPaise(value) > order.balanceDue) return setError(`Amount cannot exceed ${formatINR(order.balanceDue)}`);
    if (!method) return setError("Choose a payment method");
    startTransition(async () => {
      const res = await recordPayment({ orderId: order.id, amount: value, method });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onRecorded?.(
        res.status === "PAID"
          ? `${formatOrderNumber(order.orderNumber)} is now fully paid`
          : `Recorded ${formatINR(rupeesToPaise(value))} on ${formatOrderNumber(order.orderNumber)}`,
      );
      onClose();
    });
  }

  return (
    <Sheet open onClose={onClose} title={`Record payment · ${formatOrderNumber(order.orderNumber)}`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white p-3 text-center text-sm ring-1 ring-cream-200">
          <div>
            <p className="text-espresso-500">Total</p>
            <p className="tabular font-semibold">{formatINR(order.total)}</p>
          </div>
          <div>
            <p className="text-espresso-500">Paid</p>
            <p className="tabular font-semibold text-emerald-700">{formatINR(order.amountPaid)}</p>
          </div>
          <div>
            <p className="text-espresso-500">Due</p>
            <p className="tabular font-bold text-red-700">{formatINR(order.balanceDue)}</p>
          </div>
        </div>
        {order.customerName ? <p className="text-sm text-espresso-600">Customer: {order.customerName}</p> : null}

        <div>
          <label htmlFor="pay-amount" className={labelClass}>
            Amount received (₹)
          </label>
          <input
            id="pay-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} tabular text-lg font-semibold`}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAmount(String(paiseToRupees(order.balanceDue)))}
              className="min-h-10 rounded-full bg-emerald-100 px-4 text-sm font-semibold text-emerald-800"
            >
              Full {formatINR(order.balanceDue)}
            </button>
            {order.balanceDue >= 200 ? (
              <button
                type="button"
                onClick={() => setAmount(String(Math.floor(order.balanceDue / 200)))}
                className="min-h-10 rounded-full bg-cream-200 px-4 text-sm font-semibold text-espresso-700"
              >
                Half
              </button>
            ) : null}
          </div>
          {amountPaise > 0 && remaining > 0 ? (
            <p className="mt-2 text-sm text-amber-800">Partial payment — {formatINR(remaining)} will still be due.</p>
          ) : null}
          {amountPaise > 0 && remaining === 0 ? (
            <p className="mt-2 text-sm font-medium text-emerald-700">This settles the order in full.</p>
          ) : null}
        </div>

        <div>
          <span className={labelClass}>Method</span>
          <MethodPicker value={method} onChange={setMethod} />
        </div>

        <ErrorText>{error}</ErrorText>

        <button type="submit" disabled={pending} className={`${btn.success} w-full text-lg`}>
          {pending ? "Saving…" : `Record ${formatINR(Math.max(0, amountPaise))}`}
        </button>
      </form>
    </Sheet>
  );
}
