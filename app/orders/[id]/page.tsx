import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAdmin, requireUser } from "@/lib/auth";
import { isObjectId } from "@/lib/ids";
import { formatDateTime } from "@/lib/dates";
import { METHOD_LABEL, formatINR, formatOrderNumber } from "@/lib/money";
import { OrderActions, PaymentHistory } from "@/components/OrderActions";
import { SoulmateMark } from "@/components/CategoryIcon";
import { StatusStamp, btn, cardClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  if (!isObjectId(id)) notFound();
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { orderBy: { itemName: "asc" } }, payments: { orderBy: { paidAt: "asc" } } },
  });
  if (!order) notFound();

  const justCreated = sp.new === "1";
  const methodsUsed = Array.from(new Set(order.payments.map((p) => METHOD_LABEL[p.method])));

  return (
    <div className="mx-auto max-w-4xl">
      {justCreated ? (
        <div className="roast-surface mb-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4 text-cream-50 shadow-lift print:hidden">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-600 text-white">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" className="h-6 w-6" aria-hidden>
                <path d="m5 10 3.5 3.5L15 7" />
              </svg>
            </span>
            <div>
              <p className="font-display text-xl font-semibold">Order {formatOrderNumber(order.orderNumber)} saved</p>
              <p className="text-sm text-cream-200/80">Hand over the bill, or print it.</p>
            </div>
          </div>
          <Link href="/" className={`${btn.accent} w-full sm:w-auto`}>
            + Start next order
          </Link>
        </div>
      ) : (
        <div className="mb-3 print:hidden">
          <Link href="/history" className="inline-flex min-h-10 items-center text-sm font-bold text-espresso-600 hover:text-espresso-900">
            ← Order history
          </Link>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_280px] md:items-start print:block">
        {/* Printable receipt */}
        <article
          className="receipt mx-auto w-full max-w-md rounded-t-3xl px-6 pt-6 shadow-lift ring-1 ring-cream-200 print:max-w-none print:ring-0"
          aria-label="Bill"
        >
          <header className="text-center">
            <SoulmateMark className="mx-auto h-12 w-12 print:hidden" />
            <p className="font-display mt-2 text-2xl font-semibold italic">Soulmate House</p>
            <p className="text-[10px] font-bold tracking-[0.34em] text-espresso-400 uppercase">Café</p>
            <div className="mt-3 flex justify-between font-mono text-xs text-espresso-500">
              <span>Bill {formatOrderNumber(order.orderNumber)}</span>
              <span>{formatDateTime(order.createdAt)}</span>
            </div>
          </header>

          {order.customerName || order.customerPhone || order.tableNumber ? (
            <>
              <div className="receipt-rule my-3" />
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 font-mono text-xs">
                {order.customerName ? (
                  <>
                    <dt className="text-espresso-400">Customer</dt>
                    <dd className="text-right font-semibold">{order.customerName}</dd>
                  </>
                ) : null}
                {order.customerPhone ? (
                  <>
                    <dt className="text-espresso-400">Phone</dt>
                    <dd className="text-right">{order.customerPhone}</dd>
                  </>
                ) : null}
                {order.tableNumber ? (
                  <>
                    <dt className="text-espresso-400">Table</dt>
                    <dd className="text-right">{order.tableNumber}</dd>
                  </>
                ) : null}
              </dl>
            </>
          ) : null}

          <div className="receipt-rule my-3" />
          <table className="w-full font-mono text-sm">
            <thead>
              <tr className="text-left text-[11px] tracking-wider text-espresso-400 uppercase">
                <th className="pb-1 font-medium">Item</th>
                <th className="pb-1 text-center font-medium">Qty</th>
                <th className="pb-1 text-right font-medium">Amt</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id} className="align-top">
                  <td className="py-1 pr-2">
                    <span className="font-sans font-semibold">{i.itemName}</span>
                    {i.variantName ? <span className="ml-1 text-xs text-espresso-500">({i.variantName})</span> : null}
                    <span className="block text-[11px] text-espresso-400">@ {formatINR(i.unitPrice)}</span>
                  </td>
                  <td className="py-1 text-center">{i.quantity}</td>
                  <td className="py-1 text-right">{formatINR(i.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="receipt-rule my-3" />
          <dl className="space-y-1 font-mono text-sm">
            <div className="flex justify-between">
              <dt className="text-espresso-500">Subtotal</dt>
              <dd>{formatINR(order.subtotal)}</dd>
            </div>
            {order.discountAmount > 0 ? (
              <div className="flex justify-between">
                <dt className="text-espresso-500">Discount{order.discountType === "PERCENT" ? ` ${order.discountValue}%` : ""}</dt>
                <dd>−{formatINR(order.discountAmount)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xs font-bold tracking-[0.2em] text-espresso-500 uppercase">Total</span>
            <span className="font-display text-3xl font-semibold">{formatINR(order.total)}</span>
          </div>
          <dl className="mt-2 space-y-1 font-mono text-sm">
            <div className="flex justify-between">
              <dt className="text-espresso-500">Paid{methodsUsed.length ? ` · ${methodsUsed.join(", ")}` : ""}</dt>
              <dd className="text-emerald-700">{formatINR(order.amountPaid)}</dd>
            </div>
            <div className={`flex justify-between font-bold ${order.balanceDue > 0 ? "text-red-700" : "text-emerald-700"}`}>
              <dt>Balance due</dt>
              <dd>{formatINR(order.balanceDue)}</dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-col items-center gap-3 text-center">
            <StatusStamp status={order.status} balanceDue={order.balanceDue} />
            <p className="font-display text-sm text-espresso-500 italic">Brewed with love. See you again, soulmate.</p>
          </div>
        </article>

        <div className="space-y-4 print:hidden">
          <OrderActions
            order={{
              id: order.id,
              orderNumber: order.orderNumber,
              customerName: order.customerName,
              total: order.total,
              amountPaid: order.amountPaid,
              balanceDue: order.balanceDue,
            }}
            canDelete={isAdmin(user)}
          />
          <section className={`${cardClass} p-4`}>
            <h2 className="font-display mb-2 text-lg font-semibold">Payment history</h2>
            <PaymentHistory
              payments={order.payments.map((p) => ({ id: p.id, amount: p.amount, method: p.method, paidAt: p.paidAt }))}
              allowDelete={isAdmin(user)}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
