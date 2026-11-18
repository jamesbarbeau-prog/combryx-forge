// Game plan: open work orders aged from the day each work order was created (the way QDEF, Buildertrend and Hyphen age them),
// with a small Tarion note per community. Data comes from the QDEF "Outstanding Aging - Details" report.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { parseAgingReport, type QSection } from '@/lib/qdefaging';

interface Open {
  wo_number: number; community: string; lot_number: string; owner: string | null; address: string | null; category: string | null; trade: string;
  closing_date: string | null; scheduled_date: string | null; description: string; age_days: number; days_since_closing: number | null;
  tarion: string; two_year_word: string | null; urgent_word: string | null; last_seen: string;
}
interface TradeStat { trade: string; open_count: number; open_avg: number | null; open_median: number | null; over30: number; over60: number; over90: number; over120: number; closed_count: number; closed_avg: number | null }
interface Preview { sec: QSection; fresh: number; same: number; leaving: number; busy: boolean; done: string; err: string }

const BUCKETS = [
  { label: '0 to 30', max: 30, color: '#EADFC4' }, { label: '31 to 60', max: 60, color: '#DCC68F' }, { label: '61 to 90', max: 90, color: '#C9A96A' },
  { label: '91 to 120', max: 120, color: '#B08D4F' }, { label: 'Over 120', max: 1e9, color: '#A5402F' },
];
const panel: React.CSSProperties = { background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 12 };
const sel: React.CSSProperties = { height: 36, borderRadius: 8, border: '1px solid var(--color-border-hard)', background: '#fff', padding: '0 10px', fontSize: 13, fontFamily: 'inherit' };
const btn = (primary: boolean, off?: boolean): React.CSSProperties => ({ height: 36, borderRadius: 8, padding: '0 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: off ? 'default' : 'pointer', opacity: off ? 0.55 : 1,
  border: primary ? 'none' : '1px solid var(--color-border-hard)', background: primary ? '#1F2A3C' : '#fff', color: primary ? '#fff' : '#1F2A3C' });
const n = (v: number) => v.toLocaleString('en-CA');
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const bucketOf = (a: number) => BUCKETS.findIndex(b => a <= b.max);
const short = (s: string, k = 110) => (s.length > k ? s.slice(0, k - 1) + '…' : s);

