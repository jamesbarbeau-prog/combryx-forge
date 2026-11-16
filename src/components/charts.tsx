// Small SVG charts: donut, columns, horizontal bars. Live data in, no chart library.
import { useState } from 'react';

export interface Slice { label: string; value: number; color: string }

export function Donut({ data, size = 176, thickness = 26, centerLabel = 'total', onSlice }: { data: Slice[]; size?: number; thickness?: number; centerLabel?: string; onSlice?: (label: string) => void }) {
  const [hi, setHi] = useState<number | null>(null);
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = (size - thickness) / 2, c = 2 * Math.PI * r, cx = size / 2;
  let offset = 0;
  const gap = data.filter(d => d.value > 0).length > 1 ? 2 : 0;
  const active = hi !== null ? data[hi] : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} role="img" aria-label={data.map(d => `${d.label} ${d.value}`).join(', ')}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="#EFEBE2" strokeWidth={thickness} />
          {total > 0 && data.map((d, i) => {
            const len = (d.value / total) * c; const seg = Math.max(0, len - gap); const o = offset; offset += len;
            if (d.value <= 0) return null;
            return <circle key={d.label} cx={cx} cy={cx} r={r} fill="none" stroke={d.color} strokeWidth={hi === i ? thickness + 4 : thickness}
              strokeDasharray={`${seg} ${c - seg}`} strokeDashoffset={-o} transform={`rotate(-90 ${cx} ${cx})`}
              onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} onClick={() => onSlice?.(d.label)} style={{ transition: 'stroke-width .12s', cursor: onSlice ? 'pointer' : 'default', opacity: hi === null || hi === i ? 1 : 0.45 }} />;
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: '#1F2A3C', lineHeight: 1 }}>{active ? active.value : total}</div>
          <div style={{ fontSize: 11, color: '#485163', marginTop: 4, maxWidth: size - thickness * 2 - 8, textAlign: 'center' }}>{active ? active.label : centerLabel}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 8, minWidth: 150, flex: 1 }}>
        {data.map((d, i) => (
          <div key={d.label} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} onClick={() => onSlice?.(d.label)} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: '#1F2A3C', cursor: onSlice ? 'pointer' : 'default', opacity: hi === null || hi === i ? 1 : 0.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: '#485163' }}>{d.label}</span>
            <b style={{ fontVariantNumeric: 'tabular-nums' }}>{d.value}</b>
            <span style={{ width: 38, textAlign: 'right', color: '#6C7280', fontVariantNumeric: 'tabular-nums' }}>{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface Col { label: string; value: number; color: string; hint?: string }

export function Columns({ data, height = 150 }: { data: Col[]; height?: number }) {
  const [hi, setHi] = useState<number | null>(null);
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height, borderBottom: '1px solid #D9D2C5', padding: '0 6px' }}>
        {data.map((d, i) => (
          <div key={d.label} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%', opacity: hi === null || hi === i ? 1 : 0.5, transition: 'opacity .12s' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2A3C', marginBottom: 5, fontVariantNumeric: 'tabular-nums' }}>{d.value}</div>
            <div title={`${d.label}: ${d.value}`} style={{ width: '100%', maxWidth: 54, height: `${Math.max(d.value ? 4 : 2, (d.value / max) * (height - 34))}px`, background: d.value ? d.color : '#D9D2C5', borderRadius: '4px 4px 0 0' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, padding: '7px 6px 0' }}>
        {data.map(d => (
          <div key={d.label} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, color: '#485163', lineHeight: 1.25 }}>
            {d.label}{d.hint && <div style={{ color: '#6C7280', fontSize: 10.5 }}>{d.hint}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HBars({ data, color = '#2a78d6', empty = 'Nothing to show yet.' }: { data: { label: string; value: number }[]; color?: string; empty?: string }) {
  const [hi, setHi] = useState<number | null>(null);
  const max = Math.max(1, ...data.map(d => d.value));
  if (!data.length) return <div style={{ fontSize: 12.5, color: '#485163' }}>{empty}</div>;
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {data.map((d, i) => (
        <div key={d.label} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}
          style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 38%) 1fr 34px', alignItems: 'center', gap: 10, opacity: hi === null || hi === i ? 1 : 0.55, transition: 'opacity .12s' }}>
          <div style={{ fontSize: 12.5, color: '#485163', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.label}>{d.label}</div>
          <div style={{ background: '#EFEBE2', borderRadius: 4, height: 10 }}>
            <div style={{ width: `${(d.value / max) * 100}%`, minWidth: d.value ? 4 : 0, height: '100%', background: color, borderRadius: 4 }} />
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'right', color: '#1F2A3C', fontVariantNumeric: 'tabular-nums' }}>{d.value}</div>
        </div>
      ))}
    </div>
  );
}
