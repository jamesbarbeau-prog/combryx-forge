import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Calendar, Clock, FileWarning, AlertTriangle,
  RefreshCw, CheckCircle2, ChevronDown, ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { differenceInDays, isToday, isTomorrow, format } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────

const today = new Date();

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000);
}

function riskColor(days: number) {
  if (days <= 3)  return { text: '#FF3B3B', bg: 'rgba(255,59,59,0.10)',  border: 'rgba(255,59,59,0.25)'  };
  if (days <= 7)  return { text: '#FF8C00', bg: 'rgba(255,140,0,0.10)',  border: 'rgba(255,140,0,0.25)'  };
  if (days <= 14) return { text: '#D97706', bg: 'rgba(217,119,6,0.08)',  border: 'rgba(217,119,6,0.20)'  };
  return           { text: '#16A34A', bg: 'rgba(22,163,74,0.08)',  border: 'rgba(22,163,74,0.18)'  };
}

function brpBar(brpStart: string, brpEnd: string) {
  const start = new Date(brpStart).getTime();
  const end   = new Date(brpEnd).getTime();
  const now   = today.getTime();
  const pct   = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  const days  = daysUntil(brpEnd);
  const color = pct > 90 ? '#FF3B3B' : pct > 75 ? '#FF8C00' : '#16A34A';
  return { pct, days, color };
}

const PERIOD_LABELS: Record<string, string> = {
  initial: 'Initial', mid_year: 'Mid-Year', year_end: 'Year-End',
  second_year: '2nd Year', msd: 'MSD',
};
const STATUS_LABELS: Record<string, string> = {
  in_brp: 'In BRP', rfc_eligible: 'RFC Eligible', car_issued: 'CAR Issued',
  open: 'Open', resolved: 'Resolved',
};
const TYPE_COLORS: Record<string, string> = { brp: '#1E5FA4', car: '#7C3AED', rfc: '#D97706' };

// ─── Types ────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  company_id: string;
  community_id: string | null;
  access_level: string;
  first_name: string;
  last_name: string;
}

interface Community {
  id: string;
  name: string;
  city: string;
}

interface ActiveConciliation {
  id: string;
  case_id: string;
  stage: string;
  inspection_deadline: string | null;
  inspection_date: string | null;
  inspection_time_slot: string | null;
  inspection_confirmed: boolean;
  warranted_resolution_deadline: string | null;
  builder_directory_hit: boolean;
  case_number: string;
  lot_address: string;
  community_id: string;
  community_name: string;
  community_city: string;
  homeowner_name: string | null;
  warranted_count: number;
}

interface CommunityConcilSummary {
  community: Community;
  rfc: number;
  inspection: number;
  warranted: number;
  claim: number;
  total: number;
  items: ActiveConciliation[];
}

// ─── Stage config ─────────────────────────────────────────────

const STAGE_CONFIG = {
  rfc:       { label: 'RFC',        color: '#D97706', bg: 'rgba(217,119,6,0.08)',  border: 'rgba(217,119,6,0.25)',  icon: FileWarning   },
  inspection:{ label: 'Inspection', color: '#DC2626', bg: 'rgba(220,38,38,0.08)',  border: 'rgba(220,38,38,0.25)',  icon: Calendar      },
  warranted: { label: 'Warranted',  color: '#7C3AED', bg: 'rgba(124,58,237,0.08)', border: 'rgba(124,58,237,0.25)', icon: Shield        },
  claim:     { label: 'Claim',      color: '#DC2626', bg: 'rgba(220,38,38,0.08)',  border: 'rgba(220,38,38,0.35)',  icon: AlertTriangle },
};

// ─── Mock data ────────────────────────────────────────────────

const EVEREST_ID = 'a9a40e39-6131-43be-9e19-96420a84653d';
const OTHER_ID   = 'other-community-id';

