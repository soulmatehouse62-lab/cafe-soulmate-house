import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { formatINR, formatOrderNumber } from "@/lib/money";
import { HISTORY_PAGE_SIZE, buildOrderWhere, historyQueryString, parseHistoryFilters } from "@/lib/orders";
import { HistoryFilters } from "@/components/HistoryFilters";
import { EmptyState, PageHeader, StatusBadge, btn, cardClass } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_EDGE = { PAID: "border-l-emerald-600", PARTIAL: "border-l-amber-400", UNPAID: "border-l-red-600" } as const;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const filters = parseHistoryFilters(await searchParams);
  const where = buildOrderWhere(filters);

  // Customer card when filtering by phone: lifetime totals for that number (ignores other filters).
  const customerSummary = filters.phone
    ? await Promise.all([
        prisma.order.aggregate({
          where: { customerPhone: { contains: filters.phone } },
          _count: true,
          _sum: { total: true, amountPaid: true, balanceDue: true },
          _min: { createdAt: true },
          _max: { createdAt: true },
        }),
        prisma.order.findMany({
          where: { customerPhone: { contains: filters.phone }, customerName: { not: null } },
          orderBy: { createdAt: "desc" },
          select: { customerName: true, customerPhone: true },
          take: 20,
        }),
      ])
    : null;

  const [total, orders] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * HISTORY_PAGE_SIZE,
      take: HISTORY_PAGE_SIZE,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        customerPhone: true,
        tableNumber: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        status: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const exportQs = historyQueryString({ ...filters, page: 1 });
  const paymentsQs = new URLSearchParams({
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(filters.method ? { method: filters.method } : {}),
    ...(filters.phone ? { phone: filters.phone } : {}),
  }).toString();

  return (
    <div>
      <PageHeader
        eyebrow="The ledger"
        title="Order history"
        subtitle={`${total} order${total === 1 ? "" : "s"}${filters.page > 1 ? ` · page ${filters.page} of ${pageCount}` : ""}`}
        actions={
          <>
            <a href={`/api/export/orders${exportQs}`} className={`${btn.secondary} min-h-10 px-3 text-sm`} aria-label="Export orders as CSV">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden><path d="M10 3v10m0 0-4-4m4 4 4-4M4 16h12" /></svg>
              Orders CSV
            </a>
            <a href={`/api/export/payments${paymentsQs ? `?${paymentsQs}` : ""}`} className={`${btn.secondary} min-h-10 px-3 text-sm`} aria-label="Export payments as CSV">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden><path d="M10 3v10m0 0-4-4m4 4 4-4M4 16h12" /></svg>
              Payments CSV
            </a>
          </>
        }
      />

      <HistoryFilters initial={filters} />

      {customerSummary ? <CustomerCard phone={filters.phone} summary={customerSummary} /> : null}

      {orders.length === 0 ? (
        <EmptyState title="No orders found">Try clearing some filters.</EmptyState>
      ) : (
        <>
          {/* Phone: cards */}
          <ul className="space-y-2 md:hidden">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/orders/${o.id}`}
                  className={`${cardClass} block border-l-[6px] p-4 active:bg-cream-100 ${STATUS_EDGE[o.status]}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display truncate text-lg font-semibold">{o.customerName || "Walk-in customer"}</p>
                      <p className="text-xs text-espresso-500">
                        <span className="font-mono">{formatOrderNumber(o.orderNumber)}</span> · {formatDateTime(o.createdAt)}
                        {o.customerPhone ? <span className="font-mono"> · {o.customerPhone}</span> : null}
                      </p>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="mt-2 flex items-end justify-between text-sm">
                    <span className="text-espresso-500">
                      {o._count.items} item{o._count.items === 1 ? "" : "s"}
                      {o.tableNumber ? ` · Table ${o.tableNumber}` : ""}
                    </span>
                    <span className="text-right">
                      <span className="font-display block text-xl font-semibold">{formatINR(o.total)}</span>
                      {o.balanceDue > 0 ? (
                        <span className="tabular block text-xs font-semibold text-red-700">{formatINR(o.balanceDue)} due</span>
                      ) : null}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Tablet/desktop: table */}
          <div className={`${cardClass} hidden overflow-x-auto md:block`}>
            <table className="w-full text-sm">
              <thead className="bg-cream-100 text-left text-[11px] tracking-widest text-espresso-600 uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Paid</th>
                  <th className="px-4 py-3 text-right font-semibold">Due</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-cream-50">
                    <td className="px-4 py-3">
                      <Link href={`/orders/${o.id}`} className="font-mono font-semibold text-espresso-800 underline-offset-2 hover:underline">
                        {formatOrderNumber(o.orderNumber)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-espresso-600">{formatDateTime(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/orders/${o.id}`} className="block">
                        {o.customerName || <span className="text-espresso-400">Walk-in</span>}
                        {o.customerPhone ? <span className="block text-xs text-espresso-500">{o.customerPhone}</span> : null}
                      </Link>
                    </td>
                    <td className="tabular px-4 py-3 text-right font-semibold">{formatINR(o.total)}</td>
                    <td className="tabular px-4 py-3 text-right text-emerald-700">{formatINR(o.amountPaid)}</td>
                    <td className={`tabular px-4 py-3 text-right ${o.balanceDue > 0 ? "font-semibold text-red-700" : "text-espresso-400"}`}>
                      {formatINR(o.balanceDue)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 ? (
            <nav className="mt-4 flex items-center justify-between gap-2" aria-label="Pagination">
              {filters.page > 1 ? (
                <Link href={`/history${historyQueryString(filters, { page: filters.page - 1 })}`} className={btn.secondary}>
                  ← Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-espresso-500">
                Page {filters.page} of {pageCount}
              </span>
              {filters.page < pageCount ? (
                <Link href={`/history${historyQueryString(filters, { page: filters.page + 1 })}`} className={btn.secondary}>
                  Older →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

function CustomerCard({
  phone,
  summary: [agg, named],
}: {
  phone: string;
  summary: [
    {
      _count: number;
      _sum: { total: number | null; amountPaid: number | null; balanceDue: number | null };
      _min: { createdAt: Date | null };
      _max: { createdAt: Date | null };
    },
    { customerName: string | null; customerPhone: string | null }[],
  ];
}) {
  if (agg._count === 0) {
    return (
      <p className="mb-4 rounded-3xl bg-white/80 px-5 py-4 text-sm text-espresso-600 ring-1 ring-cream-200">
        No orders yet for phone <span className="font-mono font-semibold">{phone}</span>.
      </p>
    );
  }
  const names = Array.from(new Set(named.map((n) => n.customerName).filter(Boolean)));
  const phones = Array.from(new Set(named.map((n) => n.customerPhone).filter(Boolean)));
  const due = agg._sum.balanceDue ?? 0;
  return (
    <section className="roast-surface mb-4 rounded-3xl p-4 text-cream-50 shadow-lift md:p-5" aria-label="Customer summary">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display grid h-12 w-12 place-items-center rounded-full bg-caramel-500 text-xl font-bold text-espresso-900">
          {(names[0] ?? "?").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-xl font-semibold">{names.length ? names.slice(0, 2).join(" / ") : "Unnamed customer"}</p>
          <p className="font-mono text-sm text-cream-200/80">
            {phones.length === 1 ? phones[0] : `${phones.length || "several"} numbers matching ${phone}`}
            {agg._min.createdAt ? ` · since ${formatDateTime(agg._min.createdAt).split(",")[0]}` : ""}
          </p>
        </div>
        {due > 0 ? (
          <Link href={`/dues?phone=${encodeURIComponent(phone)}`} className={`${btn.accent} min-h-11 px-4 text-sm`}>
            Collect {formatINR(due)}
          </Link>
        ) : null}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Visits", String(agg._count), ""],
          ["Billed", formatINR(agg._sum.total ?? 0), ""],
          ["Paid", formatINR(agg._sum.amountPaid ?? 0), "text-emerald-300"],
          ["Due", formatINR(due), due > 0 ? "text-amber-300" : ""],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-2xl bg-white/5 p-2.5 ring-1 ring-white/10">
            <dt className="text-[11px] text-cream-200/80">{label}</dt>
            <dd className={`font-display text-lg font-semibold ${tone}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
