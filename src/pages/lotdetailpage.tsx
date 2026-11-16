/**
 * COMBRYX — Owner's file (lot page)
 * Route: /warranty/lots/:id            -> owner info, status chart, and a chooser of files
 *        /warranty/lots/:id?file=qci   -> the items of one file (service, pdi, qci, initial, mid_year, year_end, second_year, msd, work_orders)
 * Data: warranty_lots + rpc lot_file_summary + work_orders
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  Home, ChevronLeft, RefreshCw, AlertTriangle, Mail, Phone, Wrench, Calendar, User, Hash,
  ClipboardCheck, Shield, FileText, LifeBuoy, Building2, Layers, Clock, ChevronRight,
} from 'lucide-react';
import LotInspections from '@/components/lotinspections';
import LotFileItems from '@/components/lotfileitems';

interface LotDetail {
  id: string; lot_number: string; model: string | null; address: string | null; civic_number: string | null; street: string | null;
  city: string | null; province: string | null; postal_code: string | null; homeowner_name: string | null; homeowner_first: string | null;
  homeowner_last: string | null; owner2_first: string | null; owner2_last: string | null; homeowner_email: string | null;
  homeowner_email2: string | null; phone_primary: string | null; phone_secondary: string | null; phone_tertiary: string | null;
  enrollment_number: string | null; closing_date: string | null; notes: string | null; is_assigned: boolean | null;
  community_id: string; community_name: string;
}

interface FileSummary {
  key: string; open: number; closed: number; other: number; oldest_open_days: number | null;
  buckets: { d30: number; d60: number; d90: number; d90p: number };
  cases: { id: string; case_number: string; status: string; opened_at: string }[];
  inspections: number; inspections_in_progress: number;
}

interface WorkOrderRow { id: string; wo_number: string; description: string | null; status: string; trade_name: string | null; scheduled_date: string | null; created_at: string }

const FILES: { key: string; label: string; sub: string; icon: any }[] = [
  { key: 'service',     label: 'Service requests', sub: 'Calls and emergencies',        icon: LifeBuoy },
  { key: 'pdi',         label: 'PDI',              sub: 'Pre-delivery inspection',      icon: ClipboardCheck },
  { key: 'qci',         label: 'QCI',              sub: 'Quality control inspection',   icon: ClipboardCheck },
  { key: 'initial',     label: 'Initial',          sub: 'Statutory 30-day form',        icon: FileText },
  { key: 'mid_year',    label: 'Mid-Year',         sub: 'Statutory 6-month form',       icon: FileText },
  { key: 'year_end',    label: '1-Year',           sub: 'Statutory year-end form',      icon: FileText },
  { key: 'second_year', label: '2-Year',           sub: 'Statutory 2-year form',        icon: FileText },
  { key: 'msd',         label: 'MSD',              sub: 'Major structural defects',     icon: Building2 },
];

const WO_STATUS: Record<string, [string, string, string]> = {
  open: ['Open', '#3F6A8F', 'rgba(30,95,164,0.10)'], in_progress: ['In progress', '#9A6A16', 'rgba(217,119,6,0.10)'],
  scheduled: ['Scheduled', '#3F6A8F', 'rgba(30,95,164,0.10)'], complete: ['Complete', '#4A7A55', 'rgba(22,163,74,0.10)'],
  resolved: ['Resolved', '#4A7A55', 'rgba(22,163,74,0.10)'], closed: ['Closed', '#6C7280', 'rgba(107,114,128,0.10)'],
  cancelled: ['Cancelled', '#6C7280', 'rgba(107,114,128,0.10)'],
};

const OPEN = '#B08D4F', CLOSED = '#4A7A55', OTHER = '#C6BDAC';
const AGE_COLORS = ['#E3CFA3', '#C9A96A', '#9A6A16', '#A5402F'];
const panel: React.CSSProperties = { background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 12 };

export default function LotDetailPage() {
  const navigate = useNavigate();
  const { id: lotId } = useParams<{ id: string }>();
  const [sp, setSp] = useSearchParams();
  const file = sp.get('file');

  const [lot, setLot] = useState<LotDetail | null>(null);
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { if (lotId) load(); }, [lotId]);

  async function load() {
    setLoading(true); setError('');
    try {
      const { data: lotData, error: lotErr } = await supabase.from('warranty_lots').select(`
          id, lot_number, model, address, civic_number, street, city, province, postal_code,
          homeowner_name, homeowner_first, homeowner_last, owner2_first, owner2_last,
          homeowner_email, homeowner_email2, phone_primary, phone_secondary, phone_tertiary,
          enrollment_number, closing_date, notes, is_assigned, community_id, warranty_communities(name)
        `).eq('id', lotId!).single();
      if (lotErr) throw new Error(lotErr.message);
      if (!lotData) throw new Error('Lot not found');
      setLot({ ...(lotData as any), community_name: (lotData.warranty_communities as any)?.name ?? '—' });

      const [sum, wo] = await Promise.all([
        supabase.rpc('lot_file_summary', { p_lot: lotId! }),
        supabase.from('work_orders').select('id, wo_number, description, status, scheduled_date, created_at, trades(name)').eq('lot_id', lotId!).order('created_at', { ascending: false }),
      ]);
      setFiles(((sum.data as any)?.files ?? []) as FileSummary[]);
      setWorkOrders(((wo.data ?? []) as any[]).map(w => ({ id: w.id, wo_number: w.wo_number, description: w.description, status: w.status, trade_name: w.trades?.name ?? null, scheduled_date: w.scheduled_date, created_at: w.created_at })));
    } catch (e: any) {
      setError(e.message || 'Failed to load this home');
    } finally { setLoading(false); }
  }

  const tot = useMemo(() => files.reduce((a, f) => ({
    open: a.open + f.open, closed: a.closed + f.closed, other: a.other + f.other,
    d30: a.d30 + f.buckets.d30, d60: a.d60 + f.buckets.d60, d90: a.d90 + f.buckets.d90, d90p: a.d90p + f.buckets.d90p,
    oldest: Math.max(a.oldest, f.oldest_open_days ?? 0),
  }), { open: 0, closed: 0, other: 0, d30: 0, d60: 0, d90: 0, d90p: 0, oldest: 0 }), [files]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
      <div style={{ textAlign: 'center' }}>
        <RefreshCw size={24} color="var(--color-muted)" style={{ animation: 'spin 0.8s linear infinite', marginBottom: 12 }} />
        <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Loading this home…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
  if (error || !lot) return (
    <div style={{ padding: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 10, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', maxWidth: 500 }}>
        <AlertTriangle size={16} color="#A5402F" />
        <p style={{ fontSize: 13, color: '#A5402F' }}>{error || 'Home not found'}</p>
        <button onClick={load} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(220,38,38,0.2)', background: 'rgba(220,38,38,0.1)', color: '#A5402F', fontSize: 12, cursor: 'pointer' }}>Retry</button>
      </div>
    </div>
  );

  const ownerNames = (lot.homeowner_name ?? `${lot.homeowner_first ?? ''} ${lot.homeowner_last ?? ''}`).trim();
  const owner2 = `${lot.owner2_first ?? ''} ${lot.owner2_last ?? ''}`.trim();
  const addr = lot.address ?? (`${lot.civic_number ?? ''} ${lot.street ?? ''}`).trim();
  const closing = lot.closing_date ? new Date(lot.closing_date).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
  const meta = FILES.find(f => f.key === file);
  const sumOf = (k: string) => files.find(f => f.key === k);

  const crumbs = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
      <button onClick={() => navigate('/warranty/communities')} style={crumbBtn}><ChevronLeft size={13} /> Portfolio</button>
      <span style={{ color: 'var(--color-border)' }}>/</span>
      <button onClick={() => navigate(`/warranty/communities/${lot.community_id}`)} style={crumbBtn}>{lot.community_name}</button>
      <span style={{ color: 'var(--color-border)' }}>/</span>
      {file
        ? <button onClick={() => setSp({})} style={crumbBtn}>{addr || `Lot ${lot.lot_number}`}</button>
        : <span style={{ fontSize: 12, fontWeight: 600 }}>{addr || `Lot ${lot.lot_number}`}</span>}
      {file && <><span style={{ color: 'var(--color-border)' }}>/</span><span style={{ fontSize: 12, fontWeight: 600 }}>{file === 'work_orders' ? 'Work orders' : meta?.label}</span></>}
    </div>
  );

  const ownerPanel = (
    <div style={{ ...panel, padding: '20px 24px', marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, margin: 0 }}>{addr || `Lot ${lot.lot_number}`}</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-sub)', margin: '4px 0 0' }}>
            {lot.community_name}, Lot {lot.lot_number}{lot.model ? `, ${lot.model}` : ''}{lot.city ? `, ${lot.city}` : ''}
          </p>
        </div>
        {lot.enrollment_number && <div style={{ fontSize: 12, color: 'var(--color-text-sub)', textAlign: 'right' }}>Tarion enrolment<div style={{ fontWeight: 800, fontSize: 15, color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>{lot.enrollment_number}</div></div>}
      </div>
      {lot.is_assigned === false && !ownerNames ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(232,160,64,0.08)', border: '1px solid rgba(232,160,64,0.25)' }}>
          <AlertTriangle size={14} color="#B08D4F" /><span style={{ fontSize: 13, color: '#8D7140' }}>No owner has been assigned to this home yet.</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 16 }}>
          <Info icon={User} label="Owner" value={ownerNames || '—'} />
          {owner2 && <Info icon={User} label="Second owner" value={owner2} />}
          <Info icon={Mail} label="Email" value={lot.homeowner_email ?? '—'} />
          {lot.homeowner_email2 && <Info icon={Mail} label="Email 2" value={lot.homeowner_email2} />}
          <Info icon={Phone} label="Phone" value={lot.phone_primary ?? '—'} />
          {lot.phone_secondary && <Info icon={Phone} label="Phone 2" value={lot.phone_secondary} />}
          {lot.phone_tertiary && <Info icon={Phone} label="Phone 3" value={lot.phone_tertiary} />}
          <Info icon={Calendar} label="Closing" value={closing} />
          {lot.postal_code && <Info icon={Home} label="Postal code" value={lot.postal_code} />}
          {lot.enrollment_number && <Info icon={Hash} label="Enrolment" value={lot.enrollment_number} />}
        </div>
      )}
      {lot.notes && <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)', fontSize: 13 }}>{lot.notes}</div>}
    </div>
  );

  // ── One file open ─────────────────────────────────────────────
  if (file) {
    const s = sumOf(file);
    return (
      <div style={wrap}>
        {crumbs}
        {ownerPanel}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <button onClick={() => setSp({})} style={{ height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--color-border-hard)', background: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
            <ChevronLeft size={14} /> All files
          </button>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{file === 'work_orders' ? 'Work orders' : meta?.label}</h2>
          {s && file !== 'work_orders' && <span style={{ fontSize: 13, color: 'var(--color-text-sub)' }}>{s.open} open, {s.closed} closed{s.oldest_open_days != null && s.open ? `, oldest open ${s.oldest_open_days} days` : ''}</span>}
        </div>
        {file === 'qci' && <LotInspections lotId={lot.id} kind="qci" />}
        {file === 'pdi' && (
          <div style={{ display: 'grid', gap: 22 }}>
            <LotInspections lotId={lot.id} kind="pdi" />
            {(s?.cases.length ?? 0) > 0 && (
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px' }}>PDI items imported from earlier records</h3>
                <LotFileItems lotId={lot.id} fileKey="pdi" />
              </div>
            )}
          </div>
        )}
        {file === 'work_orders' && <WorkOrders rows={workOrders} />}
        {file !== 'qci' && file !== 'pdi' && file !== 'work_orders' && <LotFileItems lotId={lot.id} fileKey={file} />}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Overview: dashboard + chooser ─────────────────────────────
  const maxFile = Math.max(1, ...files.map(f => f.open + f.closed + f.other));
  const buckets = [['0 to 30 days', tot.d30], ['31 to 60', tot.d60], ['61 to 90', tot.d90], ['Over 90', tot.d90p]] as [string, number][];
  const maxB = Math.max(1, ...buckets.map(b => b[1]));

  return (
    <div style={wrap}>
      {crumbs}
      {ownerPanel}

      <div style={{ ...panel, padding: '18px 22px', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 18 }}>
          <Tile label="Open items" value={tot.open} color={tot.open ? '#8D7140' : CLOSED} />
          <Tile label="Closed items" value={tot.closed} color={CLOSED} />
          <Tile label="Oldest open item" value={tot.open ? `${tot.oldest} days` : '—'} color={tot.oldest > 90 ? '#A5402F' : 'var(--color-text)'} />
          <Tile label="Open work orders" value={workOrders.filter(w => !['complete', 'closed', 'resolved', 'cancelled'].includes(w.status)).length} color="#6B5B95" />
        </div>
        {tot.open + tot.closed + tot.other === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-muted)', margin: 0 }}>There are no items on this home yet. Choose a file below to begin.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 28 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Items by file</div>
              <Legend items={[['Open', OPEN], ['Closed', CLOSED], ['Other', OTHER]]} />
              <div style={{ display: 'grid', gap: 7 }}>
                {files.filter(f => f.open + f.closed + f.other > 0).map(f => {
                  const t = f.open + f.closed + f.other;
                  const fm = FILES.find(x => x.key === f.key)!;
                  return (
                    <div key={f.key} onClick={() => setSp({ file: f.key })} title={`${fm.label}: ${f.open} open, ${f.closed} closed, ${f.other} other`} style={{ display: 'grid', gridTemplateColumns: '96px 1fr 70px', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{fm.label}</span>
                      <div style={{ display: 'flex', height: 14, width: `${Math.max(6, (t / maxFile) * 100)}%`, gap: 2 }}>
                        {f.open > 0 && <div style={{ flex: f.open, background: OPEN, borderRadius: 3 }} />}
                        {f.closed > 0 && <div style={{ flex: f.closed, background: CLOSED, borderRadius: 3 }} />}
                        {f.other > 0 && <div style={{ flex: f.other, background: OTHER, borderRadius: 3 }} />}
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--color-text-sub)', textAlign: 'right' }}>{f.open} / {t}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>How long open items have waited</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 8 }}>Open items only. Age counts from the date the file was opened.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, alignItems: 'end', height: 120 }}>
                {buckets.map(([label, n], i) => (
                  <div key={label} title={`${label}: ${n} open`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>{n}</span>
                    <div style={{ width: '100%', maxWidth: 54, height: n ? Math.max(4, (n / maxB) * 84) : 2, background: n ? AGE_COLORS[i] : OTHER, borderRadius: '4px 4px 0 0' }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 5 }}>
                {buckets.map(([label]) => <span key={label} style={{ fontSize: 11.5, color: 'var(--color-text-sub)', textAlign: 'center' }}>{label}</span>)}
              </div>
            </div>
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px' }}>Choose a file</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
        {FILES.map(f => {
          const s = sumOf(f.key);
          const total = s ? s.open + s.closed + s.other : 0;
          const isInsp = f.key === 'qci' || f.key === 'pdi';
          const exists = total > 0 || (s?.cases.length ?? 0) > 0 || (s?.inspections ?? 0) > 0;
          return (
            <button key={f.key} onClick={() => setSp({ file: f.key })} style={{ textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', ...panel, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6, borderColor: s?.open ? 'rgba(176,141,79,0.55)' : 'var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <f.icon size={16} color="#8D7140" strokeWidth={1.6} />
                <span style={{ fontWeight: 800, fontSize: 15 }}>{f.label}</span>
                <span style={{ flex: 1 }} />
                <ChevronRight size={15} color="var(--color-muted)" />
              </div>
              <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{f.sub}</span>
              {exists ? (
                <div style={{ marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: s!.open ? '#8D7140' : CLOSED }}>{s!.open}</span>
                    <span style={{ fontSize: 13, color: 'var(--color-text-sub)' }}>open of {total}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                    {s!.open > 0 && s!.oldest_open_days != null
                      ? <><Clock size={12} /> Oldest open {s!.oldest_open_days} days</>
                      : total > 0 ? 'Everything is closed' : isInsp ? `${s!.inspections} on file` : `${s!.cases.length} on file`}
                  </div>
                  {s!.inspections_in_progress > 0 && <span style={{ display: 'inline-block', marginTop: 6, fontSize: 11.5, fontWeight: 700, color: '#2F5576', background: '#E2EAF1', borderRadius: 6, padding: '2px 8px' }}>Inspection in progress</span>}
                </div>
              ) : (
                <span style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>{isInsp ? 'Not done yet. Open to start one.' : 'Nothing filed yet'}</span>
              )}
            </button>
          );
        })}
        <button onClick={() => setSp({ file: 'work_orders' })} style={{ textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', ...panel, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wrench size={16} color="#6B5B95" strokeWidth={1.6} />
            <span style={{ fontWeight: 800, fontSize: 15 }}>Work orders</span>
            <span style={{ flex: 1 }} /><ChevronRight size={15} color="var(--color-muted)" />
          </div>
          <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>Trade visits for this home</span>
          <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, marginTop: 4 }}>{workOrders.length}</span>
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Layers size={12} /> Dates on files imported from earlier records show when the file was loaded, until Tarion dates are synced.
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const wrap: React.CSSProperties = { padding: '26px 32px', maxWidth: 1100, fontFamily: 'var(--font-body)', color: 'var(--color-text)' };
const crumbBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 12, fontFamily: 'var(--font-body)', padding: '4px 8px', borderRadius: 6 };

function Tile({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
      {items.map(([l, c]) => <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--color-text-sub)' }}><span style={{ width: 10, height: 10, borderRadius: 2, background: c }} />{l}</span>)}
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <Icon size={11} color="var(--color-muted)" strokeWidth={1.5} />
        <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>{label}</span>
      </div>
      <p style={{ fontSize: 13.5, fontWeight: 600, margin: 0, paddingLeft: 16, wordBreak: 'break-word' }}>{value}</p>
    </div>
  );
}

function WorkOrders({ rows }: { rows: WorkOrderRow[] }) {
  if (!rows.length) return <div style={{ padding: 36, textAlign: 'center', ...panel, color: 'var(--color-muted)', fontSize: 13 }}>No work orders for this home yet.</div>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map(w => {
        const [label, color, bg] = WO_STATUS[w.status] ?? WO_STATUS.open;
        return (
          <div key={w.id} style={{ ...panel, borderRadius: 9, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Shield size={16} color="#6B5B95" strokeWidth={1.5} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>{w.wo_number}</span>
                <span style={{ padding: '2px 8px', borderRadius: 100, background: bg, fontSize: 11, fontWeight: 700, color }}>{label}</span>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{w.description ?? '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>
                {[w.trade_name, w.scheduled_date ? new Date(w.scheduled_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : ''].filter(Boolean).join('  ·  ')}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