const MOCK_CASES = [
  { id:'1', lot:'Lot 45',    address:'123 Rideau Crest Dr',      community:'Everest',            community_id_mock: EVEREST_ID, homeowner:'Marcus & Diana Chen',  enrollment:'H1892341', period_type:'year_end',    status:'in_brp',      brp_start:'2026-01-15', brp_end:'2026-05-15', items_total:12, items_done:7, items_outstanding:5, risk:'critical', tech:'Mike R.',  evidence_score:42, next_action:'Access log missing on 2 items' },
  { id:'2', lot:'Lot 12',    address:'88 Stonehaven Ave',        community:'Everest',            community_id_mock: EVEREST_ID, homeowner:'Priya Sharma',         enrollment:'H1890012', period_type:'initial',     status:'in_brp',      brp_start:'2026-02-10', brp_end:'2026-06-10', items_total:6,  items_done:6, items_outstanding:0, risk:'good',     tech:'Sarah L.', evidence_score:95, next_action:'All items complete — ready to close' },
  { id:'3', lot:'Lot 78',    address:'204 Maple Leaf Way',       community:'Westpark Manors',    community_id_mock: OTHER_ID,   homeowner:'Robert & Anne Patel',  enrollment:'H1901234', period_type:'second_year', status:'rfc_eligible', brp_start:'2025-09-01', brp_end:'2026-01-01', items_total:9,  items_done:4, items_outstanding:5, risk:'critical', tech:null,       evidence_score:28, next_action:'BRP expired — RFC eligible' },
  { id:'4', lot:'Unit 302',  address:'45 Waterfront Blvd #302', community:'Harbour Gate Condos',community_id_mock: OTHER_ID,   homeowner:'Jean-Pierre Leclair',  enrollment:'H1885567', period_type:'msd',         status:'car_issued',  brp_start:'2025-06-01', brp_end:'2025-09-01', items_total:3,  items_done:0, items_outstanding:3, risk:'critical', tech:'Dave K.',  evidence_score:55, next_action:'CAR issued — deadline Apr 12' },
  { id:'5', lot:'Lot 23',    address:'67 Crimson Oak Blvd',     community:'Westpark Manors',    community_id_mock: OTHER_ID,   homeowner:'Sandra Thompson',      enrollment:'H1897723', period_type:'year_end',    status:'in_brp',      brp_start:'2026-02-28', brp_end:'2026-06-28', items_total:4,  items_done:1, items_outstanding:3, risk:'warning',  tech:'Mike R.',  evidence_score:67, next_action:'Schedule inspection — windows' },
];

const MOCK_PO_APPROVALS = [
  { id:'po1', tech:'Mike R.',  lot:'Lot 45',   trade:'Drywall Pro Inc.',     scope:'Patch & paint master bedroom', amount:1240, submitted:'2h ago', urgent:true,  community_id_mock: EVEREST_ID },
  { id:'po2', tech:'Dave K.',  lot:'Unit 302', trade:'Structural Plus Ltd.', scope:'Beam assessment & report',     amount:3800, submitted:'4h ago', urgent:true,  community_id_mock: OTHER_ID   },
  { id:'po3', tech:'Sarah L.', lot:'Lot 67',   trade:'GlassTech Windows',    scope:'Replace bedroom window seal',  amount:680,  submitted:'1d ago', urgent:false, community_id_mock: EVEREST_ID },
];

const MOCK_DEADLINES = [
  { label:'Unit 302 — Post-CAR Due', date:'2026-04-12', type:'car', community_id_mock: OTHER_ID   },
  { label:'Lot 78 — RFC Window',     date:'2026-04-20', type:'rfc', community_id_mock: OTHER_ID   },
  { label:'Lot 45 — BRP Expires',    date:'2026-05-15', type:'brp', community_id_mock: EVEREST_ID },
  { label:'Lot 12 — BRP Expires',    date:'2026-06-10', type:'brp', community_id_mock: EVEREST_ID },
  { label:'Lot 23 — BRP Expires',    date:'2026-06-28', type:'brp', community_id_mock: OTHER_ID   },
];

// ─── Conciliation helpers ─────────────────────────────────────

