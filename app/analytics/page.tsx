import Link from "next/link";
import { getAnalytics, type ItemStat } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { formatDate, resolvePeriod, type PeriodKey } from "@/lib/dates";
import { METHOD_LABEL, formatINR, type PaymentMethodValue } from "@/lib/money";
import { CategoryChart, DailyRevenueChart } from "@/components/AnalyticsCharts";
import { PageHeader, btn, cardClass, inputClass, labelClass } from "@/components/ui";

export const dynamic = "force-dynamic";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom" },
];

// Categorical slots for payment methods (fixed order, never cycled).
const METHOD_COLOR: Record<PaymentMethodValue, string> = {
  CASH: "#2a78d6",
  UPI: "#eb6834",
  CARD: "#1baf7a",
};

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const period = resolvePeriod(sp.period, sp.from, sp.to);
  const showCustom = sp.period === "custom";
  const data = await getAnalytics(period);
  const s = data.summary;

  const periodTotal = s.paidOnPeriodOrders + s.outstanding;
  const paidShare = periodTotal > 0 ? (s.paidOnPeriodOrders / periodTotal) * 100 : 0;
  const methodTotal = data.methods.reduce((t, m) => t + m.amount, 0);

  return (
    <div>
      <PageHeader eyebrow="How the cafe is doing" title="Analytics" subtitle={period.label} />

      <nav className="mb-4 grid grid-cols-4 gap-1 rounded-full bg-espresso-800 p-1 shadow-card" aria-label="Period">
        {PERIODS.map((p) => {
          const active = showCustom ? p.key === "custom" : period.period === p.key;
          const href =
            p.key === "custom"
              ? `/analytics?period=custom&from=${period.fromKey}&to=${period.toKey}`
              : p.key === "today"
                ? "/analytics"
                : `/analytics?period=${p.key}`;
          return (
            <Link
              key={p.key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`grid min-h-11 place-items-center rounded-full text-center text-sm font-bold ${
                active ? "bg-caramel-500 text-espresso-900 shadow" : "text-cream-200/80 hover:text-cream-50"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </nav>

      {showCustom ? (
        <form method="get" action="/analytics" className="mb-4 grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="period" value="custom" />
          <div>
            <label htmlFor="a-from" className={labelClass}>
              From
            </label>
            <input id="a-from" type="date" name="from" defaultValue={period.fromKey} className={inputClass} required />
          </div>
          <div>
            <label htmlFor="a-to" className={labelClass}>
              To
            </label>
            <input id="a-to" type="date" name="to" defaultValue={period.toKey} className={inputClass} required />
          </div>
          <button type="submit" className={`${btn.primary} col-span-2 sm:col-span-1`}>
            Apply
          </button>
        </form>
      ) : null}

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue collected" value={formatINR(s.collected)} tone="green" hint="Payments received in period" />
        <StatCard label="Outstanding" value={formatINR(s.outstanding)} tone={s.outstanding > 0 ? "red" : "neutral"} hint="Still due on this period’s orders" />
        <StatCard label="Orders" value={String(s.orderCount)} hint={`Billed ${formatINR(s.billed)}`} />
        <StatCard label="Avg order value" value={formatINR(s.averageOrderValue)} hint="Total ÷ orders" />
      </div>

      {s.allTimeOutstanding > 0 ? (
        <Link
          href="/dues"
          className="mb-4 flex min-h-12 items-center justify-between gap-3 rounded-3xl bg-amber-100 px-4 py-3 text-sm ring-1 ring-amber-300"
        >
          <span className="text-amber-900">
            All-time dues: <strong className="tabular">{formatINR(s.allTimeOutstanding)}</strong> across {s.unsettledOrderCount} order
            {s.unsettledOrderCount === 1 ? "" : "s"}
          </span>
          <span className="font-semibold text-amber-900">View dues →</span>
        </Link>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Revenue collected per day" className="lg:col-span-2">
          <DailyRevenueChart data={data.daily} />
        </Panel>

        <Panel title="Collected vs outstanding" subtitle="On orders placed in this period">
          {periodTotal === 0 ? (
            <p className="py-8 text-center text-sm text-espresso-500">No orders in this period.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full bg-cream-100" role="img" aria-label={`${Math.round(paidShare)}% collected`}>
                {s.paidOnPeriodOrders > 0 ? <div className="h-full rounded-l-full bg-emerald-600" style={{ width: `${paidShare}%` }} /> : null}
                {s.outstanding > 0 ? <div className="h-full flex-1 rounded-r-full bg-amber-500" /> : null}
              </div>
              <dl className="space-y-2 text-sm">
                <LegendRow color="bg-emerald-600" label="Collected" value={formatINR(s.paidOnPeriodOrders)} share={paidShare} />
                <LegendRow color="bg-amber-500" label="Outstanding" value={formatINR(s.outstanding)} share={100 - paidShare} />
                <div className="flex justify-between border-t border-cream-200 pt-2 font-semibold">
                  <dt>Billed</dt>
                  <dd className="tabular">{formatINR(periodTotal)}</dd>
                </div>
              </dl>
            </div>
          )}
        </Panel>

        <Panel title="Payment methods" subtitle="Payments received in this period">
          {methodTotal === 0 ? (
            <p className="py-8 text-center text-sm text-espresso-500">No payments in this period.</p>
          ) : (
            <ul className="space-y-3">
              {data.methods.map((m) => {
                const share = (m.amount / methodTotal) * 100;
                return (
                  <li key={m.method}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: METHOD_COLOR[m.method] }} aria-hidden />
                        {METHOD_LABEL[m.method]}
                        <span className="text-xs font-normal text-espresso-500">
                          {m.count} payment{m.count === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="tabular font-semibold">
                        {formatINR(m.amount)} <span className="text-xs font-normal text-espresso-500">{Math.round(share)}%</span>
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-cream-100">
                      <div className="h-full rounded-full" style={{ width: `${share}%`, background: METHOD_COLOR[m.method] }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Sales by category" subtitle="Before order discounts" className="lg:col-span-2">
          <CategoryChart data={data.categories} />
        </Panel>

        <Panel title="Top items by quantity" className="lg:col-span-1">
          <RankedList items={data.topByQuantity} metric="quantity" />
        </Panel>
        <Panel title="Top items by revenue" subtitle="Before order discounts" className="lg:col-span-1">
          <RankedList items={data.topByRevenue} metric="revenue" />
        </Panel>

        <Panel title="Largest outstanding dues" subtitle="All time, by customer" className="lg:col-span-1">
          {data.debtors.length === 0 ? (
            <p className="py-8 text-center text-sm text-espresso-500">Nobody owes anything.</p>
          ) : (
            <ol className="divide-y divide-cream-200">
              {data.debtors.map((d, i) => (
                <li key={`${d.name}-${d.phone ?? ""}`} className="flex items-center gap-3 py-2 text-sm">
                  <span className="tabular w-5 text-espresso-400">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.name}</p>
                    <p className="text-xs text-espresso-500">
                      {d.phone ? `${d.phone} · ` : ""}
                      {d.orders} order{d.orders === 1 ? "" : "s"} · since {formatDate(d.oldest)}
                    </p>
                  </div>
                  <span className="tabular font-bold text-red-700">{formatINR(d.due)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "green" | "red" | "neutral";
}) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-700 text-white ring-emerald-800 [&_.l]:text-emerald-100 [&_.h]:text-emerald-100/80"
      : tone === "red"
        ? "bg-red-600 text-white ring-red-700 [&_.l]:text-red-100 [&_.h]:text-red-100/80"
        : "bg-white ring-cream-200 [&_.v]:text-espresso-900";
  return (
    <div className={`rounded-3xl p-4 shadow-card ring-1 ${toneClass}`}>
      <p className="l text-[11px] font-bold tracking-widest text-espresso-500 uppercase">{label}</p>
      <p className="v font-display mt-1 text-3xl font-semibold break-words">{value}</p>
      {hint ? <p className="h mt-0.5 text-xs text-espresso-500">{hint}</p> : null}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${cardClass} min-w-0 p-4 ${className}`}>
      <h2 className="font-display text-lg font-semibold text-espresso-900">{title}</h2>
      {subtitle ? <p className="mb-3 text-xs text-espresso-500">{subtitle}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

function LegendRow({ color, label, value, share }: { color: string; label: string; value: string; share: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-sm ${color}`} aria-hidden />
        {label}
      </dt>
      <dd className="tabular font-semibold">
        {value} <span className="text-xs font-normal text-espresso-500">{Math.round(share)}%</span>
      </dd>
    </div>
  );
}

function RankedList({ items, metric }: { items: ItemStat[]; metric: "quantity" | "revenue" }) {
  if (items.length === 0) return <p className="py-8 text-center text-sm text-espresso-500">No items sold in this period.</p>;
  const max = Math.max(...items.map((i) => i[metric]), 1);
  return (
    <ol className="space-y-2">
      {items.map((item, idx) => (
        <li key={item.name} className="text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate">
              <span className="tabular mr-2 text-espresso-400">{idx + 1}</span>
              {item.name}
            </span>
            <span className="tabular shrink-0 font-semibold">
              {metric === "quantity" ? `${item.quantity} sold` : formatINR(item.revenue)}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-cream-100">
            <div className="h-full rounded-full bg-caramel-500" style={{ width: `${(item[metric] / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
