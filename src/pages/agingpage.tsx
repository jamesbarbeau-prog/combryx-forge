// Aging: open items by community, counted in days since each home closed.
// Route: /warranty/aging
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

interface Row {
  community_id: string; community: string; lots: number; open_items: number; avg_age_days: number | null; oldest_days: number | null;
  b30: number; b60: number; b90: number; b120: number; b180: number; b300: number; b300p: number; pre: number;
}
interface AgedLot { lot_id: string; community: string; lot_number: string; address: string | null; owner: string | null; closing_date: string; age_days: number; open_items: number }

const BANDS: { key: keyof Row; label: string; color: string }[] = [
  { key: 'b30', label: '0 to 30', color: '#EADFC4' }, { key: 'b60', label: '31 to 60', color: '#DCC68F' },
  { key: 'b90', label: '61 to 90', color: '#C9A96A' }, { key: 'b120', label: '91 to 120', color: '#B08D4F' },
  { key: 'b180', label: '121 to 180', color: '#8D7140' }, { key: 'b300', label: '181 to 300', color: '#A5402F' },
  { key: 'b300p', label: 'Over 300', color: '#6E1F14' },
];
const FILES = [['', 'All files'], ['service', 'Service requests'], ['pdi', 'PDI'], ['qci', 'QCI'], ['initial', 'Initial'], ['mid_year', 'Mid-Year'], ['year_end', '1-Year'], ['second_year', '2-Year'], ['msd', 'MSD']];
const panel: React.CSSProperties = { background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 12 };
const sel: React.CSSProperties = { height: 36, borderRadius: 8, border: '1px solid var(--color-border-hard)', background: '#fff', padding: '0 10px', fontSize: 13, fontFamily: 'inherit' };
const n = (v: number) => v.toLocaleString('en-CA');

