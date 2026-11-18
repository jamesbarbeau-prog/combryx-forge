// All sites review: every home with aged open items, with a days-based recommendation to keep open, close safely, or close.
// The rule lives in the aging_review() database function, so the screen and the report always agree. Nothing here closes an item.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

interface RRow {
  item_id: string; lot_id: string; community: string; lot_number: string; address: string | null; owner: string | null;
  closing_date: string | null; age_days: number | null; item_number: string | null; form: string; description: string;
  bucket: string; bucket_reason: string;
}
const BUCKETS: { key: string; label: string; short: string; color: string }[] = [
  { key: 'keep_followup', label: 'Keep open: resolve and update the owner', short: 'Keep open', color: '#C77D12' },
  { key: 'safe_close', label: 'Safe to close: no Tarion form risk', short: 'Safe to close', color: '#2E9B6A' },
  { key: 'close_now', label: 'Close: well past 3 years', short: 'Close', color: '#4A6FC2' },
  { key: 'needs_review', label: 'No closing date', short: 'No closing date', color: '#8D7140' },
];
const COLOR = Object.fromEntries(BUCKETS.map(b => [b.key, b.color])) as Record<string, string>;
const SHORT = Object.fromEntries(BUCKETS.map(b => [b.key, b.short])) as Record<string, string>;
const FORM_LABEL: Record<string, string> = { service: 'Service', pdi: 'PDI', qci: 'QCI', initial: 'Initial', mid_year: 'Mid-Year', year_end: '1-Year', second_year: '2-Year', msd: 'MSD', emergency: 'Emergency' };
const panel: React.CSSProperties = { background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 12 };
const sel: React.CSSProperties = { height: 36, borderRadius: 8, border: '1px solid var(--color-border-hard)', background: '#fff', padding: '0 10px', fontSize: 13, fontFamily: 'inherit' };
const btn = (primary: boolean, off?: boolean): React.CSSProperties => ({ height: 36, borderRadius: 8, padding: '0 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: off ? 'default' : 'pointer', opacity: off ? 0.55 : 1,
  border: primary ? 'none' : '1px solid var(--color-border-hard)', background: primary ? '#1F2A3C' : '#fff', color: primary ? '#fff' : '#1F2A3C' });
const n = (v: number) => v.toLocaleString('en-CA');