async function loadOpen(community: string | null): Promise<Open[]> {
  const out: Open[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.rpc('qdef_wo_open', { p_community: community }).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Open[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// Groupings used by the tabs and by the printed plan.
function plan(items: Open[]) {
  const lots = new Map<string, { key: string; lot: string; label: string; owner: string; items: Open[] }>();
  const trades = new Map<string, { trade: string; items: Open[]; homes: Set<string> }>();
  for (const i of items) {
    let l = lots.get(i.lot_number); if (!l) { l = { key: i.lot_number, lot: i.lot_number, label: i.address ?? `Lot ${i.lot_number}`, owner: i.owner ?? '', items: [] }; lots.set(i.lot_number, l); }
    l.items.push(i);
    let t = trades.get(i.trade); if (!t) { t = { trade: i.trade, items: [], homes: new Set() }; trades.set(i.trade, t); }
    t.items.push(i); t.homes.add(i.lot_number);
  }
  const lotRows = [...lots.values()].map(l => ({
    ...l, oldest: Math.max(...l.items.map(i => i.age_days)), urgent: l.items.filter(i => i.urgent_word).length,
    over120: l.items.filter(i => i.age_days > 120).length, unbooked: l.items.filter(i => !i.scheduled_date).length,
  })).sort((a, b) => b.urgent - a.urgent || b.over120 - a.over120 || b.oldest - a.oldest);
  const batches = [...trades.values()].filter(t => t.homes.size >= 2).map(t => ({ ...t, avg: Math.round(t.items.reduce((a, i) => a + i.age_days, 0) / t.items.length) }))
    .sort((a, b) => b.items.length - a.items.length);
  const urgent = items.filter(i => i.urgent_word).sort((a, b) => b.age_days - a.age_days);
  const booking = items.filter(i => !i.scheduled_date && i.age_days > 60 && !i.urgent_word).sort((a, b) => b.age_days - a.age_days);
  const stale = items.filter(i => i.scheduled_date && i.scheduled_date < new Date().toISOString().slice(0, 10) && i.age_days > 60).sort((a, b) => b.age_days - a.age_days);
  const closeReady = items.filter(i => (i.tarion === 'safe_close' || i.tarion === 'close_now') && !i.urgent_word).sort((a, b) => b.age_days - a.age_days);
  return { lotRows, batches, urgent, booking, stale, closeReady };
}

function tarionBlurb(items: Open[]) {
  const c = { keep: 0, review: 0, safe: 0, now: 0, none: 0 };
  for (const i of items) { if (i.tarion === 'keep_followup') c.keep++; else if (i.tarion === 'review_close') c.review++; else if (i.tarion === 'safe_close') c.safe++; else if (i.tarion === 'close_now') c.now++; else c.none++; }
  const total = items.length || 1;
  const text = `Tarion view: ${n(c.keep)} open items are still inside the first year or carry two-year wording, so they stay on follow-up. ${n(c.review)} are in the second year with no two-year wording and can be reviewed for closing. ${n(c.safe + c.now)} closed more than two years ago (${n(c.now)} past three years) and carry no ongoing Tarion exposure, so they are safe to close once the homeowner is told.${c.none ? ` ${n(c.none)} have no usable closing date.` : ''}`;
  return { c, text, closable: Math.round(((c.review + c.safe + c.now) / total) * 100) };
}

export default function GamePlan() {
  const [all, setAll] = useState<Open[] | null>(null);
  const [err, setErr] = useState('');
  const [community, setCommunity] = useState('');
  const [tab, setTab] = useState<'super' | 'coord' | 'trades'>('super');
  const [stats, setStats] = useState<TradeStat[] | null>(null);
  const [previews, setPreviews] = useState<Preview[] | null>(null);
  const [fileErr, setFileErr] = useState('');
  const [html, setHtml] = useState('');
  const [openLot, setOpenLot] = useState('');
  const [shown, setShown] = useState(25);

  const reload = useCallback(() => { setErr(''); return loadOpen(null).then(setAll).catch(e => setErr(e.message)); }, []);
  useEffect(() => { reload(); }, [reload]);

  const communities = useMemo(() => [...new Set((all ?? []).map(i => i.community))].sort(), [all]);
  useEffect(() => { if (!community && communities.length) setCommunity(communities[0]); }, [communities, community]);
  const items = useMemo(() => (all ?? []).filter(i => i.community === community), [all, community]);
  const P = useMemo(() => plan(items), [items]);
  const T = useMemo(() => tarionBlurb(items), [items]);

  useEffect(() => {
    if (!community) return; let live = true; setStats(null);
    supabase.rpc('qdef_wo_trade_stats', { p_community: community, p_since: 90 }).then(({ data }) => { if (live) setStats((data ?? []) as TradeStat[]); });
    return () => { live = false; };
  }, [community, all]);
  useEffect(() => { setOpenLot(''); setShown(25); }, [community, tab]);

  const counts = useMemo(() => {
    const b = BUCKETS.map(() => 0); items.forEach(i => { b[bucketOf(i.age_days)]++; });
    const avg = items.length ? Math.round(items.reduce((a, i) => a + i.age_days, 0) / items.length) : 0;
    return { b, avg, lots: P.lotRows.length };
  }, [items, P]);

  async function pickFile(f: File | undefined) {
    setFileErr(''); setPreviews(null); if (!f) return;
    try {
      const secs = parseAgingReport(await f.arrayBuffer()).filter(s => s.community);
      if (!secs.length) throw new Error('No community section found. Use the QDEF "Outstanding Aging - Details" report.');
      const out: Preview[] = [];
      for (const sec of secs) {
        const have = await loadOpen(sec.community);
        const inFile = new Set(sec.rows.map(r => Number(r.wo)));
        const known = new Set(have.map(h => h.wo_number));
        out.push({ sec, fresh: sec.rows.filter(r => !known.has(Number(r.wo))).length, same: sec.rows.filter(r => known.has(Number(r.wo))).length, leaving: have.filter(h => !inFile.has(h.wo_number)).length, busy: false, done: '', err: '' });
      }
      setPreviews(out);
    } catch (e: any) { setFileErr(e.message ?? String(e)); }
  }
  async function doImport(idx: number) {
    const p = previews?.[idx]; if (!p || p.busy) return;
    const upd = (x: Partial<Preview>) => setPreviews(cur => cur && cur.map((q, i) => (i === idx ? { ...q, ...x } : q)));
    upd({ busy: true, err: '' });
    const { data, error } = await supabase.rpc('qdef_wo_import', { p_community: p.sec.community, p_report_date: p.sec.reportDate, p_rows: p.sec.rows });
    if (error) { upd({ busy: false, err: error.message }); return; }
    const d = data as { added: number; updated: number; left_report: number };
    upd({ busy: false, done: `Imported: ${n(d.added)} new, ${n(d.updated)} updated, ${n(d.left_report)} left the report.` });
    setCommunity(p.sec.community); reload();
  }

  const shownLots = P.lotRows.slice(0, shown);

  return (
    <div>
      {/* Import */}
      <div style={{ ...panel, padding: '14px 18px', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 14 }}>Update from QDEF</b>
          <input type="file" accept=".xls,.xlsx" onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ''; }} style={{ fontSize: 13 }} />
          <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>Upload the Outstanding Aging - Details report. The community and date come from the file. Phone numbers are never read.</span>
        </div>
        {fileErr && <div style={{ color: '#A5402F', fontSize: 13, marginTop: 8 }}>{fileErr}</div>}
        {previews && previews.map((p, i) => (
          <div key={p.sec.community + i} style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)', fontSize: 13 }}>
            <b>{p.sec.community}</b><span>report of {p.sec.reportDate}</span>
            <span>{n(p.sec.rows.length)} work orders{p.sec.declared !== p.sec.rows.length ? ` (report says ${n(p.sec.declared)})` : ''}</span>
            <span>{n(p.fresh)} new</span><span>{n(p.same)} already here</span><span>{n(p.leaving)} no longer on the report</span>
            {p.done ? <span style={{ color: '#2E6B4F', fontWeight: 700 }}>{p.done}</span>
              : <button style={btn(true, p.busy)} disabled={p.busy} onClick={() => doImport(i)}>{p.busy ? 'Importing…' : 'Import'}</button>}
            {p.err && <span style={{ color: '#A5402F' }}>{p.err}</span>}
          </div>
        ))}
      </div>

      {err && <div style={{ color: '#A5402F', fontSize: 13 }}>Could not load work orders: {err}</div>}
      {!all && !err && <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>Loading…</div>}
      {all && all.length === 0 && <div style={{ ...panel, padding: 28, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>No work orders loaded yet. Upload a QDEF aging report above to start.</div>}

      {all && all.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <select value={community} onChange={e => setCommunity(e.target.value)} style={sel}>{communities.map(c => <option key={c}>{c}</option>)}</select>
            <button style={btn(false)} onClick={() => setHtml(buildPlanHtml(communities.map(c => ({ c, items: all.filter(i => i.community === c) }))))}>Print plan, all communities</button>
            <button style={btn(false)} onClick={() => setHtml(buildPlanHtml([{ c: community, items }]))}>Print this community</button>
          </div>

          <div style={{ ...panel, padding: '18px 22px', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 14 }}>
              <Tile label="Open work orders" value={n(items.length)} />
              <Tile label="Homes" value={n(counts.lots)} />
              <Tile label="Average age, days" value={n(counts.avg)} />
              <Tile label="Over 120 days" value={n(counts.b[4])} color="#A5402F" />
              <Tile label="Urgent wording" value={n(P.urgent.length)} color={P.urgent.length ? '#A5402F' : undefined} />
              <Tile label="Not booked, over 60 days" value={n(P.booking.length)} />
            </div>
            <div style={{ display: 'flex', height: 18, gap: 2 }}>
              {BUCKETS.map((b, i) => counts.b[i] > 0 && <div key={b.label} title={`${b.label} days: ${counts.b[i]}`} style={{ flex: counts.b[i], background: b.color, borderRadius: 2, minWidth: 2 }} />)}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
              {BUCKETS.map((b, i) => <span key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--color-text-sub)' }}><span style={{ width: 10, height: 10, borderRadius: 2, background: b.color }} />{b.label} days: {n(counts.b[i])}</span>)}
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-sub)', margin: '12px 0 0', lineHeight: 1.5, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>{T.text}</p>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {([['super', 'Site supervisor'], ['coord', 'Coordinator'], ['trades', 'Trades']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{ ...btn(tab === k) }}>{l}</button>
            ))}
          </div>

          {tab === 'super' && (
            <>
              <Section title="Book these trades in one sweep" sub="A trade with open items in two or more homes: send them once, clear the list.">
                {P.batches.length === 0 && <Empty text="No trade has open items in more than one home." />}
                {P.batches.slice(0, 8).map(b => (
                  <Line key={b.trade} a={<b>{b.trade}</b>} b={`${n(b.items.length)} items in ${n(b.homes.size)} homes, average ${b.avg} days`} c={`${n(b.items.filter(i => !i.scheduled_date).length)} not booked`} />
                ))}
              </Section>
              <Section title="Homes to walk first" sub="Urgent wording first, then most items over 120 days, then oldest.">
                {shownLots.map(l => (
                  <div key={l.key} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <div onClick={() => setOpenLot(openLot === l.key ? '' : l.key)} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 70px 80px 80px 80px', gap: 10, padding: '9px 0', cursor: 'pointer', fontSize: 13, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700 }}>{l.lot} {l.label}</span><span style={{ color: 'var(--color-text-sub)' }}>{l.owner}</span>
                      <span style={{ textAlign: 'right' }}>{l.items.length} open</span><span style={{ textAlign: 'right' }}>oldest {l.oldest}</span>
                      <span style={{ textAlign: 'right', color: l.over120 ? '#A5402F' : undefined }}>{l.over120} over 120</span><span style={{ textAlign: 'right', color: l.urgent ? '#A5402F' : undefined, fontWeight: l.urgent ? 700 : 400 }}>{l.urgent ? `${l.urgent} urgent` : ''}</span>
                    </div>
                    {openLot === l.key && <div style={{ paddingBottom: 8 }}>{l.items.sort((a, b) => b.age_days - a.age_days).map(i => <ItemRow key={i.wo_number} i={i} />)}</div>}
                  </div>
                ))}
                {P.lotRows.length > shown && <div style={{ padding: 10, textAlign: 'center' }}><button style={btn(false)} onClick={() => setShown(shown + 25)}>Show 25 more homes ({n(P.lotRows.length - shown)} left)</button></div>}
              </Section>
            </>
          )}

          {tab === 'coord' && (
            <>
              <Section title={`Urgent wording (${n(P.urgent.length)})`} sub="Leaks, moisture, no heat, smoke or CO alarms and similar. Call the homeowner and dispatch first, at any age.">
                {P.urgent.length === 0 && <Empty text="None found in the item wording." />}
                {P.urgent.slice(0, 40).map(i => <ItemRow key={i.wo_number} i={i} showHome />)}
              </Section>
              <Section title={`Book these (${n(P.booking.length)})`} sub="No scheduled date and open more than 60 days. Oldest first.">
                {P.booking.slice(0, 40).map(i => <ItemRow key={i.wo_number} i={i} showHome />)}
                {P.booking.length > 40 && <More k={P.booking.length - 40} />}
              </Section>
              <Section title={`Booked date has passed (${n(P.stale.length)})`} sub="A visit was scheduled and the work order is still open. Confirm it was done or rebook.">
                {P.stale.length === 0 && <Empty text="None." />}
                {P.stale.slice(0, 40).map(i => <ItemRow key={i.wo_number} i={i} showHome />)}
              </Section>
              <Section title={`Tarion risk has passed (${n(P.closeReady.length)})`} sub="Closed more than two years ago. Candidates for a final notice to the homeowner, then closing.">
                {P.closeReady.length === 0 && <Empty text="None." />}
                {P.closeReady.slice(0, 40).map(i => <ItemRow key={i.wo_number} i={i} showHome />)}
                {P.closeReady.length > 40 && <More k={P.closeReady.length - 40} />}
              </Section>
              <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '4px 2px 0' }}>Homeowner contact attempts and parts backorders are not on the QDEF report, so those queues are not shown yet.</p>
            </>
          )}

          {tab === 'trades' && (
            <Section title="Trades, worst first" sub="Open work orders by age since creation. Days to close counts work orders that left the report in the last 90 days; it sharpens as you import more often.">
              {!stats && <Empty text="Loading…" />}
              {stats && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 60px 60px 60px 60px 60px 60px 70px 80px', gap: 8, padding: '8px 0', fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)' }}>
                    <span>Trade</span><span style={{ textAlign: 'right' }}>Open</span><span style={{ textAlign: 'right' }}>Avg</span><span style={{ textAlign: 'right' }}>Median</span><span style={{ textAlign: 'right' }}>&gt;30</span><span style={{ textAlign: 'right' }}>&gt;60</span><span style={{ textAlign: 'right' }}>&gt;90</span><span style={{ textAlign: 'right' }}>&gt;120</span><span style={{ textAlign: 'right' }}>Closed, avg days</span>
                  </div>
                  {[...stats].filter(s => s.open_count > 0 || s.closed_count > 0).sort((a, b) => b.over60 - a.over60 || b.open_count - a.open_count).map(s => (
                    <div key={s.trade} style={{ display: 'grid', gridTemplateColumns: '2fr 60px 60px 60px 60px 60px 60px 70px 80px', gap: 8, padding: '8px 0', borderTop: '1px solid var(--color-border)', fontSize: 13 }}>
                      <b>{s.trade}</b><span style={{ textAlign: 'right' }}>{n(s.open_count)}</span><span style={{ textAlign: 'right' }}>{s.open_avg ?? '—'}</span><span style={{ textAlign: 'right' }}>{s.open_median ?? '—'}</span>
                      <span style={{ textAlign: 'right' }}>{n(s.over30)}</span><span style={{ textAlign: 'right' }}>{n(s.over60)}</span><span style={{ textAlign: 'right' }}>{n(s.over90)}</span><span style={{ textAlign: 'right', color: s.over120 ? '#A5402F' : undefined, fontWeight: s.over120 ? 700 : 400 }}>{n(s.over120)}</span>
                      <span style={{ textAlign: 'right' }}>{s.closed_count ? `${n(s.closed_count)} / ${s.closed_avg}` : '—'}</span>
                    </div>
                  ))}
                </>
              )}
            </Section>
          )}
        </>
      )}

      {html && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(20,28,40,.6)', zIndex: 2000, display: 'flex', flexDirection: 'column', padding: 24, boxSizing: 'border-box' }}>
          <div style={{ ...panel, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#fff' }}>
            <div style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--color-border)', alignItems: 'center' }}>
              <b style={{ fontSize: 14 }}>Game plan</b><span style={{ flex: 1 }} />
              <button style={btn(false)} onClick={() => (document.getElementById('gameplan-frame') as HTMLIFrameElement | null)?.contentWindow?.print()}>Print or save as PDF</button>
              <button style={btn(true)} onClick={() => setHtml('')}>Close</button>
            </div>
            <iframe id="gameplan-frame" title="Game plan" srcDoc={html} style={{ flex: 1, border: 0, minHeight: 0 }} />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ ...panel, padding: '14px 18px', marginBottom: 12 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: 12.5, color: 'var(--color-text-sub)', margin: '3px 0 8px' }}>{sub}</p>}
      {children}
    </div>
  );
}
const Empty = ({ text }: { text: string }) => <div style={{ fontSize: 13, color: 'var(--color-muted)', padding: '8px 0' }}>{text}</div>;
const More = ({ k }: { k: number }) => <div style={{ fontSize: 12, color: 'var(--color-muted)', padding: '8px 0' }}>{n(k)} more. Print the plan for the full list.</div>;
function Line({ a, b, c }: { a: React.ReactNode; b: string; c: string }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 2fr 110px', gap: 10, padding: '8px 0', borderTop: '1px solid var(--color-border)', fontSize: 13 }}><span>{a}</span><span style={{ color: 'var(--color-text-sub)' }}>{b}</span><span style={{ textAlign: 'right' }}>{c}</span></div>;
}
function ItemRow({ i, showHome }: { i: Open; showHome?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: showHome ? '150px 1fr 140px 60px' : '1fr 140px 60px', gap: 10, padding: '6px 0', borderTop: '1px solid var(--color-border)', fontSize: 12.5, alignItems: 'baseline' }}>
      {showHome && <span style={{ fontWeight: 600 }}>{i.lot_number} {i.address ?? ''}</span>}
      <span>{i.urgent_word && <b style={{ color: '#A5402F' }}>{i.urgent_word}: </b>}{short(i.description, 140)}</span>
      <span style={{ color: 'var(--color-text-sub)' }}>{i.trade}{i.scheduled_date ? `, booked ${i.scheduled_date}` : ', not booked'}</span>
      <span style={{ textAlign: 'right', fontWeight: 700, color: i.age_days > 120 ? '#A5402F' : undefined }}>{i.age_days} d</span>
    </div>
  );
}
function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return <div><div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: color ?? 'var(--color-text)' }}>{value}</div><div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginTop: 4 }}>{label}</div></div>;
}