export default function AgingPage() {
  const nav = useNavigate();
  const [file, setFile] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState<Row | null>(null);
  const [minDays, setMinDays] = useState(300);
  const [lots, setLots] = useState<AgedLot[] | null>(null);

  useEffect(() => {
    let live = true; setRows(null); setErr('');
    supabase.rpc('community_aging', { p_community: null, p_file: file || null }).then(({ data, error }) => {
      if (!live) return; if (error) setErr(error.message); else setRows((data ?? []) as Row[]);
    });
    return () => { live = false; };
  }, [file]);

  useEffect(() => {
    if (!pick) { setLots(null); return; }
    let live = true; setLots(null);
    supabase.rpc('aged_lots', { p_community: pick.community_id, p_min_days: minDays, p_file: file || null }).then(({ data }) => { if (live) setLots((data ?? []) as AgedLot[]); });
    return () => { live = false; };
  }, [pick, minDays, file]);

  const tot = useMemo(() => (rows ?? []).reduce((a, r) => {
    BANDS.forEach(b => { (a as any)[b.key] += r[b.key] as number; });
    a.open += r.open_items; a.pre += r.pre; a.lots += r.lots; return a;
  }, { open: 0, pre: 0, lots: 0, b30: 0, b60: 0, b90: 0, b120: 0, b180: 0, b300: 0, b300p: 0 } as any), [rows]);
  const over = (r: { b300: number; b300p: number; open_items: number }) => r.b300p;

  return (
    <div style={{ padding: '26px 32px', maxWidth: 1200, fontFamily: 'var(--font-body)', color: 'var(--color-text)' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Aging</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-sub)', margin: '4px 0 16px', maxWidth: 720 }}>
        Open items only, counted in days since each home closed. Homes with no closing date, or one still ahead, are shown separately.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <select value={file} onChange={e => { setFile(e.target.value); }} style={sel}>{FILES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>

      {err && <div style={{ color: '#A5402F', fontSize: 13, marginBottom: 10 }}>Could not load aging: {err}</div>}
      {!rows && !err && <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>Loading…</div>}

      {rows && (
        <>
          <div style={{ ...panel, padding: '18px 22px', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 14 }}>
              <Tile label="Open items" value={n(tot.open)} />
              <Tile label="Homes with open items" value={n(tot.lots)} />
              <Tile label="Over 300 days" value={n(tot.b300p)} color="#A5402F" sub={tot.open ? `${Math.round((tot.b300p / tot.open) * 100)}% of open items` : ''} />
              <Tile label="No closing date" value={n(tot.pre)} />
            </div>
            <Stack r={tot} height={20} />
            <Legend />
          </div>

          <div style={{ ...panel, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 60px 70px 70px 2.4fr 80px', gap: 10, padding: '10px 16px', background: 'var(--color-mist)', fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)' }}>
              <span>Community</span><span style={{ textAlign: 'right' }}>Homes</span><span style={{ textAlign: 'right' }}>Open</span><span style={{ textAlign: 'right' }}>Avg days</span><span>Open items by days since closing</span><span style={{ textAlign: 'right' }}>Over 300</span>
            </div>
            {rows.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>No open items.</div>}
            {rows.map(r => (
              <div key={r.community_id} onClick={() => setPick(pick?.community_id === r.community_id ? null : r)}
                style={{ display: 'grid', gridTemplateColumns: '1.3fr 60px 70px 70px 2.4fr 80px', gap: 10, padding: '11px 16px', alignItems: 'center', borderTop: '1px solid var(--color-border)', cursor: 'pointer', background: pick?.community_id === r.community_id ? 'var(--color-mist)' : 'transparent' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{r.community}</span>
                <span style={{ textAlign: 'right', fontSize: 13 }}>{n(r.lots)}</span>
                <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{n(r.open_items)}</span>
                <span style={{ textAlign: 'right', fontSize: 13 }}>{r.avg_age_days ?? '—'}</span>
                <Stack r={r} height={14} />
                <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: over(r) ? '#A5402F' : 'var(--color-text-sub)' }}>{n(over(r))}</span>
              </div>
            ))}
          </div>

          {pick && (
            <div style={{ ...panel, padding: '16px 18px', marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{pick.community}: homes closed more than</h2>
                <select value={minDays} onChange={e => setMinDays(Number(e.target.value))} style={sel}>
                  {[30, 60, 90, 120, 180, 300, 365, 730].map(d => <option key={d} value={d}>{d} days ago</option>)}
                </select>
                {lots && <span style={{ fontSize: 13, color: 'var(--color-text-sub)' }}>{lots.length}{lots.length === 500 ? '+' : ''} homes, oldest closings first</span>}
              </div>
              {!lots && <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>Loading…</div>}
              {lots && lots.length === 0 && <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>No homes with open items that closed that long ago.</div>}
              {lots && lots.map(l => (
                <div key={l.lot_id} onClick={() => nav(`/warranty/lots/${l.lot_id}`)} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 110px 90px 80px', gap: 10, padding: '9px 0', borderTop: '1px solid var(--color-border)', cursor: 'pointer', alignItems: 'center', fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{l.address ?? `Lot ${l.lot_number}`}</span>
                  <span style={{ color: 'var(--color-text-sub)' }}>{l.owner ?? '—'}</span>
                  <span>{new Date(l.closing_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span style={{ textAlign: 'right' }}>{n(l.age_days)} days</span>
                  <span style={{ textAlign: 'right', fontWeight: 700 }}>{l.open_items} open</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stack({ r, height }: { r: { [k: string]: any }; height: number }) {
  const tot = BANDS.reduce((a, b) => a + (r[b.key] as number), 0);
  if (!tot) return <div style={{ height, borderRadius: 3, background: '#E4DFD5' }} />;
  return (
    <div style={{ display: 'flex', height, gap: 2 }} title={BANDS.map(b => `${b.label}: ${r[b.key]}`).join(', ')}>
      {BANDS.map(b => (r[b.key] as number) > 0 && <div key={b.key as string} style={{ flex: r[b.key] as number, background: b.color, borderRadius: 2, minWidth: 2 }} />)}
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
      {BANDS.map(b => <span key={b.key as string} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--color-text-sub)' }}><span style={{ width: 10, height: 10, borderRadius: 2, background: b.color }} />{b.label} days</span>)}
    </div>
  );
}

function Tile({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: color ?? 'var(--color-text)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginTop: 4 }}>{label}{sub ? `, ${sub}` : ''}</div>
    </div>
  );
}
