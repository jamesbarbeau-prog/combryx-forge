// Warranty performance reports: deficiencies per trade, per technician, and recurring issues per trade.
// Route: /warranty/reports/deficiencies?tab=trade|tech|recurring
// Aging in every table is days since the home's closing date, open items only.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface TradeRow { trade: string; items: number; open_items: number; closed_items: number; not_warranty: number; homes_open: number; open_120p: number; open_300p: number; avg_open_age: number | null; oldest_open: number | null; on_work_order: number }
interface TechRow { tech: string; work_orders: number; items_assigned: number; items_done: number; orders_complete: number; no_shows: number; owner_unhappy: number; avg_days_to_complete: number | null }
interface IssueRow { trade: string; theme: string; items: number; open_items: number; homes: number; communities: number; repeat_homes: number; avg_open_age: number | null; share_of_trade: number }
interface Sample { item_id: string; lot_id: string; address: string | null; community: string | null; status: string; age_days: number | null; description: string }
interface Community { id: string; name: string }

const TABS = [['trade', 'By trade'], ['tech', 'By technician'], ['recurring', 'Recurring issues']] as const;
type Tab = typeof TABS[number][0];
const panel: React.CSSProperties = { background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 12 };
const sel: React.CSSProperties = { height: 36, borderRadius: 8, border: '1px solid var(--color-border-hard)', background: '#fff', padding: '0 10px', fontSize: 13, fontFamily: 'inherit' };
const th: React.CSSProperties = { textAlign: 'left', padding: '9px 12px', fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 13.5, borderBottom: '1px solid var(--color-border)' };
const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const numH: React.CSSProperties = { ...th, textAlign: 'right' };
const n = (v: number | null | undefined) => v == null ? '–' : Number(v).toLocaleString('en-CA');
const IN_HOUSE = /^(claridge technician|inspector)/i;