// One community per printed page set.
function buildPlanHtml(groups: { c: string; items: Open[] }[]): string {
  const today = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const css = `body{font-family:Georgia,'Times New Roman',serif;color:#1F2A3C;margin:0;font-size:11.5px}
  .c{page-break-before:always;padding:6px 4px}.c:first-child{page-break-before:auto}
  h1{font-size:20px;margin:0 0 2px}h2{font-size:13.5px;margin:16px 0 4px;border-bottom:2px solid #B08D4F;padding-bottom:2px}
  .t{display:flex;gap:22px;margin:8px 0}.t b{font-size:20px;display:block}.t span{font-size:10.5px;color:#5b6577}
  table{border-collapse:collapse;width:100%;margin-top:3px}td,th{border-bottom:1px solid #ddd6c6;padding:3px 5px;text-align:left;vertical-align:top}th{font-size:10.5px;color:#5b6577}
  td.r,th.r{text-align:right}.red{color:#A5402F;font-weight:700}.note{font-size:11px;color:#3d4758;line-height:1.45}
  @page{margin:14mm}tr{page-break-inside:avoid}`;
  const body = groups.map(({ c, items }) => {
    const P = plan(items); const T = tarionBlurb(items);
    const b = BUCKETS.map(() => 0); items.forEach(i => { b[bucketOf(i.age_days)]++; });
    const row = (i: Open) => `<tr><td>${esc(i.lot_number)} ${esc(i.address ?? '')}</td><td>${i.urgent_word ? `<span class="red">${esc(i.urgent_word)}:</span> ` : ''}${esc(short(i.description, 120))}</td><td>${esc(i.trade)}</td><td>${i.scheduled_date ? esc(i.scheduled_date) : 'not booked'}</td><td class="r">${i.age_days}</td></tr>`;
    const head = '<tr><th>Home</th><th>Item</th><th>Trade</th><th>Booked</th><th class="r">Days</th></tr>';
    return `<div class="c"><h1>${esc(c)}: game plan</h1><div class="note">${today}. Days are counted from the day each work order was created.</div>
    <div class="t"><div><b>${n(items.length)}</b><span>open work orders</span></div><div><b>${n(P.lotRows.length)}</b><span>homes</span></div><div><b class="red">${n(b[4])}</b><span>over 120 days</span></div><div><b>${n(P.urgent.length)}</b><span>urgent wording</span></div><div><b>${n(P.booking.length)}</b><span>not booked, over 60 days</span></div></div>
    <div class="note">${BUCKETS.map((x, k) => `${x.label}: ${n(b[k])}`).join(' &nbsp;|&nbsp; ')}</div>
    <div class="note" style="margin-top:6px">${esc(T.text)}</div>
    <h2>Site supervisor: book these trades in one sweep</h2>
    <table><tr><th>Trade</th><th class="r">Items</th><th class="r">Homes</th><th class="r">Avg days</th><th class="r">Not booked</th></tr>${P.batches.slice(0, 8).map(x => `<tr><td>${esc(x.trade)}</td><td class="r">${x.items.length}</td><td class="r">${x.homes.size}</td><td class="r">${x.avg}</td><td class="r">${x.items.filter(i => !i.scheduled_date).length}</td></tr>`).join('') || '<tr><td colspan="5">None.</td></tr>'}</table>
    <h2>Site supervisor: homes to walk first</h2>
    <table><tr><th>Home</th><th>Owner</th><th class="r">Open</th><th class="r">Oldest</th><th class="r">Over 120</th><th class="r">Urgent</th></tr>${P.lotRows.slice(0, 15).map(l => `<tr><td>${esc(l.lot)} ${esc(l.label)}</td><td>${esc(l.owner)}</td><td class="r">${l.items.length}</td><td class="r">${l.oldest}</td><td class="r">${l.over120}</td><td class="r ${l.urgent ? 'red' : ''}">${l.urgent || ''}</td></tr>`).join('')}</table>
    <h2>Coordinator: urgent wording (${P.urgent.length})</h2><table>${head}${P.urgent.slice(0, 25).map(row).join('') || '<tr><td colspan="5">None.</td></tr>'}</table>
    <h2>Coordinator: book these (${P.booking.length}, oldest first)</h2><table>${head}${P.booking.slice(0, 30).map(row).join('') || '<tr><td colspan="5">None.</td></tr>'}</table>
    <h2>Coordinator: tarion risk has passed, final notice then close (${P.closeReady.length})</h2><table>${head}${P.closeReady.slice(0, 20).map(row).join('') || '<tr><td colspan="5">None.</td></tr>'}</table>
    </div>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
}