export default function AgingReview({ file }: { file: string }) {
  const nav = useNavigate();
  const [minDays, setMinDays] = useState(300);
  const [rows, setRows] = useState<RRow[] | null>(null);
  const [keepDays, setKeepDays] = useState(730);
  const [closeDays, setCloseDays] = useState(1095);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<'' | 'preview' | 'email'>('');
  const [note, setNote] = useState('');
  const [bucket, setBucket] = useState('');
  const [shown, setShown] = useState(40);
  const [preview, setPreview] = useState('');

  const load = useCallback(async () => {
    setErr(''); setRows(null);
    const all: RRow[] = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await supabase.rpc('aging_review', { p_min_days: minDays, p_community: null, p_file: file || null, p_keep_days: keepDays, p_close_days: closeDays }).range(from, from + 999);
      if (error) { setErr(error.message); return; }
      all.push(...((data ?? []) as RRow[])); if (!data || data.length < 1000) break;
    }
    setRows(all);
  }, [minDays, keepDays, closeDays, file]);
  useEffect(() => { void load(); setShown(40); }, [load]);

  const counts = useMemo(() => { const c: Record<string, number> = {}; (rows ?? []).forEach(r => { c[r.bucket] = (c[r.bucket] ?? 0) + 1; }); return c; }, [rows]);

  const lots = useMemo(() => {
    const m = new Map<string, { lot_id: string; community: string; lot_number: string; address: string | null; owner: string | null; age: number | null; items: RRow[] }>();
    for (const r of rows ?? []) {
      if (bucket && r.bucket !== bucket) continue;
      if (!m.has(r.lot_id)) m.set(r.lot_id, { lot_id: r.lot_id, community: r.community, lot_number: r.lot_number, address: r.address, owner: r.owner, age: r.age_days, items: [] });
      m.get(r.lot_id)!.items.push(r);
    }
    return [...m.values()];
  }, [rows, bucket]);

  async function report(send: boolean) {
    setBusy(send ? 'email' : 'preview'); setNote(''); setErr('');
    const { data, error } = await supabase.functions.invoke('aging-review', { body: { action: 'report', min_days: minDays, keep_days: keepDays, close_days: closeDays, file: file || null, send } });
    setBusy('');
    if (error || data?.error) { setErr(data?.error ?? error?.message ?? 'The report failed.'); return; }
    if (send) {
      setNote(data.mail === 'sent' ? `Report emailed.${data.test_mode ? ' Test mode is on, so it went only to your test address.' : ''}`
        : data.mail === 'not_configured' ? 'Email is not set up yet (the mail webhook secrets are missing). Use Preview report meanwhile.'
        : `Email did not send: ${data.mail}`);
    } else setPreview(data.html as string);
  }

  const total = rows?.length ?? 0;
  return (
    <div>
      <div style={{ ...panel, padding: '16px 18px', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>All sites review</h2>
          <label style={{ fontSize: 13, color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', gap: 6 }}>Show items over
            <select value={minDays} onChange={e => setMinDays(Number(e.target.value))} style={sel}>
              {[120, 185, 300, 365, 545, 730, 1095].map(d => <option key={d} value={d}>{d} days</option>)}
            </select></label>
          <label style={{ fontSize: 13, color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', gap: 6 }}>Keep open up to
            <select value={keepDays} onChange={e => setKeepDays(Number(e.target.value))} style={sel}>
              {[185, 365, 545, 730].map(d => <option key={d} value={d}>{d} days{d === 730 ? ' (2 years)' : ''}</option>)}
            </select></label>
          <label style={{ fontSize: 13, color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', gap: 6 }}>Close beyond
            <select value={closeDays} onChange={e => setCloseDays(Number(e.target.value))} style={sel}>
              {[730, 1095, 1460].map(d => <option key={d} value={d}>{d} days{d === 1095 ? ' (3 years)' : ''}</option>)}
            </select></label>
          <span style={{ flex: 1 }} />
          <button disabled={busy !== '' || !total} onClick={() => report(false)} style={btn(false, busy !== '' || !total)}>{busy === 'preview' ? 'Building…' : 'Preview report'}</button>
          <button disabled={busy !== '' || !total} onClick={() => report(true)} style={btn(true, busy !== '' || !total)}>{busy === 'email' ? 'Sending…' : 'Email report to me'}</button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-sub)', margin: '8px 0 0', maxWidth: 820 }}>
          Every open item is sorted by days since the home closed. Nothing is closed from this screen.
        </p>
        {note && <div style={{ fontSize: 13, color: '#3F6A8F', marginTop: 8 }}>{note}</div>}
        {err && <div style={{ fontSize: 13, color: '#A5402F', marginTop: 8 }}>{err}</div>}
        <ol style={{ margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.6, fontSize: 13, color: 'var(--color-text-sub)' }}>
          <li>Up to {keepDays} days since closing: keep open, resolve it and update the owner.</li>
          <li>{keepDays + 1} to {closeDays} days: safe to close. It is past the 2-year window, so no later Tarion form can pick it up.</li>
          <li>Over {closeDays} days: close.</li>
          <li>No closing date: listed separately, because it cannot be aged.</li>
        </ol>
      </div>

      {!rows && !err && <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>Loading…</div>}
      {rows && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <Tile active={!bucket} color="#1F2A3C" label="All" value={n(total)} onClick={() => setBucket('')} />
            {BUCKETS.map(b => <Tile key={b.key} active={bucket === b.key} color={b.color} label={b.label} value={n(counts[b.key] ?? 0)} onClick={() => setBucket(bucket === b.key ? '' : b.key)} />)}
          </div>

          <div style={{ ...panel, overflow: 'hidden' }}>
            {lots.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Nothing to review here.</div>}
            {lots.slice(0, shown).map((l, idx) => {
              const first = idx === 0 || lots[idx - 1].community !== l.community;
              return (
                <div key={l.lot_id}>
                  {first && <div style={{ padding: '9px 16px', background: 'var(--color-mist)', fontSize: 12, fontWeight: 800, letterSpacing: 0.2, borderTop: idx ? '1px solid var(--color-border)' : 'none' }}>{l.community}</div>}
                  <div style={{ padding: '10px 16px', borderTop: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => nav(`/warranty/lots/${l.lot_id}`)}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{l.address ?? `Lot ${l.lot_number}`}</span>
                      <span style={{ fontSize: 12.5, color: 'var(--color-text-sub)' }}>Lot {l.lot_number}{l.owner ? ` · ${l.owner}` : ''}</span>
                      <span style={{ fontSize: 12.5, color: 'var(--color-text-sub)' }}>{l.age == null ? 'No closing date' : `${n(l.age)} days since closing`}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{l.items.length} open</span>
                    </div>
                    {l.items.map(r => (
                      <div key={r.item_id} style={{ display: 'grid', gridTemplateColumns: '90px 62px 1fr 130px', gap: 10, alignItems: 'start', padding: '6px 0 0', fontSize: 12.5 }}>
                        <span style={{ fontWeight: 700 }}>{r.item_number ?? '—'}</span>
                        <span style={{ color: 'var(--color-text-sub)' }}>{FORM_LABEL[r.form] ?? r.form}</span>
                        <span>
                          <span>{r.description || <i style={{ color: 'var(--color-muted)' }}>No description</i>}</span>
                          <span style={{ display: 'block', color: 'var(--color-text-sub)', marginTop: 2 }}>{r.bucket_reason}</span>
                        </span>
                        <span style={{ justifySelf: 'end', padding: '2px 8px', borderRadius: 999, background: COLOR[r.bucket] + '1F', color: COLOR[r.bucket], fontWeight: 700, whiteSpace: 'nowrap' }}>{SHORT[r.bucket]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {lots.length > shown && <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--color-border)' }}><button style={btn(false)} onClick={() => setShown(shown + 40)}>Show 40 more homes ({n(lots.length - shown)} left)</button></div>}
          </div>
        </>
      )}

      {preview && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(20,28,40,.6)', zIndex: 2000, display: 'flex', flexDirection: 'column', padding: 24, boxSizing: 'border-box' }}>
          <div style={{ ...panel, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#fff' }}>
            <div style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--color-border)', alignItems: 'center' }}>
              <b style={{ fontSize: 14 }}>Aging review report</b><span style={{ flex: 1 }} />
              <button style={btn(false)} onClick={() => { const f = document.getElementById('aging-report-frame') as HTMLIFrameElement | null; f?.contentWindow?.print(); }}>Print or save as PDF</button>
              <button style={btn(false)} onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([preview], { type: 'text/html' })); a.download = 'aging-review.html'; a.click(); }}>Download</button>
              <button style={btn(true)} onClick={() => setPreview('')}>Close</button>
            </div>
            <iframe id="aging-report-frame" title="Aging review report" srcDoc={`<body style="margin:20px 28px">${preview}</body>`} style={{ flex: 1, border: 0, minHeight: 0 }} />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function Tile({ label, value, color, active, onClick }: { label: string; value: string; color: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', padding: '10px 14px', borderRadius: 10, minWidth: 150, maxWidth: 220,
      border: `1.5px solid ${active ? color : 'var(--color-border)'}`, background: active ? color + '14' : 'var(--color-panel)' }}>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginTop: 4 }}>{label}</div>
    </button>
  );
}
