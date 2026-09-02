import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import { useTheme } from "@astryxdesign/core/theme";
import { Text } from "@astryxdesign/core/Text";
import { Num } from "../ui/bits.js";
import { VStack } from "@astryxdesign/core/VStack";
import type { TrendPoint } from "../lib/trend.js";
import { scoreLabel } from "../lib/grades.js";

/**
 * Single-series running-average line: hairline grid, a solid reference at the "good" threshold (90),
 * crosshair + tooltip naming the assignment that moved the average, endpoint dot. Draws on once
 * (motion token duration); the table-view twin is the graded list under it.
 */
export function TrendChart({ points, title }: { points: TrendPoint[]; title: string }) {
  const { token } = useTheme();
  const accent = token("--color-accent");
  const surface = token("--color-background-surface");
  const neutral = token("--color-border-emphasized");
  const duration = parseInt(token("--duration-medium"), 10) || 400;
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const data = points.map((p) => ({ ...p, label: format(parseISO(p.date), "M/d") }));
  const min = Math.max(0, Math.floor((Math.min(90, ...points.map((p) => p.value)) - 5) / 10) * 10);
  return (
    <div className="sk-chart" role="img" aria-label={`${title}: running average over ${points.length} graded assignments`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 44, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="0" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis domain={[min, 100]} tickLine={false} axisLine={false} width={36} tickCount={4} />
          <ReferenceLine y={90} stroke={neutral} strokeWidth={1} label={{ value: "good · 90", position: "insideTopLeft", fill: token("--color-text-secondary"), fontSize: 11 }} />
          <Tooltip content={<Tip />} cursor={{ stroke: neutral, strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={accent}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, fill: accent, stroke: surface, strokeWidth: 2 }}
            isAnimationActive={!reduced}
            animationDuration={duration}
            label={<EndLabel n={data.length} />}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function EndLabel({ x, y, value, index, n }: { x?: number; y?: number; value?: number; index?: number; n: number }) {
  if (index !== n - 1 || x === undefined || y === undefined || value === undefined) return null;
  return (
    <text x={x + 8} y={y + 4} className="recharts-text" style={{ fontWeight: 700, fill: "var(--color-text-primary)" }}>
      {value.toFixed(1)}
    </text>
  );
}

function Tip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TrendPoint & { label: string } }> }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <VStack className="sk-tip" gap={0.5}>
      <Text type="label">{p.assignment.title}</Text>
      <Num type="supporting">
        {scoreLabel(p.assignment)} · average {p.value.toFixed(1)} · {p.label}
      </Num>
    </VStack>
  );
}