function getConcilDeadline(c: ActiveConciliation) {
  if (c.stage === 'rfc')        return { days: c.inspection_deadline ? differenceInDays(new Date(c.inspection_deadline), new Date()) : null, date: c.inspection_deadline, label: '14-day deadline' };
  if (c.stage === 'inspection') return { days: c.inspection_date ? differenceInDays(new Date(c.inspection_date), new Date()) : null, date: c.inspection_date, label: 'Inspection' };
  if (c.stage === 'warranted')  return { days: c.warranted_resolution_deadline ? differenceInDays(new Date(c.warranted_resolution_deadline), new Date()) : null, date: c.warranted_resolution_deadline, label: '30-day deadline' };
  return { days: 0, date: null, label: 'Claim active' };
}

function deadlineDayLabel(days: number | null, date: string | null): string {
  if (!date) return '—';
  if (days === null) return format(new Date(date), 'MMM d');
  if (days < 0)   return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7)  return `${days}d`;
  return format(new Date(date), 'MMM d');
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

// ─── Community conciliation row ───────────────────────────────

function CommunityConcilRow({ summary, isExpanded, onToggle, onCaseClick }: {
  summary: CommunityConcilSummary;
  isExpanded: boolean;
  onToggle: () => void;
  onCaseClick: (caseId: string) => void;
}) {
  const { community, rfc, inspection, warranted, claim, total, items } = summary;
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
      <div onClick={hasItems ? onToggle : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: hasItems ? 'pointer' : 'default' }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: hasItems ? 'var(--color-text)' : 'var(--color-muted)', width: 140, flexShrink: 0 }}>
          {community.name}
        </span>
        <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
          {rfc > 0        && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(217,119,6,0.10)',  color: '#D97706', border: '1px solid rgba(217,119,6,0.25)'  }}>{rfc} RFC</span>}
          {inspection > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(220,38,38,0.10)',  color: '#DC2626', border: '1px solid rgba(220,38,38,0.25)'  }}>{inspection} Inspection</span>}
          {warranted > 0  && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(124,58,237,0.10)', color: '#7C3AED', border: '1px solid rgba(124,58,237,0.25)' }}>{warranted} Warranted</span>}
          {claim > 0      && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 100, background: 'rgba(220,38,38,0.15)',  color: '#DC2626', border: '1px solid rgba(220,38,38,0.35)'  }}>⚠ {claim} Claim</span>}
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
          {renderGroup('Today',           '#DC2626',              sorted.filter(c => c.inspection_date && isToday(new Date(c.inspection_date))))}
          {renderGroup('Tomorrow',        '#D97706',              sorted.filter(c => c.inspection_date && isTomorrow(new Date(c.inspection_date))))}
          {renderGroup('Upcoming',        'var(--color-muted)',   sorted.filter(c => c.inspection_date && !isToday(new Date(c.inspection_date)) && !isTomorrow(new Date(c.inspection_date))))}
          {renderGroup('Awaiting Date',   'var(--color-muted)',   sorted.filter(c => !c.inspection_date))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export default function WarrantyTodayPage() {
  const navigate = useNavigate();
  const [caseFilter, setCaseFilter] = useState<'all' | 'critical' | 'warning' | 'good'>('all');
  const [profile, setProfile]             = useState<UserProfile | null>(null);
  const [allCommunities, setAllCommunities] = useState<Community[]>([]);
  const [conciliations, setConciliations]   = useState<ActiveConciliation[]>([]);
  const [concilLoading, setConcilLoading]   = useState(true);
  const [expandedRows, setExpandedRows]     = useState<Set<string>>(new Set());

  const dateStr = today.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // ── Fetch user profile ───────────────────────────────────

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('id, company_id, community_id, access_level, first_name, last_name')
      .eq('id', user.id)
      .single();
    if (data) setProfile(data as UserProfile);
  }, []);

  // ── Fetch communities ────────────────────────────────────

  const fetchCommunities = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('warranty_communities')
      .select('id, name, city')
      .eq('company_id', profile.company_id)
      .order('name', { ascending: true });
    if (data) setAllCommunities(data as Community[]);
  }, [profile]);

  // ── Fetch conciliations ──────────────────────────────────

  const fetchConciliations = useCallback(async () => {
  if (!profile) return;
  setConcilLoading(true);

  // Step 1 — get subcases
  const { data: subcases, error } = await supabase
    .from('conciliation_subcases')
    .select('id, case_id, stage, inspection_deadline, inspection_date, inspection_time_slot, inspection_confirmed, warranted_resolution_deadline, builder_directory_hit')
    .not('stage', 'eq', 'cancelled')
    .is('outcome', null)
    .order('inspection_date', { ascending: true, nullsFirst: false });

  if (error || !subcases) { console.error(error); setConcilLoading(false); return; }

  // Step 2 — get case numbers and lot_ids
  const caseIds = subcases.map(s => s.case_id);
  const { data: cases } = await supabase
    .from('cases')
    .select('id, case_number, lot_id')
    .in('id', caseIds);

  // Step 3 — get lot addresses and community_ids
  const lotIds = (cases ?? []).map(c => c.lot_id).filter(Boolean);
  const { data: lots } = await supabase
    .from('warranty_lots')
    .select('id, address, homeowner_name, community_id')
    .in('id', lotIds);

  // Step 4 — get community names and cities
  const communityIds = (lots ?? []).map(l => l.community_id).filter(Boolean);
  const { data: communities } = await supabase
    .from('warranty_communities')
    .select('id, name, city')
    .in('id', communityIds);

  // Step 5 — get warranted item counts
  const subcaseIds = subcases.map(s => s.id);
  const { data: itemCounts } = await supabase
    .from('conciliation_items')
    .select('subcase_id, tarion_determination')
    .in('subcase_id', subcaseIds);

  // Build lookup maps
  const caseMap = Object.fromEntries((cases ?? []).map(c => [c.id, c]));
  const lotMap  = Object.fromEntries((lots ?? []).map(l => [l.id, l]));
  const commMap = Object.fromEntries((communities ?? []).map(c => [c.id, c]));
  const countMap: Record<string, number> = {};
  for (const item of (itemCounts ?? []) as { subcase_id: string; tarion_determination: string }[]) {
    if (item.tarion_determination === 'warranted') {
      countMap[item.subcase_id] = (countMap[item.subcase_id] ?? 0) + 1;
    }
  }

  // Assemble
  const mapped: ActiveConciliation[] = subcases.map(s => {
    const c    = caseMap[s.case_id] ?? {};
    const lot  = lotMap[c.lot_id]   ?? {};
    const comm = commMap[lot.community_id] ?? {};
    return {
      id:                            s.id,
      case_id:                       s.case_id,
      stage:                         s.stage,
      inspection_deadline:           s.inspection_deadline,
      inspection_date:               s.inspection_date,
      inspection_time_slot:          s.inspection_time_slot,
      inspection_confirmed:          s.inspection_confirmed,
      warranted_resolution_deadline: s.warranted_resolution_deadline,
      builder_directory_hit:         s.builder_directory_hit,
      case_number:                   c.case_number ?? '—',
      lot_address:                   lot.address   ?? '—',
      homeowner_name:                lot.homeowner_name ?? null,
      community_id:                  comm.id       ?? '',
      community_name:                comm.name     ?? '—',
      community_city:                comm.city     ?? '—',
      warranted_count:               countMap[s.id] ?? 0,
    };
  });

  setConciliations(mapped);
  setConcilLoading(false);
}, [profile]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);
  useEffect(() => { if (profile) { fetchCommunities(); fetchConciliations(); } }, [profile, fetchCommunities, fetchConciliations]);

  // ── Access level scoping ─────────────────────────────────

  const userCommunity = allCommunities.find(c => c.id === profile?.community_id);
  const userCity      = userCommunity?.city ?? null;

  // Which communities show up in the conciliation section:
  // community & city users → all communities in their city
  // company users → all communities
  const visibleCommunities = allCommunities.filter(c => {
    if (profile?.access_level === 'company') return true;
    return c.city === userCity;
  });

  // Community conciliation summary rows
  const communitySummaries: CommunityConcilSummary[] = visibleCommunities.map(community => {
    const items = conciliations.filter(c => c.community_id === community.id);
    return {
      community,
      rfc:        items.filter(c => c.stage === 'rfc').length,
      inspection: items.filter(c => c.stage === 'inspection').length,
      warranted:  items.filter(c => c.stage === 'warranted').length,
      claim:      items.filter(c => c.stage === 'claim').length,
      total:      items.length,
      items,
    };
  }).sort((a, b) => b.total - a.total);

  const totalConcil = communitySummaries.reduce((sum, s) => sum + s.total, 0);

  function toggleRow(communityId: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(communityId)) next.delete(communityId); else next.add(communityId);
      return next;
    });
  }

  // ── Scoped mock data ─────────────────────────────────────

  const scopedCases = MOCK_CASES.filter(c => {
    if (!profile || profile.access_level === 'company') return true;
    if (profile.access_level === 'city') return true; // in real data: filter by city
    return c.community_id_mock === profile.community_id;
  });

  const scopedPOs = MOCK_PO_APPROVALS.filter(p => {
    if (!profile || profile.access_level !== 'community') return true;
    return p.community_id_mock === profile.community_id;
  });

  const scopedDeadlines = MOCK_DEADLINES.filter(d => {
    if (!profile || profile.access_level !== 'community') return true;
    return d.community_id_mock === profile.community_id;
  });

  const critical    = scopedCases.filter(c => c.risk === 'critical').length;
  const warning     = scopedCases.filter(c => c.risk === 'warning').length;
  const rfcCount    = scopedCases.filter(c => c.status === 'rfc_eligible').length;
  const lowEvidence = scopedCases.filter(c => c.evidence_score < 60).length;
  const filtered    = scopedCases.filter(c => caseFilter === 'all' || c.risk === caseFilter);

  return (
    <div style={{ padding: '20px 28px', maxWidth: 1440, margin: '0 auto', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-text)', marginBottom: 2 }}>Command Centre</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>{dateStr}</p>
            {userCommunity && (
              <>
                <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>·</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)' }}>{userCommunity.name}</span>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 100, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  {profile?.access_level}
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.18)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A', boxShadow: '0 0 6px rgba(22,163,74,0.8)' }} />
          <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>Synced today 6:00 AM</span>
        </div>
      </div>

      {/* ── STAT ROW ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Active Cases',  value: scopedCases.length, color: 'var(--color-text)', sub: profile?.access_level === 'community' ? (userCommunity?.name ?? 'your community') : 'across communities', click: () => navigate('/warranty/communities') },
          { label: 'Critical Risk', value: critical,           color: '#FF3B3B',           sub: 'action required today', click: () => setCaseFilter('critical') },
          { label: 'Warning',       value: warning,            color: '#FF8C00',           sub: 'due within 14 days',    click: () => setCaseFilter('warning')  },
          { label: 'RFC Eligible',  value: rfcCount,           color: '#D97706',           sub: 'conciliation risk',     click: () => setCaseFilter('all')      },
          { label: 'Low Evidence',  value: lowEvidence,        color: '#7C3AED',           sub: 'chargeability risk',    click: () => setCaseFilter('all')      },
        ].map(s => (
          <div key={s.label} onClick={s.click}
            style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)', cursor: 'pointer', transition: 'all 0.12s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(252,226,5,0.3)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
          >
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--color-muted)', marginBottom: 6 }}>{s.label}</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: s.color, fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em', lineHeight: 1 }}>{s.value}</p>
            <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 4 }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════
          CONCILIATION — CITY-WIDE, COMMUNITY ROWS
      ══════════════════════════════════════════ */}
      <div style={{ marginBottom: 24, padding: '18px 20px', borderRadius: 12, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={14} color="#DC2626" strokeWidth={2} />
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text)' }}>
              {userCity ? `${userCity} Conciliations` : 'Conciliations'}
            </span>
            {totalConcil > 0 && (
              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 100, background: 'rgba(220,38,38,0.10)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.2)' }}>
                {totalConcil} active
              </span>
            )}
          </div>
          <button onClick={fetchConciliations}
            style={{ padding: '4px 8px', borderRadius: 6, background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer', color: 'var(--color-muted)', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
            <RefreshCw size={9} />
          </button>
        </div>

        {concilLoading ? (
          <p style={{ fontSize: 12, color: 'var(--color-muted)', padding: '16px 0', textAlign: 'center' }}>Loading conciliations…</p>
        ) : visibleCommunities.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--color-muted)', padding: '16px 0', textAlign: 'center' }}>No communities set up yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {communitySummaries.map(summary => (
              <CommunityConcilRow
                key={summary.community.id}
                summary={summary}
                isExpanded={expandedRows.has(summary.community.id)}
                onToggle={() => toggleRow(summary.community.id)}
                onCaseClick={caseId => navigate(`/warranty/cases/${caseId}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── PO APPROVALS ── */}
      {scopedPOs.length > 0 && (
        <div style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF3B3B', boxShadow: '0 0 8px rgba(255,59,59,0.7)' }} />
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>PO Approvals Pending</p>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 100, background: 'rgba(255,59,59,0.10)', color: '#FF3B3B', border: '1px solid rgba(255,59,59,0.2)' }}>{scopedPOs.length} waiting</span>
            </div>
            <button onClick={() => navigate('/warranty/po-requests')}
              style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: 'rgba(252,226,5,0.10)', border: '1px solid rgba(252,226,5,0.25)', color: '#8A7600', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              Review All →
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {scopedPOs.map(po => (
              <div key={po.id}
                style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--color-mist)', border: `1px solid ${po.urgent ? 'rgba(255,59,59,0.2)' : 'var(--color-border)'}`, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(252,226,5,0.3)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = po.urgent ? 'rgba(255,59,59,0.2)' : 'var(--color-border)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>{po.lot}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#16A34A', fontFamily: 'var(--font-mono)' }}>${po.amount.toLocaleString()}</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>{po.trade}</p>
                <p style={{ fontSize: 10, color: 'var(--color-muted)', marginBottom: 8 }}>{po.scope}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 9, color: 'var(--color-muted)' }}>By {po.tech} · {po.submitted}</span>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button style={{ padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.25)', color: '#16A34A', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>✓ Approve</button>
                    <button style={{ padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MAIN TWO COLUMNS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>

        {/* LEFT — CASES */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {([
                { id: 'all',      label: 'All Cases',  count: scopedCases.length },
                { id: 'critical', label: '🔴 Critical', count: critical },
                { id: 'warning',  label: '🟡 Warning',  count: warning  },
                { id: 'good',     label: '🟢 On Track', count: scopedCases.filter(c => c.risk === 'good').length },
              ] as const).map(f => (
                <button key={f.id} onClick={() => setCaseFilter(f.id)}
                  style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: caseFilter === f.id ? 700 : 400, background: caseFilter === f.id ? 'rgba(252,226,5,0.10)' : 'transparent', border: caseFilter === f.id ? '1px solid rgba(252,226,5,0.25)' : '1px solid var(--color-border)', color: caseFilter === f.id ? '#8A7600' : 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  {f.label} <span style={{ opacity: 0.6, marginLeft: 4 }}>{f.count}</span>
                </button>
              ))}
            </div>
            <button onClick={() => navigate('/warranty/communities')}
              style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              View Portfolio →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(c => {
              const brp         = brpBar(c.brp_start, c.brp_end);
              const risk        = riskColor(brp.days);
              const periodLabel = PERIOD_LABELS[c.period_type] ?? c.period_type;
              const statusLabel = STATUS_LABELS[c.status]      ?? c.status;
              const evScore     = c.evidence_score;
              const evColor     = evScore >= 80 ? '#16A34A' : evScore >= 60 ? '#D97706' : '#FF3B3B';

              return (
                <div key={c.id} onClick={() => navigate(`/warranty/cases/${c.id}`)}
                  style={{ padding: '16px 18px', borderRadius: 12, background: 'var(--color-panel)', border: `1px solid ${c.risk === 'critical' ? 'rgba(255,59,59,0.18)' : c.risk === 'warning' ? 'rgba(255,140,0,0.12)' : 'var(--color-border)'}`, cursor: 'pointer', transition: 'all 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-panel-raised)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--color-panel)'}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text)' }}>{c.lot}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: 'var(--color-mist)', color: 'var(--color-muted)', border: '1px solid var(--color-border)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{periodLabel}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: risk.bg, color: risk.text, border: `1px solid ${risk.border}`, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{statusLabel}</span>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 1 }}>{c.address} · {c.community}</p>
                      <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{c.homeowner} · <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{c.enrollment}</span></p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                      <p style={{ fontSize: 24, fontWeight: 900, color: risk.text, fontFamily: 'var(--font-mono)', lineHeight: 1, letterSpacing: '-0.03em' }}>{brp.days > 0 ? brp.days : 0}</p>
                      <p style={{ fontSize: 9, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>{brp.days > 0 ? 'days left' : 'EXPIRED'}</p>
                      <p style={{ fontSize: 9, color: 'var(--color-muted)', marginTop: 1 }}>BRP</p>
                    </div>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Builder Repair Period</span>
                      <span style={{ fontSize: 9, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                        {new Date(c.brp_start).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} → {new Date(c.brp_end).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <div style={{ height: 4, borderRadius: 100, background: 'var(--color-mist)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${brp.pct}%`, borderRadius: 100, background: brp.color, boxShadow: `0 0 6px ${brp.color}50` }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {Array.from({ length: c.items_total }).map((_, i) => (
                          <div key={i} style={{ width: 6, height: 6, borderRadius: 1, background: i < c.items_done ? '#16A34A' : 'var(--color-mist)', border: '1px solid var(--color-border)' }} />
                        ))}
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{c.items_done}/{c.items_total}</span>
                      {c.items_outstanding > 0 && <span style={{ fontSize: 10, color: risk.text, fontWeight: 700 }}>{c.items_outstanding} outstanding</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 36, height: 4, borderRadius: 100, background: 'var(--color-mist)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${evScore}%`, background: evColor, borderRadius: 100 }} />
                      </div>
                      <span style={{ fontSize: 9, color: evColor, fontWeight: 700 }}>{evScore}% evidence</span>
                    </div>
                    {c.tech && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(252,226,5,0.12)', border: '1px solid rgba(252,226,5,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#8A7600' }}>
                          {c.tech.charAt(0)}
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{c.tech}</span>
                      </div>
                    )}
                    <div style={{ flex: 1 }} />
                    <div style={{ padding: '3px 10px', borderRadius: 5, background: risk.bg, border: `1px solid ${risk.border}`, fontSize: 10, color: risk.text, fontWeight: 600 }}>{c.next_action}</div>
                    <div style={{ padding: '4px 10px', borderRadius: 5, background: 'rgba(252,226,5,0.08)', border: '1px solid rgba(252,226,5,0.2)', fontSize: 10, color: '#8A7600', fontWeight: 700 }}>Open Case →</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT — DEADLINES + EVIDENCE */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Tarion Deadlines</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
            {scopedDeadlines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(d => {
              const days = daysUntil(d.date);
              const r    = riskColor(days);
              return (
                <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--color-panel)', border: `1px solid ${days <= 7 ? r.border : 'var(--color-border)'}` }}>
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4, background: `${TYPE_COLORS[d.type]}12`, color: TYPE_COLORS[d.type], border: `1px solid ${TYPE_COLORS[d.type]}25`, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>{d.type.toUpperCase()}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)', flex: 1 }}>{d.label}</span>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 900, color: r.text, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{days}d</p>
                    <p style={{ fontSize: 9, color: 'var(--color-muted)' }}>{new Date(d.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Evidence Health</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {scopedCases.filter(c => c.evidence_score < 80).sort((a, b) => a.evidence_score - b.evidence_score).map(c => {
              const evColor = c.evidence_score >= 60 ? '#D97706' : '#FF3B3B';
              return (
                <div key={c.id} onClick={() => navigate(`/warranty/cases/${c.id}`)}
                  style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--color-panel)', border: '1px solid var(--color-border)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(252,226,5,0.3)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>{c.lot}</span>
                    <span style={{ fontSize: 12, fontWeight: 900, color: evColor, fontFamily: 'var(--font-mono)' }}>{c.evidence_score}%</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 100, background: 'var(--color-mist)', overflow: 'hidden', marginBottom: 5 }}>
                    <div style={{ height: '100%', width: `${c.evidence_score}%`, background: evColor, borderRadius: 100 }} />
                  </div>
                  <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                    {c.evidence_score < 60 ? '⚠️ High chargeability risk — add evidence before conciliation' : 'Add access logs and photos'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}