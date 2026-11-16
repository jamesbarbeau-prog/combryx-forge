/**
 * COMBRYX — Lot Detail Page
 * Route: /warranty/lots/:id
 * Data: Supabase warranty_lots + cases + work orders
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  Home, ChevronLeft, RefreshCw, AlertTriangle, CheckCircle2,
  Mail, Phone, Shield, ChevronRight, Plus, Wrench,
  Calendar, FileText, User, Hash,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────

interface LotDetail {
  id: string;
  lot_number: string;
  model: string | null;
  address: string | null;
  civic_number: string | null;
  street: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  homeowner_name: string | null;
  homeowner_first: string | null;
  homeowner_last: string | null;
  owner2_first: string | null;
  owner2_last: string | null;
  homeowner_email: string | null;
  homeowner_email2: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  phone_tertiary: string | null;
  enrollment_number: string | null;
  closing_date: string | null;
  notes: string | null;
  is_assigned: boolean;
  community_id: string;
  community_name: string;
}

interface CaseRow {
  id: string;
  case_number: string;
  title: string;
  status: string;
  case_type: string;
  period_type: string | null;
  opened_at: string;
  brp_end_date: string | null;
  has_conciliation: boolean | null;
}

interface WorkOrderRow {
  id: string;
  wo_number: string;
  description: string | null;
  status: string;
  trade_name: string | null;
  scheduled_date: string | null;
  created_at: string;
}

type Tab = 'owner' | 'cases' | 'work-orders';

// ─── Status configs ───────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open:          { label: 'Open',        color: '#3F6A8F', bg: 'rgba(30,95,164,0.10)'   },
  in_progress:   { label: 'In Progress', color: '#9A6A16', bg: 'rgba(217,119,6,0.10)'   },
  pending_parts: { label: 'Pending',     color: '#6B5B95', bg: 'rgba(124,58,237,0.10)'  },
  resolved:      { label: 'Resolved',    color: '#4A7A55', bg: 'rgba(22,163,74,0.10)'   },
  closed:        { label: 'Closed',      color: '#6C7280', bg: 'rgba(107,114,128,0.10)' },
  scheduled:     { label: 'Scheduled',   color: '#3F6A8F', bg: 'rgba(30,95,164,0.10)'   },
  complete:      { label: 'Complete',    color: '#4A7A55', bg: 'rgba(22,163,74,0.10)'   },
  cancelled:     { label: 'Cancelled',   color: '#6C7280', bg: 'rgba(107,114,128,0.10)' },
};

const PERIOD_LABELS: Record<string, string> = {
  initial: 'Initial', mid_year: 'Mid-Year', year_end: 'Year-End',
  second_year: '2nd Year', msd: 'MSD', conciliation: 'Conciliation',
};

// ─── Main component ───────────────────────────────────────────

export default function LotDetailPage() {
  const navigate = useNavigate();
  const { id: lotId } = useParams<{ id: string }>();

  const [lot,        setLot]        = useState<LotDetail | null>(null);
  const [cases,      setCases]      = useState<CaseRow[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [tab,        setTab]        = useState<Tab>('owner');

  useEffect(() => { if (lotId) load(); }, [lotId]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      // Load lot + community name
      const { data: lotData, error: lotErr } = await supabase
        .from('warranty_lots')
        .select(`
          id, lot_number, model, address, civic_number, street, city, province, postal_code,
          homeowner_name, homeowner_first, homeowner_last, owner2_first, owner2_last,
          homeowner_email, homeowner_email2, phone_primary, phone_secondary, phone_tertiary,
          enrollment_number, closing_date, notes, is_assigned, community_id,
          warranty_communities(name)
        `)
        .eq('id', lotId!)
        .single();

      if (lotErr) throw new Error(lotErr.message);
      if (!lotData) throw new Error('Lot not found');

      setLot({
        ...lotData,
        community_name: (lotData.warranty_communities as any)?.name ?? '—',
      });

      // Load cases for this lot
      const { data: casesData } = await supabase
        .from('cases')
        .select('id, case_number, title, status, case_type, period_type, opened_at, brp_end_date, has_conciliation')
        .eq('lot_id', lotId!)
        .is('deleted_at', null)
        .order('opened_at', { ascending: false });

      setCases((casesData ?? []) as CaseRow[]);

      // Load work orders for this lot
      const { data: woData } = await supabase
        .from('work_orders')
        .select('id, wo_number, description, status, scheduled_date, created_at, trades(name)')
        .eq('lot_id', lotId!)
        .order('created_at', { ascending: false });

      setWorkOrders(((woData ?? []) as any[]).map(w => ({
        id:             w.id,
        wo_number:      w.wo_number,
        description:    w.description,
        status:         w.status,
        trade_name:     w.trades?.name ?? null,
        scheduled_date: w.scheduled_date,
        created_at:     w.created_at,
      })));

    } catch (e: any) {
      setError(e.message || 'Failed to load lot');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
      <div style={{ textAlign: 'center' }}>
        <RefreshCw size={24} color="var(--color-muted)" style={{ animation: 'spin 0.8s linear infinite', marginBottom: 12 }} />
        <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Loading lot…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error || !lot) return (
    <div style={{ padding: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 10, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', maxWidth: 500 }}>
        <AlertTriangle size={16} color="#A5402F" />
        <p style={{ fontSize: 13, color: '#A5402F' }}>{error || 'Lot not found'}</p>
        <button onClick={load} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 6, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)', color: '#A5402F', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Retry</button>
      </div>
    </div>
  );

  const openCases  = cases.filter(c => !['closed', 'voided', 'resolved'].includes(c.status));
  const TABS: { id: Tab; label: string; count?: number; icon: any }[] = [
    { id: 'owner',       label: 'Owner & Details', icon: User },
    { id: 'cases',       label: 'Warranty Cases',  icon: Shield,  count: cases.length      },
    { id: 'work-orders', label: 'Work Orders',     icon: Wrench,  count: workOrders.length },
  ];

  return (
    <div style={{ padding: '28px 36px', maxWidth: 1100, fontFamily: 'var(--font-body)', color: 'var(--color-text)' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <button onClick={() => navigate('/warranty/communities')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 12, fontFamily: 'var(--font-body)', padding: '4px 8px', borderRadius: 6 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted)')}
        >
          <ChevronLeft size={13} /> Portfolio
        </button>
        <span style={{ color: 'var(--color-border)', fontSize: 12 }}>/</span>
        <button onClick={() => navigate(`/warranty/communities/${lot.community_id}`)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 12, fontFamily: 'var(--font-body)', padding: '4px 8px', borderRadius: 6 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted)')}
        >
          {lot.community_name}
        </button>
        <span style={{ color: 'var(--color-border)', fontSize: 12 }}>/</span>
        <span style={{ fontSize: 12, color: 'var(--color-text)', fontWeight: 600 }}>Lot {lot.lot_number}</span>
      </div>

      {/* Lot header */}
      <div style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '20px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: openCases.length > 0 ? 'rgba(232,160,64,0.12)' : 'rgba(92,207,160,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Home size={20} color={openCases.length > 0 ? '#B08D4F' : '#5CCFA0'} strokeWidth={1.5} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
              Lot {lot.lot_number}
              {lot.model && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-muted)', marginLeft: 10 }}>{lot.model}</span>}
            </h1>
            <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>
              {lot.community_name}
              {lot.address && ` · ${lot.address}`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <StatPill label="Open Cases"   value={openCases.length}   color={openCases.length > 0 ? '#B08D4F' : '#5CCFA0'} />
          <StatPill label="Total Cases"  value={cases.length}       color="#5B87AD" />
          <StatPill label="Work Orders"  value={workOrders.length}  color="#6B5B95" />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--color-border)', marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '10px 16px', borderRadius: '6px 6px 0 0', fontSize: 12,
            fontWeight: tab === t.id ? 700 : 500,
            background: tab === t.id ? 'var(--color-panel)' : 'transparent',
            border: tab === t.id ? '1px solid var(--color-border)' : '1px solid transparent',
            borderBottom: tab === t.id ? '1px solid var(--color-panel)' : '1px solid transparent',
            color: tab === t.id ? 'var(--color-text)' : 'var(--color-muted)',
            cursor: 'pointer', fontFamily: 'var(--font-body)', marginBottom: tab === t.id ? -1 : 0,
          }}>
            <t.icon size={12} strokeWidth={1.5} />
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: tab === t.id ? 'rgba(63,106,143,0.15)' : 'var(--color-border)', color: tab === t.id ? '#2F5576' : 'var(--color-muted)' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Owner */}
      {tab === 'owner' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Primary owner */}
          <div style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '18px 20px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-muted)', marginBottom: 14 }}>Primary owner</p>
            {lot.is_assigned ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                <InfoItem icon={User} label="Name" value={(lot.homeowner_name ?? (`${lot.homeowner_first ?? ''} ${lot.homeowner_last ?? ''}`).trim()) || '—'} />
                {(lot.owner2_first || lot.owner2_last) && (
                  <InfoItem icon={User} label="Second owner" value={`${lot.owner2_first ?? ''} ${lot.owner2_last ?? ''}`.trim()} />
                )}
                <InfoItem icon={Mail}  label="Email"  value={lot.homeowner_email  ?? '—'} />
                {lot.homeowner_email2 && <InfoItem icon={Mail} label="Email 2" value={lot.homeowner_email2} />}
                <InfoItem icon={Phone} label="Phone"  value={lot.phone_primary    ?? '—'} />
                {lot.phone_secondary && <InfoItem icon={Phone} label="Phone 2" value={lot.phone_secondary} />}
                {lot.phone_tertiary  && <InfoItem icon={Phone} label="Phone 3" value={lot.phone_tertiary}  />}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 8, background: 'rgba(232,160,64,0.06)', border: '1px solid rgba(232,160,64,0.2)' }}>
                <AlertTriangle size={14} color="#B08D4F" />
                <p style={{ fontSize: 13, color: '#B08D4F' }}>This lot has not been assigned to an owner yet</p>
              </div>
            )}
          </div>

          {/* Property details */}
          <div style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '18px 20px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-muted)', marginBottom: 14 }}>Property details</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              <InfoItem icon={Home}     label="Address"    value={lot.address ?? ((`${lot.civic_number ?? ''} ${lot.street ?? ''}`).trim() || '—')} />
              {lot.city     && <InfoItem icon={Home}     label="City"       value={`${lot.city}${lot.province ? ', ' + lot.province : ''}${lot.postal_code ? '  ' + lot.postal_code : ''}`} />}
              {lot.model    && <InfoItem icon={FileText}  label="Model"      value={lot.model} />}
              <InfoItem icon={Calendar} label="Closing"   value={lot.closing_date ? new Date(lot.closing_date).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'} />
              {lot.enrollment_number && <InfoItem icon={Hash} label="Tarion enrollment" value={lot.enrollment_number} />}
            </div>
            {lot.notes && (
              <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Notes</p>
                <p style={{ fontSize: 12, color: 'var(--color-text)' }}>{lot.notes}</p>
              </div>
            )}
          </div>

          {/* Quick action */}
          <button
            onClick={() => { setTab('cases'); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(63,106,143,0.1)', border: '1px solid rgba(63,106,143,0.3)', color: '#2F5576', cursor: 'pointer', fontFamily: 'var(--font-body)', width: 'fit-content' }}
          >
            <Shield size={13} /> View warranty cases <ChevronRight size={12} />
          </button>
        </div>
      )}

      {/* Tab: Cases */}
      {tab === 'cases' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 700 }}>
              {cases.length} case{cases.length !== 1 ? 's' : ''} · {openCases.length} open
            </p>
            <button
              onClick={() => navigate('/warranty/cases')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, background: 'rgba(63,106,143,0.1)', border: '1px solid rgba(63,106,143,0.3)', color: '#2F5576', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
            >
              <Plus size={12} /> New case
            </button>
          </div>

          {cases.length === 0 ? (
            <Empty icon={Shield} message="No warranty cases for this lot yet" color="#5B87AD" />
          ) : (
            <div style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 130px 110px 90px 36px', padding: '9px 16px', background: 'var(--color-mist)', borderBottom: '1px solid var(--color-border)' }}>
                {['Case #', 'Title', 'Status', 'Period', 'BRP', ''].map(h => (
                  <span key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{h}</span>
                ))}
              </div>
              {cases.map((c, i) => {
                const sc  = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.open;
                const brpDays = c.brp_end_date ? Math.ceil((new Date(c.brp_end_date).getTime() - Date.now()) / 86400000) : null;
                const brpColor = brpDays === null ? 'var(--color-muted)' : brpDays < 0 ? '#A5402F' : brpDays <= 14 ? '#9A6A16' : '#4A7A55';
                return (
                  <div key={c.id}
                    onClick={() => navigate(`/warranty/cases/${c.id}`)}
                    style={{ display: 'grid', gridTemplateColumns: '130px 1fr 130px 110px 90px 36px', padding: '12px 16px', alignItems: 'center', borderBottom: i < cases.length - 1 ? '1px solid var(--color-border)' : 'none', cursor: 'pointer', background: c.has_conciliation ? 'rgba(220,38,38,0.02)' : 'transparent' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-mist)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = c.has_conciliation ? 'rgba(220,38,38,0.02)' : 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>{c.case_number}</span>
                      {c.has_conciliation && <Shield size={10} color="#A5402F" />}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>{c.title}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 100, background: sc.bg, fontSize: 10, fontWeight: 700, color: sc.color, width: 'fit-content' }}>{sc.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{c.period_type ? (PERIOD_LABELS[c.period_type] ?? c.period_type) : '—'}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: brpColor }}>
                      {brpDays === null ? '—' : brpDays < 0 ? 'Exp' : `${brpDays}d`}
                    </span>
                    <ChevronRight size={14} color="var(--color-muted)" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Work Orders */}
      {tab === 'work-orders' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 700 }}>{workOrders.length} work order{workOrders.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => navigate('/warranty/work-orders')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, background: 'rgba(63,106,143,0.1)', border: '1px solid rgba(63,106,143,0.3)', color: '#2F5576', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
            >
              <Plus size={12} /> New work order
            </button>
          </div>

          {workOrders.length === 0 ? (
            <Empty icon={Wrench} message="No work orders for this lot yet" color="#6B5B95" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {workOrders.map(wo => {
                const sc = STATUS_CONFIG[wo.status] ?? STATUS_CONFIG.open;
                return (
                  <div key={wo.id} style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 9, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(124,58,237,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Wrench size={16} color="#6B5B95" strokeWidth={1.5} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>{wo.wo_number}</span>
                        <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 100, background: sc.bg, fontSize: 10, fontWeight: 700, color: sc.color }}>{sc.label}</span>
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>{wo.description ?? '—'}</p>
                      <div style={{ display: 'flex', gap: 12 }}>
                        {wo.trade_name && <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{wo.trade_name}</span>}
                        {wo.scheduled_date && (
                          <span style={{ fontSize: 10, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Calendar size={9} /> {new Date(wo.scheduled_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: '8px 14px', borderRadius: 8, textAlign: 'center', background: color + '12', border: `1px solid ${color}30` }}>
      <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <Icon size={11} color="var(--color-muted)" strokeWidth={1.5} />
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-muted)' }}>{label}</span>
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', paddingLeft: 16 }}>{value}</p>
    </div>
  );
}

function Empty({ icon: Icon, message, color }: { icon: any; message: string; color: string }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', background: 'var(--color-panel)', borderRadius: 10, border: '1px solid var(--color-border)' }}>
      <Icon size={28} color={color} strokeWidth={1} style={{ marginBottom: 10, opacity: 0.5 }} />
      <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>{message}</p>
    </div>
  );
}