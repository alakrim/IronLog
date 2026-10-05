/** Minimal SVG charts sized for phones: few gridlines, large marks, labelled ends. */
import { fmtDate } from './fmt';

const W = 340, H = 170, L = 36, R = 10, T = 10, B = 24;

function niceTicks(min: number, max: number, count = 4): number[] {
  if (max - min < 1e-9) { max = min + 1; min = Math.max(0, min - 1); }
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= max + step * 0.5; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

export interface Pt { x: number; y: number; pr?: boolean }

export function LineChart({ points, alt, yFmt = (v) => String(v), label }: {
  points: Pt[]; alt?: Pt[]; yFmt?: (v: number) => string; label: string;
}) {
  if (points.length === 0) return <div className="muted small" style={{ padding: '24px 0', textAlign: 'center' }}>Log this exercise to see a trend.</div>;
  const all = [...points, ...(alt ?? [])];
  const ys = all.map((p) => p.y);
  const ticks = niceTicks(Math.min(...ys) * 0.97, Math.max(...ys) * 1.02);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const xs = all.map((p) => p.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const sx = (x: number) => (x1 === x0 ? L + (W - L - R) / 2 : L + ((x - x0) / (x1 - x0)) * (W - L - R));
  const sy = (y: number) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const path = (ps: Pt[]) => ps.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  const showDots = points.length <= 24;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} />
          <text x={L - 6} y={sy(t) + 4} textAnchor="end">{yFmt(t)}</text>
        </g>
      ))}
      {alt && alt.length > 1 && <path className="line alt" d={path(alt)} />}
      <path className="line" d={path(points)} />
      {points.map((p, i) => (showDots || p.pr || i === points.length - 1) && (
        <circle key={i} className={`dot${p.pr ? ' pr' : ''}`} cx={sx(p.x)} cy={sy(p.y)} r={p.pr ? 4.5 : 3.5} />
      ))}
      <text x={L} y={H - 6}>{fmtDate(x0, { day: 'numeric', month: 'short' })}</text>
      {x1 !== x0 && <text x={W - R} y={H - 6} textAnchor="end">{fmtDate(x1, { day: 'numeric', month: 'short' })}</text>}
    </svg>
  );
}

export function BarChart({ bars, yFmt = (v) => String(v), label }: {
  bars: { label: string; value: number; now?: boolean }[]; yFmt?: (v: number) => string; label: string;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const ticks = niceTicks(0, max, 3);
  const top = ticks[ticks.length - 1];
  const sy = (y: number) => T + (1 - y / top) * (H - T - B);
  const bw = (W - L - R) / bars.length;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} />
          <text x={L - 6} y={sy(t) + 4} textAnchor="end">{yFmt(t)}</text>
        </g>
      ))}
      {bars.map((b, i) => {
        const h = Math.max(b.value > 0 ? 2 : 0, sy(0) - sy(b.value));
        return (
          <g key={i}>
            <rect className={`bar${b.now ? ' now' : ''}`} x={L + i * bw + bw * 0.18} width={bw * 0.64} y={sy(0) - h} height={h} rx={3} />
            {(i === 0 || i === bars.length - 1 || bars.length <= 6) && (
              <text x={L + i * bw + bw / 2} y={H - 6} textAnchor="middle">{b.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <svg width="72" height="28" />;
  const min = Math.min(...values), max = Math.max(...values);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1)) * 70 + 1},${27 - ((v - min) / (max - min || 1)) * 24}`).join('');
  return (
    <svg width="72" height="28" viewBox="0 0 72 28" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--plate-blue)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
