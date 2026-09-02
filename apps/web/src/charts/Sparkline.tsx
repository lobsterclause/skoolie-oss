/**
 * 12-point sparkline: one 2px accent line, a 10% area wash, an 8px end-dot with a 2px surface ring.
 * No axes, no animation, and the value it summarises is always printed next to it.
 */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const w = 72;
  const h = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / span) * (h - 6)] as const);
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1]!;
  const area = `${d} L${last[0].toFixed(1)} ${h} L${pts[0]![0].toFixed(1)} ${h} Z`;
  return (
    <svg className="sk-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <path className="sk-spark-area" d={area} />
      <path className="sk-spark-line" d={d} />
      <circle className="sk-spark-dot" cx={last[0]} cy={last[1]} r={4} />
    </svg>
  );
}
