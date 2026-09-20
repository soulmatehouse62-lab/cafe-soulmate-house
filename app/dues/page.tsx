import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatINR, lineLabel } from "@/lib/money";
import { DuesList } from "@/components/DuesList";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 3600 * 1000;

export default async function DuesPage({ searchParams }: { searchParams: Promise<{ phone?: string }> }) {
  await requireUser();
  const { phone } = await searchParams;
  const orders = await prisma.order.findMany({
    where: { status: { in: ["UNPAID", "PARTIAL"] } },
    orderBy: { createdAt: "asc" },
    include: {
      payments: { orderBy: { paidAt: "asc" } },
      items: { select: { itemName: true, variantName: true, quantity: true }, orderBy: { itemName: "asc" } },
    },
  });

  // Age is computed once on the server so the client hydrates with the same value.
  const now = new Date().getTime();
  const totalDue = orders.reduce((s, o) => s + o.balanceDue, 0);
  const overdueCount = orders.filter((o) => now - o.createdAt.getTime() > DAY_MS).length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Money owed"
        title="Due payments"
        subtitle={orders.length ? `${orders.length} open order${orders.length === 1 ? "" : "s"}, oldest first` : undefined}
      />

      {orders.length === 0 ? (
        <EmptyState title="All settled">No unpaid or partially paid orders right now.</EmptyState>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-3xl bg-red-600 p-4 text-white shadow-[0_12px_28px_-14px_rgb(220_38_38/0.9)]">
              <p className="text-xs font-bold tracking-widest uppercase opacity-80">Outstanding</p>
              <p className="font-display text-3xl font-semibold">{formatINR(totalDue)}</p>
            </div>
            <div className="rounded-3xl bg-amber-300 p-4 text-espresso-900 shadow-[0_12px_28px_-14px_rgb(217_119_6/0.8)]">
              <p className="text-xs font-bold tracking-widest uppercase opacity-70">Waiting 24h+</p>
              <p className="font-display text-3xl font-semibold">
                {overdueCount} <span className="text-base font-medium">order{overdueCount === 1 ? "" : "s"}</span>
              </p>
            </div>
          </div>
          <DuesList
            initialQuery={phone ?? ""}
            orders={orders.map((o) => ({
              id: o.id,
              orderNumber: o.orderNumber,
              customerName: o.customerName,
              customerPhone: o.customerPhone,
              tableNumber: o.tableNumber,
              createdAt: o.createdAt,
              ageHours: (now - o.createdAt.getTime()) / 3600000,
              status: o.status,
              total: o.total,
              amountPaid: o.amountPaid,
              balanceDue: o.balanceDue,
              itemsSummary: o.items.map((i) => `${i.quantity}× ${lineLabel(i.itemName, i.variantName)}`).join(", "),
              payments: o.payments.map((p) => ({ id: p.id, amount: p.amount, method: p.method, paidAt: p.paidAt })),
            }))}
          />
        </>
      )}
    </div>
  );
}
