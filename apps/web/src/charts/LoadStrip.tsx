import { format, parseISO } from "date-fns";

/**
 * Seven columns, one per day from today: how much is due each day. ≤ 24px columns with 4px rounded
 * caps, today in the accent, other days neutral; counts are printed on the caps so colour never
 * carries the value alone.
 */
export function LoadStrip({ days }: { days: Array<{ date: string; count: number }> }) {
  const w = 336;
  const h = 56;
  const max = Math.max(1, ...days.map((d) => d.count));
  const slot = w / days.length;
  const bar = Math.min(24, slot - 12);
  const summary = days.map((d) => `${format(parseISO(d.date), "EEE")}: ${d.count}`).join(", ");
  return (
    <svg className="sk-load" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Due per day for the next week — ${summary}`}>
      {days.map((d, i) => {
        const x = i * slot + (slot - bar) / 2;
        const bh = d.count === 0 ? 2 : 4 + ((h - 30) * d.count) / max;
        const y = h - 16 - bh;
        const today = i === 0;
        return (
          <g key={d.date}>
            <path className="sk-load-bar" data-today={today} d={roundedTop(x, y, bar, bh, d.count === 0 ? 1 : 4)} />
            {d.count > 0 && (
              <text className="sk-load-count" x={x + bar / 2} y={y - 3}>
                {d.count}
              </text>
            )}
            <text className="sk-load-label" data-today={today} x={x + bar / 2} y={h - 3}>
              {today ? "Today" : format(parseISO(d.date), "EEE")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x} ${y + h} V${y + rr} Q${x} ${y} ${x + rr} ${y} H${x + w - rr} Q${x + w} ${y} ${x + w} ${y + rr} V${y + h} Z`;
}
