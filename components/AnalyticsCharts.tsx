"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDayKey } from "@/lib/dates";
import { formatINR, formatINRCompact } from "@/lib/money";
import type { CategoryStat, DailyPoint } from "@/lib/analytics";

const COLLECTED = "#059669"; // emerald-600 — money received
const CATEGORY = "#b8732f"; // caramel — single-series magnitude
const GRID = "#efdfc6";
const AXIS_TEXT = "#86593a";

function TooltipBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-cream-200 bg-white px-3 py-2 text-sm shadow-lg">{children}</div>;
}

export function DailyRevenueChart({ data }: { data: DailyPoint[] }) {
  const hasData = data.some((d) => d.collected > 0 || d.billed > 0);
  if (!hasData) return <p className="grid h-56 place-items-center text-sm text-espresso-500">No sales in this period.</p>;

  // Label density: keep roughly ≤ 10 ticks.
  const interval = data.length > 10 ? Math.ceil(data.length / 10) - 1 : 0;

  return (
    <div className="h-64 w-full" role="img" aria-label="Bar chart of revenue collected per day">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="day"
            tickFormatter={formatDayKey}
            interval={interval}
            tick={{ fill: AXIS_TEXT, fontSize: 12 }}
            axisLine={{ stroke: GRID }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatINRCompact(v)}
            tick={{ fill: AXIS_TEXT, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            cursor={{ fill: "rgba(204,131,56,0.12)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as DailyPoint;
              return (
                <TooltipBox>
                  <p className="font-semibold text-espresso-900">{formatDayKey(p.day)}</p>
                  <p className="flex items-center gap-2 text-espresso-700">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLLECTED }} aria-hidden />
                    Collected <span className="tabular ml-auto pl-3 font-semibold">{formatINR(p.collected)}</span>
                  </p>
                  <p className="flex items-center gap-2 text-espresso-500">
                    <span className="h-2.5 w-2.5" aria-hidden />
                    Billed <span className="tabular ml-auto pl-3">{formatINR(p.billed)}</span>
                  </p>
                </TooltipBox>
              );
            }}
          />
          <Bar dataKey="collected" name="Collected" fill={COLLECTED} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryChart({ data }: { data: CategoryStat[] }) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-espresso-500">No sales in this period.</p>;
  const height = Math.max(160, data.length * 44);
  return (
    <div className="w-full" style={{ height }} role="img" aria-label="Bar chart of sales by category">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap="25%">
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis
            type="number"
            tickFormatter={(v: number) => formatINRCompact(v)}
            tick={{ fill: AXIS_TEXT, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="category"
            tick={{ fill: "#3f2716", fontSize: 13 }}
            axisLine={false}
            tickLine={false}
            width={96}
          />
          <Tooltip
            cursor={{ fill: "rgba(204,131,56,0.12)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as CategoryStat;
              return (
                <TooltipBox>
                  <p className="font-semibold text-espresso-900">{p.category}</p>
                  <p className="tabular text-espresso-700">{formatINR(p.revenue)}</p>
                  <p className="tabular text-espresso-500">{p.quantity} sold</p>
                </TooltipBox>
              );
            }}
          />
          <Bar dataKey="revenue" name="Revenue" fill={CATEGORY} radius={[0, 4, 4, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
