/**
 * COMBRYX — Warranty Today / Command Centre
 * All data from Supabase — no mock data, no QDef
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Calendar, Clock, FileWarning, AlertTriangle,
  RefreshCw, CheckCircle2, ChevronDown, ChevronRight,
  Home, DollarSign, Wrench,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { differenceInDays, isToday, isTomorrow, format } from 'date-fns';

const COMPANY_ID = 'c8bd8b99-090d-4379-86cd-95c3844c09f9';

// ─── Types ────────────────────────────────────────────────────

interface DashboardStats {
  total_cases:    number;
  open_cases:     number;
  in_progress:    number;
  brp_expiring:   number; // within 14 days
  conciliations:  number;
}

interface UpcomingDeadline {
  id:          string;
  case_number: string;
  address:     string;
  brp_end:     string | null;
  days_left:   number;
  status:      string;
  community:   string;
}

interface PendingPO {
  id:           string;
  po_number:    string;
  amount:       number;
  description:  string | null;
  requested_by: string | null;
  lot_address:  string | null;
  created_at:   string;
}

interface ActiveConciliation {
  id:                            string;
  case_id:                       string;
  stage:                         string;
  inspection_deadline:           string | null;
  inspection_date:               string | null;
  inspection_time_slot:          string | null;
  inspection_confirmed:          boolean;
  warranted_resolution_deadline: string | null;
  builder_directory_hit:         boolean;
  case_number:                   string;
  lot_address:                   string;
  homeowner_name:                string | null;
  community_id:                  string;
  community_name:                string;
  warranted_count:               number;
}

interface CommunityConcilSummary {
  id:         string;
  name:       string;
  rfc:        number;
  inspection: number;
  warranted:  number;
  claim:      number;
  total:      number;
  items:      ActiveConciliation[];
}

// ─── Helpers ──────────────────────────────────────────────────

function riskColor(days: number) {
  if (days < 0)   return { text: '#DC2626', bg: 'rgba(220,38,38,0.10)', border: 'rgba(220,38,38,0.25)' };
  if (days <= 7)  return { text: '#DC2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.20)' };
  if (days <= 14) return { text: '#D97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.20)' };
  return           { text: '#16A34A', bg: 'rgba(22,163,74,0.08)',   border: 'rgba(22,163,74,0.18)'  };
}

const STAGE_CONFIG = {
  rfc:        { label: 'RFC',        color: '#D97706', bg: 'rgba(217,119,6,0.08)',  border: 'rgba(217,119,6,0.25)',  icon: FileWarning   },
  inspection: { label: 'Inspection', color: '#DC2626', bg: 'rgba(220,38,38,0.08)',  border: 'rgba(220,38,38,0.25)',  icon: Calendar      },
  warranted:  { label: 'Warranted',  color: '#7C3AED', bg: 'rgba(124,58,237,0.08)', border: 'rgba(124,58,237,0.25)', icon: Shield        },
  claim:      { label: 'Claim',      color: '#DC2626', bg: 'rgba(220,38,38,0.08)',  border: 'rgba(220,38,38,0.35)',  icon: AlertTriangle },
};

function deadlineDayLabel(days: number | null, date: string | null): string {
  if (!date) return '—';
  if (days === null) return format(new Date(date), 'MMM d');
  if (days < 0)   return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7)  return `${days}d`;
  return format(new Date(date), 'MMM d');
}

function getConcilDeadline(c: ActiveConciliation) {
  if (c.stage === 'rfc')        return { days: c.inspection_deadline ? differenceInDays(new Date(c.inspection_deadline), new Date()) : null, date: c.inspection_deadline, label: '14-day deadline' };
  if (c.stage === 'inspection') return { days: c.inspection_date ? differenceInDays(new Date(c.inspection_date), new Date()) : null, date: c.inspection_date, label: 'Inspection' };
  if (c.stage === 'warranted')  return { days: c.warranted_resolution_deadline ? differenceInDays(new Date(c.warranted_resolution_deadline), new Date()) : null, date: c.warranted_resolution_deadline, label: '30-day deadline' };
  return { days: 0, date: null, label: 'Claim active' };
}

// ─── Conciliation card ────────────────────────────────────────

function ConcilCard({ c, onClick }: { c: ActiveConciliation; onClick: () => void }) {
  const cfg = STAGE_CONFIG[c.stage as keyof typeof STAGE_CONFIG] ?? STAGE_CONFIG.rfc;
  const Icon = cfg.icon;
  const dl = getConcilDeadline(c);
  const isCritical = dl.days !== null && dl.days <= 3;
  const dlColor = dl.days === null ? 'var(--color-muted)' : dl.days <= 3 ? '#DC2626' : dl.days <= 7 ? '#D97706' : '#16A34A';
  const slot = c.inspection_time_slot === '10:00' ? '10:00 AM' : c.inspection_time_slot === '14:00' ? '2:00 PM' : null;

  return (
    <div onClick={onClick}
      style={{ padding: '12px 14px', borderRadius: 9, background: cfg.bg, border: `1.5px solid ${isCritical ? '#DC2626' : cfg.border}`, cursor: 'pointer', transition: 'all 0.12s', position: 'relative' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(252,226,5,0.3)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = isCritical ? '#DC2626' : cfg.border}
    >
      {isCritical && <div style={{ position: 'absolute', top: 9, right: 9, width: 7, height: 7, borderRadius: '50%', background: '#DC2626', boxShadow: '0 0 0 3px rgba(220,38,38,0.2)' }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
        <Icon size={10} color={cfg.color} strokeWidth={2} />
        <span style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: cfg.color }}>{cfg.label}</span>
      </div>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', marginBottom: 1 }}>{c.lot_address}</p>
      <p style={{ fontSize: 10, color: 'var(--color-muted)', marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>#{c.case_number}</span>
        {c.homeowner_name && ` · ${c.homeowner_name}`}
      </p>
      {c.inspection_date && slot && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.08)', marginBottom: 6 }}>
          <Clock size={9} color="#1E5FA4" />
          <span style={{ fontSize: 9, fontWeight: 700, color: '#1E5FA4' }}>{format(new Date(c.inspection_date), 'EEE MMM d')} · {slot}</span>
          {c.inspection_confirmed && <CheckCircle2 size={9} color="#16A34A" />}
        </div>
      )}
      {c.stage === 'warranted' && c.warranted_count > 0 && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 5, background: 'rgba(124,58,237,0.10)', marginBottom: 6 }}>
          <Shield size={9} color="#7C3AED" />
          <span style={{ fontSize: 9, fontWeight: 700, color: '#7C3AED' }}>{c.warranted_count} warranted</span>
        </div>
      )}
      {c.builder_directory_hit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 5, background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.2)', marginBottom: 6 }}>
          <AlertTriangle size={9} color="#DC2626" />
          <span style={{ fontSize: 9, fontWeight: 700, color: '#DC2626' }}>Directory Hit</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, color: 'var(--color-muted)' }}>{dl.label}</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: dlColor, fontFamily: 'var(--font-mono)' }}>{deadlineDayLabel(dl.days, dl.date)}</span>
      </div>
    </div>
  );
}

// ─── Community row ────────────────────────────────────────────

function CommunityConcilRow({ summary, isExpanded, onToggle, onCaseClick }: {
  summary: CommunityConcilSummary;
  isExpanded: boolean;
  onToggle: () => void;
  onCaseClick: (caseId: string) => void;
}) {
  const { rfc, inspection, warranted, claim, total, items } = summary;
  const hasItems = total > 0;
  const sorted = [...items].sort((a, b) => {
    const da = a.inspection_date ? new Date(a.inspection_date).getTime() : Infinity;
    const db = b.inspection_date ? new Date(b.inspection_date).getTime() : Infinity;
    return da - db;
  });

  const renderGroup = (label: string, color: string, group: ActiveConciliation[]) => group.length === 0 ? null : (
    <div style={{ marginBottom: 10 }}>
      <p style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color, marginBottom: 6 }}>{label}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
        {group.map(c => <ConcilCard key={c.id} c={c} onClick={() => onCaseClick(c.case_id)} />)}
      </div>
    </div>
  );

  return (
    <div style={{ borderRadius: 10, background: hasItems ? 'var(--color-panel)' : 'var(--color-mist)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
      <div onClick={hasItems ? onToggle : undefined} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: hasItems ? 'pointer' : 'default' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: hasItems ? 'var(--color-text)' : 'var(--color-muted)', width: 160, flexShrink: 0 }}>{summary.name}</span>
        <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
          {rfc > 0        && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(217,119,6,0.10)',  color: '#D97706', border: '1px solid rgba(217,119,6,0.25)'  }}>{rfc} RFC</span>}
          {inspection > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(220,38,38,0.10)',  color: '#DC2626', border: '1px solid rgba(220,38,38,0.25)'  }}>{inspection} Inspection</span>}
          {warranted > 0  && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(124,58,237,0.10)', color: '#7C3AED', border: '1px solid rgba(124,58,237,0.25)' }}>{warranted} Warranted</span>}
          {claim > 0      && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 100, background: 'rgba(220,38,38,0.15)',  color: '#DC2626', border: '1px solid rgba(220,38,38,0.35)'  }}>{claim} Claim</span>}
          {!hasItems      && <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>No active conciliations</span>}
        </div>
        {hasItems && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>{total}</span>
            {isExpanded ? <ChevronDown size={13} color="var(--color-muted)" /> : <ChevronRight size={13} color="var(--color-muted)" />}
          </div>
        )}
      </div>
      {isExpanded && hasItems && (
        <div style={{ padding: '14px 16px 16px', borderTop: '1px solid var(--color-border)' }}>
          {renderGroup('Today',        '#DC2626',            sorted.filter(c => c.inspection_date && isToday(new Date(c.inspection_date))))}
          {renderGroup('Tomorrow',     '#D97706',            sorted.filter(c => c.inspection_date && isTomorrow(new Date(c.inspection_date))))}
          {renderGroup('Upcoming',     'var(--color-muted)', sorted.filter(c => c.inspection_date && !isToday(new Date(c.inspection_date)) && !isTomorrow(new Date(c.inspection_date))))}
          {renderGroup('Awaiting date','var(--color-muted)', sorted.filter(c => !c.inspection_date))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export default function WarrantyTodayPage() {
  const navigate = useNavigate();
  const dateStr  = new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const [stats,        setStats]        = useState<DashboardStats | null>(null);
  const [deadlines,    setDeadlines]    = useState<UpcomingDeadline[]>([]);
  const [pendingPOs,   setPendingPOs]   = useState<PendingPO[]>([]);
  const [conciliations,setConciliations]= useState<ActiveConciliation[]>([]);
  const [communities,  setCommunities]  = useState<{ id: string; name: string }[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchStats(), fetchDeadlines(), fetchPendingPOs(), fetchConciliations()]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Stats ────────────────────────────────────────────────

  async function fetchStats() {
    const { data: cases } = await supabase
      .from('cases')
      .select('status, has_conciliation, brp_end_date')
      .eq('company_id', COMPANY_ID)
      .is('deleted_at', null);

    if (!cases) return;
    const now = new Date();
    setStats({
      total_cases:   cases.length,
      open_cases:    cases.filter(c => c.status === 'open').length,
      in_progress:   cases.filter(c => c.status === 'in_progress').length,
      brp_expiring:  cases.filter(c => {
        if (!c.brp_end_date) return false;
        const d = differenceInDays(new Date(c.brp_end_date), now);
        return d >= 0 && d <= 14;
      }).length,
      conciliations: cases.filter(c => c.has_conciliation).length,
    });
  }

  // ── Deadlines ────────────────────────────────────────────

  async function fetchDeadlines() {
    const { data: cases } = await supabase
      .from('cases')
      .select('id, case_number, brp_end_date, status, display_name, lot_id')
      .eq('company_id', COMPANY_ID)
      .is('deleted_at', null)
      .not('brp_end_date', 'is', null)
      .not('status', 'in', '("closed","voided","resolved")')
      .order('brp_end_date', { ascending: true })
      .limit(10);

    if (!cases || cases.length === 0) return;

    const lotIds = cases.map(c => c.lot_id).filter(Boolean);
    const { data: lots } = lotIds.length ? await supabase
      .from('warranty_lots')
      .select('id, address, community_id, warranty_communities(name)')
      .in('id', lotIds) : { data: [] };

    const lotMap: Record<string, { address: string | null; community: string }> = {};
    for (const l of (lots ?? []) as any[]) {
      lotMap[l.id] = { address: l.address, community: l.warranty_communities?.name ?? '—' };
    }

    const now = new Date();
    setDeadlines(cases.map(c => ({
      id:          c.id,
      case_number: c.case_number,
      address:     c.lot_id ? (lotMap[c.lot_id]?.address ?? c.display_name ?? '—') : (c.display_name ?? '—'),
      brp_end:     c.brp_end_date,
      days_left:   c.brp_end_date ? differenceInDays(new Date(c.brp_end_date), now) : 999,
      status:      c.status,
      community:   c.lot_id ? (lotMap[c.lot_id]?.community ?? '—') : '—',
    })));
  }

  // ── Pending POs ──────────────────────────────────────────

  async function fetchPendingPOs() {
    const { data } = await supabase
      .from('purchase_orders')
      .select('id, po_number, amount, description, requested_by, lot_id, created_at')
      .eq('company_id', COMPANY_ID)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(6);

    if (!data || data.length === 0) return;

    const lotIds = data.map((p: any) => p.lot_id).filter(Boolean);
    const { data: lots } = lotIds.length ? await supabase
      .from('warranty_lots')
      .select('id, address')
      .in('id', lotIds) : { data: [] };

    const lotMap: Record<string, string> = {};
    for (const l of (lots ?? []) as any[]) lotMap[l.id] = l.address;

    setPendingPOs(data.map((p: any) => ({
      id:           p.id,
      po_number:    p.po_number,
      amount:       p.amount,
      description:  p.description,
      requested_by: p.requested_by,
      lot_address:  p.lot_id ? (lotMap[p.lot_id] ?? null) : null,
      created_at:   p.created_at,
    })));
  }

  // ── Conciliations ─────────────────────────────────────────

  async function fetchConciliations() {
    const { data: comms } = await supabase
      .from('warranty_communities')
      .select('id, name')
      .eq('company_id', COMPANY_ID)
      .order('name');
    if (comms) setCommunities(comms);

    const { data: subcases } = await supabase
      .from('conciliation_subcases')
      .select('id, case_id, stage, inspection_deadline, inspection_date, inspection_time_slot, inspection_confirmed, warranted_resolution_deadline, builder_directory_hit')
      .not('stage', 'eq', 'cancelled')
      .is('outcome', null)
      .order('inspection_date', { ascending: true, nullsFirst: false });

    if (!subcases || subcases.length === 0) return;

    const caseIds = subcases.map(s => s.case_id);
    const { data: cases } = await supabase.from('cases').select('id, case_number, lot_id').in('id', caseIds);
    const lotIds = (cases ?? []).map((c: any) => c.lot_id).filter(Boolean);
    const { data: lots } = await supabase.from('warranty_lots').select('id, address, homeowner_name, community_id').in('id', lotIds);
    const communityIds = (lots ?? []).map((l: any) => l.community_id).filter(Boolean);
    const { data: communities_data } = await supabase.from('warranty_communities').select('id, name').in('id', communityIds);
    const subcaseIds = subcases.map(s => s.id);
    const { data: itemCounts } = await supabase.from('conciliation_items').select('subcase_id, tarion_determination').in('subcase_id', subcaseIds);

    const caseMap  = Object.fromEntries((cases ?? []).map((c: any) => [c.id, c]));
    const lotMap   = Object.fromEntries((lots ?? []).map((l: any) => [l.id, l]));
    const commMap  = Object.fromEntries((communities_data ?? []).map((c: any) => [c.id, c]));
    const countMap: Record<string, number> = {};
    for (const item of (itemCounts ?? []) as any[]) {
      if (item.tarion_determination === 'warranted') countMap[item.subcase_id] = (countMap[item.subcase_id] ?? 0) + 1;
    }

    setConciliations(subcases.map(s => {
      const c    = caseMap[s.case_id] ?? {};
      const lot  = lotMap[c.lot_id]   ?? {};
      const comm = commMap[lot.community_id] ?? {};
      return {
        id: s.id, case_id: s.case_id, stage: s.stage,
        inspection_deadline: s.inspection_deadline, inspection_date: s.inspection_date,
        inspection_time_slot: s.inspection_time_slot, inspection_confirmed: s.inspection_confirmed,
        warranted_resolution_deadline: s.warranted_resolution_deadline,
        builder_directory_hit: s.builder_directory_hit,
        case_number: c.case_number ?? '—',
        lot_address: lot.address   ?? '—',
        homeowner_name: lot.homeowner_name ?? null,
        community_id: comm.id   ?? '',
        community_name: comm.name ?? '—',
        warranted_count: countMap[s.id] ?? 0,
      };
    }));
  }

  // ── Community summaries ───────────────────────────────────

  const communitySummaries: CommunityConcilSummary[] = communities.map(c => {
    const items = conciliations.filter(x => x.community_id === c.id);
    return {
      id: c.id, name: c.name,
      rfc:        items.filter(x => x.stage === 'rfc').length,
      inspection: items.filter(x => x.stage === 'inspection').length,
      warranted:  items.filter(x => x.stage === 'warranted').length,
      claim:      items.filter(x => x.stage === 'claim').length,
      total: items.length, items,
    };
  }).sort((a, b) => b.total - a.total);

  const totalConcil = communitySummaries.reduce((s, c) => s + c.total, 0);

  function toggleRow(id: string) {
    setExpandedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  return (
    <div style={{ padding: '20px 28px', maxWidth: 1440, margin: '0 auto', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 2 }}>Command Centre</h1>
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>{dateStr}</p>
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: 'var(--color-panel)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total Cases',    value: stats?.total_cases   ?? '—', color: 'var(--color-text)', click: () => navigate('/warranty/cases') },
          { label: 'Open',           value: stats?.open_cases    ?? '—', color: '#1E5FA4',            click: () => navigate('/warranty/cases') },
          { label: 'In Progress',    value: stats?.in_progress   ?? '—', color: '#D97706',            click: () => navigate('/warranty/cases') },
          { label: 'BRP ≤ 14 Days',  value: stats?.brp_expiring  ?? '—', color: '#DC2626',            click: () => navigate('/warranty/cases') },
          { label: 'Conciliations',  value: stats?.conciliations ?? '—', color: '#7C3AED',            click: () => navigate('/warranty/cases') },
        ].map(s => (
          <div key={s.label} onClick={s.click}
            style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)', cursor: 'pointer', transition: 'all 0.12s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(252,226,5,0.3)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
          >
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--color-muted)', marginBottom: 6 }}>{s.label}</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: s.color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>

        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Conciliations */}
          <div style={{ padding: '18px 20px', borderRadius: 12, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Shield size={14} color="#DC2626" strokeWidth={2} />
              <span style={{ fontSize: 13, fontWeight: 800 }}>Conciliations</span>
              {totalConcil > 0 && (
                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 100, background: 'rgba(220,38,38,0.10)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.2)' }}>
                  {totalConcil} active
                </span>
              )}
            </div>
            {communities.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--color-muted)', textAlign: 'center', padding: '20px 0' }}>No communities loaded yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {communitySummaries.map(s => (
                  <CommunityConcilRow key={s.id} summary={s} isExpanded={expandedRows.has(s.id)} onToggle={() => toggleRow(s.id)} onCaseClick={id => navigate(`/warranty/cases/${id}`)} />
                ))}
              </div>
            )}
          </div>

          {/* Pending POs */}
          {pendingPOs.length > 0 && (
            <div style={{ padding: '16px 18px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <DollarSign size={13} color="#D97706" />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>PO Approvals Pending</span>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 100, background: 'rgba(217,119,6,0.10)', color: '#D97706', border: '1px solid rgba(217,119,6,0.25)' }}>{pendingPOs.length}</span>
                </div>
                <button onClick={() => navigate('/warranty/po-requests')} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(252,226,5,0.10)', border: '1px solid rgba(252,226,5,0.25)', color: '#8A7600', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  Review all
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                {pendingPOs.map(po => (
                  <div key={po.id} onClick={() => navigate('/warranty/po-requests')}
                    style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(252,226,5,0.3)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>{po.po_number}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#16A34A' }}>${po.amount?.toLocaleString() ?? '—'}</span>
                    </div>
                    {po.lot_address && <p style={{ fontSize: 11, color: 'var(--color-text)', marginBottom: 2 }}>{po.lot_address}</p>}
                    {po.description && <p style={{ fontSize: 10, color: 'var(--color-muted)', marginBottom: 6 }}>{po.description}</p>}
                    <p style={{ fontSize: 9, color: 'var(--color-muted)' }}>
                      {po.requested_by && `By ${po.requested_by} · `}
                      {new Date(po.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Deadlines */}
        <div>
          <div style={{ padding: '16px 18px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Calendar size={13} color="#1E5FA4" />
              <span style={{ fontSize: 13, fontWeight: 700 }}>BRP Deadlines</span>
            </div>
            {deadlines.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--color-muted)', textAlign: 'center', padding: '16px 0' }}>No upcoming BRP deadlines.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {deadlines.map(d => {
                  const r = riskColor(d.days_left);
                  return (
                    <div key={d.id} onClick={() => navigate(`/warranty/cases/${d.id}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--color-mist)', border: `1px solid ${d.days_left <= 14 ? r.border : 'var(--color-border)'}`, cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-panel)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--color-mist)'}
                    >
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.address}</p>
                        <p style={{ fontSize: 9, color: 'var(--color-muted)' }}>{d.community} · #{d.case_number}</p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: 16, fontWeight: 900, color: r.text, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                          {d.days_left < 0 ? 'EXP' : `${d.days_left}d`}
                        </p>
                        <p style={{ fontSize: 9, color: 'var(--color-muted)' }}>
                          {d.brp_end ? new Date(d.brp_end).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 10 }}>Quick actions</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'View all cases',      icon: Shield,    path: '/warranty/cases'       },
                { label: 'Work orders',         icon: Wrench,    path: '/warranty/work-orders'  },
                { label: 'Communities',         icon: Home,      path: '/warranty/communities'  },
                { label: 'PO approvals',        icon: DollarSign,path: '/warranty/po-requests'  },
                { label: 'Reports',             icon: Calendar,  path: '/warranty/reports'      },
              ].map(({ label, icon: Icon, path }) => (
                <button key={path} onClick={() => navigate(path)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 7, background: 'var(--color-mist)', border: '1px solid var(--color-border)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--color-text)', textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(252,226,5,0.3)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                >
                  <Icon size={13} color="var(--color-muted)" />
                  {label}
                  <ChevronRight size={11} color="var(--color-muted)" style={{ marginLeft: 'auto' }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}