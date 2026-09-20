import type { ReactNode } from "react";
import { STATUS_LABEL, formatINR, type OrderStatusValue } from "@/lib/money";

const btnBase =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export const btn = {
  primary: `${btnBase} bg-espresso-800 text-cream-50 shadow-[0_8px_18px_-10px_rgb(36_21_13/0.8)] hover:bg-espresso-900`,
  accent: `${btnBase} bg-caramel-500 text-espresso-900 shadow-[0_8px_18px_-10px_rgb(173_106_34/0.9)] hover:bg-caramel-400`,
  secondary: `${btnBase} border border-cream-300 bg-white/90 text-espresso-800 hover:bg-cream-100`,
  success: `${btnBase} bg-emerald-700 text-white shadow-[0_8px_18px_-10px_rgb(4_120_87/0.9)] hover:bg-emerald-800`,
  danger: `${btnBase} border border-red-200 bg-white text-red-700 hover:bg-red-50`,
  dangerSolid: `${btnBase} bg-red-600 text-white hover:bg-red-700`,
};

export const inputClass =
  "block min-h-12 w-full rounded-2xl border border-cream-300 bg-white px-4 text-base text-espresso-900 shadow-[inset_0_1px_2px_rgb(36_21_13/0.05)] placeholder:text-espresso-300 focus:border-caramel-500 focus:ring-4 focus:ring-caramel-400/25 focus:outline-none";

export const labelClass = "mb-1.5 block text-xs font-bold tracking-wider text-espresso-500 uppercase";

export const cardClass = "rounded-3xl border border-cream-200/80 bg-white/95 shadow-card";

const statusStyles: Record<OrderStatusValue, string> = {
  PAID: "bg-emerald-50 text-emerald-800 ring-emerald-600/25",
  PARTIAL: "bg-amber-50 text-amber-900 ring-amber-500/40",
  UNPAID: "bg-red-50 text-red-800 ring-red-600/25",
};

const statusIcon: Record<OrderStatusValue, ReactNode> = {
  PAID: <path d="m5 10 3.5 3.5L15 7" />,
  PARTIAL: <path d="M10 3a7 7 0 0 1 0 14Z" fill="currentColor" stroke="none" />,
  UNPAID: <path d="M10 6v5M10 14h.01" />,
};

export function StatusBadge({ status, className = "" }: { status: OrderStatusValue; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${statusStyles[status]} ${className}`}
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
        {status === "PARTIAL" ? <circle cx="10" cy="10" r="7" strokeWidth={2} /> : null}
        {statusIcon[status]}
      </svg>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Rubber stamp shown on bills. */
export function StatusStamp({ status, balanceDue }: { status: OrderStatusValue; balanceDue: number }) {
  const tone = status === "PAID" ? "text-emerald-700" : status === "PARTIAL" ? "text-amber-600" : "text-red-600";
  return (
    <span className={`stamp text-lg ${tone}`}>
      {status === "PAID" ? "Paid" : `Due ${formatINR(balanceDue)}`}
    </span>
  );
}

export function OverdueBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          clipRule="evenodd"
        />
      </svg>
      Over 24h
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 print:hidden">
      <div>
        {eyebrow ? <p className="mb-1 text-[11px] font-bold tracking-[0.28em] text-caramel-600 uppercase">{eyebrow}</p> : null}
        <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight text-espresso-900 md:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-espresso-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-cream-300 bg-white/60 px-6 py-14 text-center">
      <svg viewBox="0 0 48 48" className="mx-auto mb-3 h-12 w-12 text-caramel-500" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
        <path d="M34 20h2.5a5 5 0 0 1 0 10H34" />
        <path d="M8 20h26v10a10 10 0 0 1-10 10h-6A10 10 0 0 1 8 30Z" />
        <path d="M17 8c-1.2 1.6-1.2 3.4 0 5M24 6c-1.2 1.6-1.2 3.4 0 5" />
      </svg>
      <p className="font-display text-xl font-semibold text-espresso-800">{title}</p>
      {children ? <div className="mt-1 text-sm text-espresso-500">{children}</div> : null}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-2xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 ring-1 ring-red-200">
      {children}
    </p>
  );
}