function csv(name: string, header: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob([[header, ...rows].map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return <div style={{ height: 8, background: 'var(--color-mist)', borderRadius: 4, minWidth: 80 }}><div style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%`, height: '100%', background: color, borderRadius: 4 }} /></div>;
}

export default function DeficiencyReportsPage() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = ((sp.get('tab') as Tab) || 'trade');
  const setTab = (t: Tab) => setSp({ tab: t });

  const [communities, setCommunities] = useState<Community[]>([]);
  const [community, setCommunity] = useState('');
  const [hideInHouse, setHideInHouse] = useState(false);
  const [trades, setTrades] = useState<TradeRow[] | null>(null);
  const [techs, setTechs] = useState<TechRow[] | null>(null);
  const [issues, setIssues] = useState<IssueRow[] | null>(null);
  const [tradePick, setTradePick] = useState('');
  const [openIssue, setOpenIssue] = useState<IssueRow | null>(null);
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => { supabase.from('warranty_communities').select('id,name').order('name').then(({ data }) => setCommunities((data ?? []) as Community[])); }, []);

  useEffect(() => {
    if (tab !== 'trade') return; let live = true; setTrades(null); setErr('');
    supabase.rpc('trade_deficiency_report', { p_community: community || null }).then(({ data, error }) => { if (!live) return; if (error) setErr(error.message); else setTrades((data ?? []) as TradeRow[]); });
    return () => { live = false; };
  }, [tab, community]);
  useEffect(() => {
    if (tab !== 'tech') return; let live = true; setTechs(null); setErr('');
    supabase.rpc('tech_deficiency_report', { p_audience: 'tech' }).then(({ data, error }) => { if (!live) return; if (error) setErr(error.message); else setTechs((data ?? []) as TechRow[]); });
    return () => { live = false; };
  }, [tab]);
  useEffect(() => {
    if (tab !== 'recurring') return; let live = true; setIssues(null); setErr('');
    supabase.rpc('recurring_issues', { p_trade: tradePick || null, p_min: tradePick ? 3 : 25 }).then(({ data, error }) => { if (!live) return; if (error) setErr(error.message); else setIssues((data ?? []) as IssueRow[]); });
    return () => { live = false; };
  }, [tab, tradePick]);
  useEffect(() => {
    if (!openIssue) { setSamples(null); return; } let live = true; setSamples(null);
    supabase.rpc('issue_samples', { p_trade: openIssue.trade, p_theme: openIssue.theme }).then(({ data }) => { if (live) setSamples((data ?? []) as Sample[]); });
    return () => { live = false; };
  }, [openIssue]);

  const tradeRows = useMemo(() => (trades ?? []).filter(r => !hideInHouse || !IN_HOUSE.test(r.trade)), [trades, hideInHouse]);
  const issueRows = useMemo(() => (issues ?? []).filter(r => tradePick || !hideInHouse || !IN_HOUSE.test(r.trade)), [issues, hideInHouse, tradePick]);
  const maxOpen = Math.max(1, ...tradeRows.map(r => r.open_items));
  const maxIssue = Math.max(1, ...issueRows.map(r => r.open_items));

  return (
    <div style={{ padding: '26px 32px', maxWidth: 1250, fontFamily: 'var(--font-body)', color: 'var(--color-text)' }}>
      <button onClick={() => nav('/warranty/reports')} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 12.5, padding: 0, fontFamily: 'inherit', marginBottom: 10 }}><ArrowLeft size={13} /> Reports</button>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Deficiency reports</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-sub)', margin: '4px 0 16px', maxWidth: 760 }}>
        Where the deficiencies sit and who they belong to. Age is days since the home closed, counted on open items only.
      </p>

      <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border)', marginBottom: 16 }}>
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            style={{ padding: '10px 16px', fontSize: 13.5, fontWeight: tab === k ? 700 : 500, color: tab === k ? 'var(--color-navy)' : 'var(--color-text-sub)', background: 'none', border: 'none', borderBottom: tab === k ? '2px solid var(--color-brass, #8D7140)' : '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1 }}>{label}</button>
        ))}
      </div>

      {err && <p style={{ color: '#A5402F', fontSize: 13 }}>{err}</p>}

      {tab === 'trade' && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <select aria-label="Community" style={sel} value={community} onChange={e => setCommunity(e.target.value)}>
              <option value="">All communities</option>{communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={hideInHouse} onChange={e => setHideInHouse(e.target.checked)} /> Outside trades only</label>
            <span style={{ flex: 1 }} />
            <button style={{ ...sel, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} disabled={!tradeRows.length}
              onClick={() => csv('deficiencies-by-trade.csv', ['Trade', 'Items', 'Open', 'Closed', 'Not warranty or duplicate', 'Homes with open items', 'Open over 120 days', 'Open over 300 days', 'Average open age (days)', 'Oldest open (days)', 'Open and on a work order'], tradeRows.map(r => [r.trade, r.items, r.open_items, r.closed_items, r.not_warranty, r.homes_open, r.open_120p, r.open_300p, r.avg_open_age, r.oldest_open, r.on_work_order]))}><Download size={14} /> Download CSV</button>
          </div>
          <div style={{ ...panel, overflowX: 'auto' }}>
            {!trades ? <p style={{ padding: 20, fontSize: 13, color: 'var(--color-muted)' }}>Loading…</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Trade</th><th style={th} aria-label="Open items bar" /><th style={numH}>Open</th><th style={numH}>Closed</th><th style={numH}>Homes</th><th style={numH}>Over 120 d</th><th style={numH}>Over 300 d</th><th style={numH}>Avg age (d)</th><th style={numH}>On a work order</th></tr></thead>
                <tbody>{tradeRows.map(r => (
                  <tr key={r.trade}>
                    <td style={td}><button onClick={() => { setTradePick(r.trade); setTab('recurring'); }} title="See this trade's recurring issues" style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 600, cursor: 'pointer', color: 'var(--color-navy)', textAlign: 'left' }}>{r.trade}</button></td>
                    <td style={{ ...td, width: 160 }}><Bar value={r.open_items} max={maxOpen} color={r.open_300p / Math.max(1, r.open_items) > 0.5 ? '#A5402F' : '#8D7140'} /></td>
                    <td style={num}>{n(r.open_items)}</td><td style={num}>{n(r.closed_items)}</td><td style={num}>{n(r.homes_open)}</td>
                    <td style={num}>{n(r.open_120p)}</td><td style={{ ...num, color: r.open_300p ? '#A5402F' : undefined, fontWeight: r.open_300p ? 700 : 400 }}>{n(r.open_300p)}</td>
                    <td style={num}>{n(r.avg_open_age)}</td><td style={num}>{n(r.on_work_order)}</td>
                  </tr>))}
                  {!tradeRows.length && <tr><td style={td} colSpan={9}>No items with a trade yet.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 10 }}>Trade names are merged across spellings and pre-close versions. Click a trade to see what keeps coming back for it.</p>
        </>
      )}

      {tab === 'tech' && (
        <>
          <div style={{ ...panel, overflowX: 'auto' }}>
            {!techs ? <p style={{ padding: 20, fontSize: 13, color: 'var(--color-muted)' }}>Loading…</p> : techs.length === 0 ? (
              <div style={{ padding: 24, fontSize: 13.5, maxWidth: 640, lineHeight: 1.55 }}>
                <b>No in-house technician work orders yet.</b>
                <p style={{ margin: '6px 0 0', color: 'var(--color-text-sub)' }}>This report counts work orders sent to in-house technicians and who they were assigned to: items finished, no-shows, owner complaints and days to complete. It fills in as technician work orders are booked and assigned.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Technician</th><th style={numH}>Work orders</th><th style={numH}>Items assigned</th><th style={numH}>Items done</th><th style={numH}>Orders finished</th><th style={numH}>No-shows</th><th style={numH}>Owner unhappy</th><th style={numH}>Avg days to finish</th></tr></thead>
                <tbody>{techs.map(r => (
                  <tr key={r.tech}><td style={{ ...td, fontWeight: 600 }}>{r.tech}</td><td style={num}>{n(r.work_orders)}</td><td style={num}>{n(r.items_assigned)}</td><td style={num}>{n(r.items_done)}</td><td style={num}>{n(r.orders_complete)}</td><td style={num}>{n(r.no_shows)}</td><td style={num}>{n(r.owner_unhappy)}</td><td style={num}>{n(r.avg_days_to_complete)}</td></tr>))}
                </tbody>
              </table>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 10 }}>Work orders with no technician set appear as "Not assigned yet". Items are not tied to a technician until a work order is assigned.</p>
        </>
      )}

      {tab === 'recurring' && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            {tradePick
              ? <button style={{ ...sel, cursor: 'pointer', fontWeight: 600 }} onClick={() => { setTradePick(''); setOpenIssue(null); }}>{tradePick} ✕ Show all trades</button>
              : <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={hideInHouse} onChange={e => setHideInHouse(e.target.checked)} /> Outside trades only</label>}
            <span style={{ flex: 1 }} />
            <button style={{ ...sel, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} disabled={!issueRows.length}
              onClick={() => csv('recurring-issues-by-trade.csv', ['Trade', 'Issue', 'Items', 'Open', 'Homes', 'Communities', 'Homes with 2 or more', 'Average open age (days)', 'Share of trade items (%)'], issueRows.map(r => [r.trade, r.theme, r.items, r.open_items, r.homes, r.communities, r.repeat_homes, r.avg_open_age, r.share_of_trade]))}><Download size={14} /> Download CSV</button>
          </div>
          <div style={{ ...panel, overflowX: 'auto' }}>
            {!issues ? <p style={{ padding: 20, fontSize: 13, color: 'var(--color-muted)' }}>Loading…</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Trade</th><th style={th}>Recurring issue</th><th style={th} aria-label="Open items bar" /><th style={numH}>Open</th><th style={numH}>All items</th><th style={numH}>Homes</th><th style={numH}>Communities</th><th style={numH}>Homes with 2+</th><th style={numH}>Share of trade</th></tr></thead>
                <tbody>{issueRows.map(r => (
                  <tr key={r.trade + r.theme} onClick={() => setOpenIssue(openIssue === r ? null : r)} style={{ cursor: 'pointer', background: openIssue === r ? 'var(--color-mist)' : undefined }}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.trade}</td><td style={td}>{r.theme}</td>
                    <td style={{ ...td, width: 130 }}><Bar value={r.open_items} max={maxIssue} color="#3F6A8F" /></td>
                    <td style={num}>{n(r.open_items)}</td><td style={num}>{n(r.items)}</td><td style={num}>{n(r.homes)}</td><td style={num}>{n(r.communities)}</td><td style={num}>{n(r.repeat_homes)}</td><td style={num}>{r.share_of_trade}%</td>
                  </tr>))}
                  {!issueRows.length && <tr><td style={td} colSpan={9}>Nothing recurring at this size.</td></tr>}
                </tbody>
              </table>
            )}
          </div>

          {openIssue && (
            <div style={{ ...panel, marginTop: 16, padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{openIssue.trade}: {openIssue.theme}</div>
              <div style={{ fontSize: 12.5, color: 'var(--color-text-sub)', marginBottom: 10 }}>Open items first, oldest closing first. Up to 40 shown.</div>
              {!samples ? <p style={{ fontSize: 13 }}>Loading…</p> : samples.map(s => (
                <div key={s.item_id} style={{ display: 'grid', gridTemplateColumns: '220px 80px 1fr', gap: 12, padding: '8px 0', borderTop: '1px solid var(--color-border)', fontSize: 13 }}>
                  <button onClick={() => nav(`/warranty/lots/${s.lot_id}`)} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', font: 'inherit', fontWeight: 600, color: 'var(--color-navy)', cursor: 'pointer' }}>{s.address ?? 'Address not on file'}<span style={{ display: 'block', fontWeight: 400, fontSize: 12, color: 'var(--color-muted)' }}>{s.community}</span></button>
                  <span>{s.status === 'outstanding' ? (s.age_days != null ? `${s.age_days} d` : 'Open') : 'Closed'}</span>
                  <span style={{ color: 'var(--color-text-sub)' }}>{s.description}</span>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 10 }}>Issues are grouped by keywords in the item description (for example nail pops, paint touch-up, door adjustment). "Homes with 2+" counts homes where the same trade had the same issue more than once.</p>
        </>
      )}
    </div>
  );
}
