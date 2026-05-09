"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import { formatAEDCompact } from "@/lib/format";

type Point = { day: string; revenueFils: number; orderCount: number };

export function SalesChart({ data }: { data: Point[] }) {
  const formatted = data.map((d) => ({ ...d, aed: d.revenueFils / 100 }));

  return (
    <div className="h-64 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={formatted} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={(d) => format(parseISO(d), "d MMM")}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v) => formatAEDCompact(v * 100)}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <Tooltip
            cursor={{ stroke: "var(--brand)", strokeOpacity: 0.4 }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--popover-foreground)",
            }}
            formatter={((value: number, _name: string, item: { payload?: { orderCount?: number } }) => {
              const orders = item?.payload?.orderCount ?? 0;
              return [`${formatAEDCompact(value * 100)} · ${orders} orders`, "Revenue"];
            }) as never}
            labelFormatter={(d) => format(parseISO(d), "EEE, d MMM yyyy")}
          />
          <Area
            type="monotone"
            dataKey="aed"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#revenueGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
