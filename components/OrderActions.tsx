"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteOrder, deletePayment } from "@/app/actions/orders";
import { formatDateTime } from "@/lib/dates";
import { METHOD_LABEL, formatINR, formatOrderNumber, type PaymentMethodValue } from "@/lib/money";
import { PaymentSheet, type PayableOrder } from "./PaymentSheet";
import { Sheet } from "./Sheet";
import { ErrorText, btn } from "./ui";

/**
 * Confirmation for destructive actions. `consequences` lists what will happen, one line each;
 * `highlight` calls out the part that matters most (e.g. money that will be removed).
 * Cancel has focus when it opens, so a stray Enter never deletes anything.
 */
export function ConfirmSheet({
  open,
  title,
  message,
  consequences,
  highlight,
  note,
  irreversible = true,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  consequences?: React.ReactNode[];
  highlight?: React.ReactNode;
  note?: React.ReactNode;
  irreversible?: boolean;
  confirmLabel: string;
  pending: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={pending ? () => {} : onClose}
      title={title}
      icon={
        <span className="grid h-14 w-14 place-items-center rounded-full bg-red-50 text-red-600 ring-8 ring-red-50/60">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden>
            <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
          </svg>
        </span>
      }
    >
      <div className="space-y-4">
        {message ? <div className="text-center text-espresso-600">{message}</div> : null}

        {highlight ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-center font-semibold text-red-800 ring-1 ring-red-200">
            {highlight}
          </div>
        ) : null}

        {consequences?.length ? (
          <ul className="space-y-2 rounded-2xl bg-white px-4 py-3 text-sm text-espresso-700 ring-1 ring-cream-200">
            {consequences.map((c, i) => (
              <li key={i} className="flex gap-2.5">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden>
                  <path d="M6 6l8 8M14 6l-8 8" />
                </svg>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {note ? <p className="text-center text-sm text-espresso-500">{note}</p> : null}
        <ErrorText>{error}</ErrorText>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} disabled={pending} autoFocus className={btn.secondary}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={pending} className={btn.dangerSolid}>
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
        {irreversible ? <p className="text-center text-xs font-semibold tracking-wide text-espresso-400 uppercase">This can’t be undone</p> : null}
      </div>
    </Sheet>
  );
}

export function OrderActions({ order, canDelete }: { order: PayableOrder; canDelete: boolean }) {
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function remove() {
    setError("");
    startTransition(async () => {
      const res = await deleteOrder(order.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.replace("/history");
    });
  }

  return (
    <div className="space-y-2">
      {message ? (
        <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          {message}
        </p>
      ) : null}
      {order.balanceDue > 0 ? (
        <button type="button" onClick={() => setPaying(true)} className={`${btn.success} w-full`}>
          Record payment · {formatINR(order.balanceDue)} due
        </button>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => window.print()} className={btn.secondary}>
          Print bill
        </button>
        <Link href={`/orders/${order.id}/edit`} className={btn.secondary}>
          Edit
        </Link>
      </div>
      {canDelete ? (
        <button type="button" onClick={() => setConfirmDelete(true)} className={`${btn.danger} w-full`}>
          Delete order
        </button>
      ) : null}

      {paying ? <PaymentSheet key={order.id} order={order} onClose={() => setPaying(false)} onRecorded={setMessage} /> : null}

      <ConfirmSheet
        open={confirmDelete}
        title={`Delete ${formatOrderNumber(order.orderNumber)}?`}
        message={
          <>
            {order.customerName ? <span className="font-semibold text-espresso-800">{order.customerName}</span> : "Walk-in"} · bill of{" "}
            <span className="tabular font-semibold text-espresso-800">{formatINR(order.total)}</span>
          </>
        }
        highlight={order.amountPaid > 0 ? <>{formatINR(order.amountPaid)} of recorded payments will be removed</> : undefined}
        consequences={[
          "The order and all its items are deleted",
          order.amountPaid > 0 ? "Its payments are removed from collections" : "No payments were recorded on it",
          "History, dues and analytics will no longer include it",
        ]}
        note="Only a mistake? Edit the order instead."
        confirmLabel="Delete order"
        pending={pending}
        error={error}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

export interface PaymentRow {
  id: string;
  amount: number;
  method: PaymentMethodValue;
  paidAt: Date;
}

export function PaymentHistory({ payments, allowDelete = false }: { payments: PaymentRow[]; allowDelete?: boolean }) {
  const [target, setTarget] = useState<PaymentRow | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (payments.length === 0) return <p className="text-sm text-espresso-500">No payments recorded yet.</p>;

  function remove() {
    if (!target) return;
    setError("");
    startTransition(async () => {
      const res = await deletePayment(target.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTarget(null);
    });
  }

  return (
    <>
      <ul className="divide-y divide-cream-200">
        {payments.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="tabular font-semibold text-emerald-700">{formatINR(p.amount)}</p>
              <p className="text-xs text-espresso-500">
                {METHOD_LABEL[p.method]} · {formatDateTime(p.paidAt)}
              </p>
            </div>
            {allowDelete ? (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setTarget(p);
                }}
                className="min-h-10 rounded-lg px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                aria-label={`Remove payment of ${formatINR(p.amount)}`}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <ConfirmSheet
        open={target !== null}
        title="Remove this payment?"
        message={
          target ? (
            <>
              {METHOD_LABEL[target.method]} payment · {formatDateTime(target.paidAt)}
            </>
          ) : null
        }
        highlight={target ? <>{formatINR(target.amount)} will be removed</> : undefined}
        consequences={
          target
            ? [`The order’s balance due goes up by ${formatINR(target.amount)}`, "Its status may change to Partial or Unpaid", "Collections and analytics are updated"]
            : undefined
        }
        confirmLabel="Remove payment"
        pending={pending}
        error={error}
        onConfirm={remove}
        onClose={() => setTarget(null)}
      />
    </>
  );
}
