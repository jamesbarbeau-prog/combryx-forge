import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, FileText, RefreshCw, Shield, Home } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDistanceToNow, differenceInDays } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────

interface CaseRow {
  id: string;
  case_number: string;
  tarion_case_number_normalized: string | null;
  display_name: string | null;
  title: string;
  status: string;
  case_type: string;
  period_type: string | null;
  opened_at: string;
  last_activity_at: string;
  brp_end_date: string | null;
  has_conciliation: boolean | null;
  lot_id: string | null;
  // enriched
  lot_address?: string | null;
  lot_number?: string | null;
  community_name?: string | null;
  homeowner_name?: string | null;
  item_count?: number;
  outstanding_count?: number;
}

// ─── Constants ────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  open:          { label: 'Open',          color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)',   border: 'rgba(30,95,164,0.25)'   },
  in_progress:   { label: 'In Progress',   color: '#D97706', bg: 'rgba(217,119,6,0.10)',   border: 'rgba(217,119,6,0.25)'   },
  pending_parts: { label: 'Pending Parts', color: '#7C3AED', bg: 'rgba(124,58,237,0.10)',  border: 'rgba(124,58,237,0.25)'  },
  pending_owner: { label: 'Pending Owner', color: '#DC2626', bg: 'rgba(220,38,38,0.10)',   border: 'rgba(220,38,38,0.25)'   },
  resolved:      { label: 'Resolved',      color: '#16A34A', bg: 'rgba(22,163,74,0.10)',   border: 'rgba(22,163,74,0.25)'   },
  closed:        { label: 'Closed',        color: '#6B7280', bg: 'rgba(107,114,128,0.10)', border: 'rgba(107,114,128,0.25)' },
  voided:        { label: 'Voided',        color: '#9CA3AF', bg: 'rgba(156,163,175,0.10)', border: 'rgba(156,163,175,0.25)' },
};

const CASE_TYPE_LABELS: Record<string, string> = {
  warranty:     'Warranty',
  conciliation: 'Conciliation',
  inspection:   'Inspection',
  claim:        'Claim',
};

const PERIOD_LABELS: Record<string, string> = {
  initial:      'Initial',
  mid_year:     'Mid-Year',
  year_end:     'Year-End',
  second_year:  '2nd Year',
  msd:          'MSD',
  conciliation: 'Conciliation',
};

function brpColor(date: string | null | undefined): string {
  if (!date) return 'var(--color-muted)';
  const days = differenceInDays(new Date(date), new Date());
  if (days < 0)  return '#DC2626';
  if (days < 14) return '#DC2626';
  if (days < 30) return '#D97706';
  return '#16A34A';
}

function brpLabel(date: string | null | undefined): string {
  if (!date) return '—';
  const days = differenceInDays(new Date(date), new Date());
  if (days < 0)   return `Expired`;
  if (days === 0) return 'Today';
  return `${days}d`;
}

// ─── Component ────────────────────────────────────────────────

export default function CasesPage() {
  const navigate = useNavigate();

  const [companyId, setCompanyId]   = useState<string | null>(null);
  const [cases, setCases]           = useState<CaseRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState('all');
  const [typeFilter, setType]       = useState('all');

  // ── Get company ID ──────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      // Try users table first, fall back to known company ID
      supabase.from('users').select('company_id').eq('id', user.id).single()
        .then(({ data, error }) => {
          if (data?.company_id) {
            setCompanyId(data.company_id);
          } else {
            console.warn('users table lookup failed:', error?.message, '— using fallback');
            setCompanyId('c8bd8b99-090d-4379-86cd-95c3844c09f9');
          }
        });
    });
  }, []);

  // ── Fetch cases ─────────────────────────────────────────────

  const fetchCases = useCallback(async () => {
    if (!companyId) return;
    setRefreshing(true);

    // Step 1 — load cases
    let q = supabase
      .from('cases')
      .select(`
        id, case_number, tarion_case_number_normalized, display_name, title,
        status, case_type, period_type, opened_at, last_activity_at,
        brp_end_date, has_conciliation, lot_id
      `)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('last_activity_at', { ascending: false })
      .limit(200);

    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (typeFilter   !== 'all') q = q.eq('case_type', typeFilter);

    const { data: casesData, error } = await q;

    if (error) {
      console.error('Cases fetch error:', error.message, error.details);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!casesData || casesData.length === 0) {
      setCases([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Step 2 — enrich with lot + community data
    const lotIds = [...new Set(casesData.map(c => c.lot_id).filter(Boolean))] as string[];

    const { data: lotsData } = lotIds.length
      ? await supabase
          .from('warranty_lots')
          .select('id, address, lot_number, homeowner_name, community_id, warranty_communities(name)')
          .in('id', lotIds)
      : { data: [] };

    // Step 3 — get item counts per case
    const caseIds = casesData.map(c => c.id);
    const { data: itemsData } = await supabase
      .from('warranty_items')
      .select('case_id, status')
      .in('case_id', caseIds);

    // Build lookup maps
    const lotMap: Record<string, {
      address:        string | null;
      lot_number:     string | null;
      homeowner_name: string | null;
      community_name: string | null;
    }> = {};

    for (const l of (lotsData ?? []) as {
      id: string;
      address: string | null;
      lot_number: string | null;
      homeowner_name: string | null;
      warranty_communities: { name: string } | null;
    }[]) {
      lotMap[l.id] = {
        address:        l.address,
        lot_number:     l.lot_number,
        homeowner_name: l.homeowner_name,
        community_name: l.warranty_communities?.name ?? null,
      };
    }

    const itemCounts:       Record<string, number> = {};
    const outstandingCounts: Record<string, number> = {};

    for (const item of (itemsData ?? []) as { case_id: string; status: string }[]) {
      itemCounts[item.case_id] = (itemCounts[item.case_id] ?? 0) + 1;
      if (item.status === 'outstanding' || item.status === 'in_progress') {
        outstandingCounts[item.case_id] = (outstandingCounts[item.case_id] ?? 0) + 1;
      }
    }

    setCases(casesData.map(c => ({
      ...(c as CaseRow),
      lot_address:       c.lot_id ? (lotMap[c.lot_id]?.address        ?? null) : null,
      lot_number:        c.lot_id ? (lotMap[c.lot_id]?.lot_number      ?? null) : null,
      homeowner_name:    c.lot_id ? (lotMap[c.lot_id]?.homeowner_name  ?? null) : null,
      community_name:    c.lot_id ? (lotMap[c.lot_id]?.community_name  ?? null) : null,
      item_count:        itemCounts[c.id]        ?? 0,
      outstanding_count: outstandingCounts[c.id] ?? 0,
    })));

    setLoading(false);
    setRefreshing(false);
  }, [companyId, statusFilter, typeFilter]);

  useEffect(() => { if (companyId) fetchCases(); }, [companyId, fetchCases]);

  // ── Client-side search ──────────────────────────────────────

  const filtered = cases.filter(c => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (c.case_number ?? '').toLowerCase().includes(s) ||
      (c.tarion_case_number_normalized ?? '').toLowerCase().includes(s) ||
      (c.display_name ?? c.title ?? '').toLowerCase().includes(s) ||
      (c.lot_address ?? '').toLowerCase().includes(s) ||
      (c.homeowner_name ?? '').toLowerCase().includes(s) ||
      (c.community_name ?? '').toLowerCase().includes(s)
    );
  });

  // ── Stats ─────────────────────────────────────────────────

  const openCount   = cases.filter(c => c.status === 'open').length;
  const activeCount = cases.filter(c => c.status === 'in_progress').length;
  const concilCount = cases.filter(c => c.has_conciliation).length;
  const urgentBRP   = cases.filter(c => {
    if (!c.brp_end_date) return false;
    const days = differenceInDays(new Date(c.brp_end_date), new Date());
    return days >= 0 && days <= 14;
  }).length;

  const selectStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 7,
    border: '1px solid var(--color-border)',
    background: 'var(--color-panel)', fontSize: 11,
    color: 'var(--color-text)', fontFamily: 'var(--font-body)',
    outline: 'none', cursor: 'pointer',
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto', fontFamily: 'var(--font-body)', color: 'var(--color-text)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>Cases</h1>
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>All warranty cases · click to open case detail</p>
        </div>
        <button
          onClick={fetchCases}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: 12, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}
        >
          <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Cases',   value: cases.length, color: 'var(--color-text)' },
          { label: 'Open',          value: openCount,    color: '#1E5FA4'            },
          { label: 'In Progress',   value: activeCount,  color: '#D97706'            },
          { label: 'Conciliation',  value: concilCount,  color: '#DC2626'            },
          { label: 'BRP ≤ 14 Days', value: urgentBRP,    color: '#DC2626'            },
        ].map(s => (
          <div key={s.label} style={{ padding: '10px 16px', borderRadius: 9, background: 'var(--color-panel)', border: '1px solid var(--color-border)', minWidth: 100 }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 3 }}>{s.label}</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <Search size={13} color="var(--color-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search case #, address, homeowner…"
            style={{ width: '100%', padding: '8px 12px 8px 30px', borderRadius: 7, border: '1px solid var(--color-border)', background: 'var(--color-panel)', fontSize: 12, color: 'var(--color-text)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <select style={selectStyle} value={statusFilter} onChange={e => setStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <select style={selectStyle} value={typeFilter} onChange={e => setType(e.target.value)}>
          <option value="all">All Types</option>
          {Object.entries(CASE_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <span style={{ fontSize: 11, color: 'var(--color-muted)', marginLeft: 'auto' }}>
          {filtered.length} case{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--color-panel)', borderRadius: 12, border: '1px solid var(--color-border)', overflow: 'hidden' }}>

        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 160px 130px 90px 90px 80px 36px', padding: '10px 16px', background: 'var(--color-mist)', borderBottom: '1px solid var(--color-border)' }}>
          {['Case #', 'Lot / Community', 'Homeowner', 'Status', 'Type', 'BRP', 'Items', ''].map(h => (
            <span key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{h}</span>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Loading cases…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <FileText size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
              {search ? 'No cases match your search' : 'No cases yet'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              Cases are created from lot detail pages or imported via Tarion import.
            </p>
          </div>
        ) : (
          filtered.map((c, i) => {
            const st       = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.open;
            const bColor   = brpColor(c.brp_end_date);
            const isConcil = c.case_type === 'conciliation';

            return (
              <div
                key={c.id}
                onClick={() => navigate(`/warranty/cases/${c.id}`)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '130px 1fr 160px 130px 90px 90px 80px 36px',
                  padding: '13px 16px',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--color-border)' : 'none',
                  cursor: 'pointer', transition: 'background 0.1s', alignItems: 'center',
                  background: isConcil ? 'rgba(220,38,38,0.02)' : 'transparent',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-mist)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = isConcil ? 'rgba(220,38,38,0.02)' : 'transparent'; }}
              >
                {/* Case number */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>
                      {c.tarion_case_number_normalized ?? c.case_number}
                    </p>
                    {c.has_conciliation && <Shield size={10} color="#DC2626" />}
                  </div>
                  {c.period_type && (
                    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-muted)' }}>
                      {PERIOD_LABELS[c.period_type] ?? c.period_type}
                    </span>
                  )}
                </div>

                {/* Lot + community */}
                <div style={{ paddingRight: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <Home size={10} color="var(--color-muted)" />
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.display_name ?? c.lot_address ?? c.title}
                    </p>
                  </div>
                  {c.community_name && (
                    <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{c.community_name}</p>
                  )}
                </div>

                {/* Homeowner */}
                <div>
                  <p style={{ fontSize: 11, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.homeowner_name ?? '—'}
                  </p>
                  <p style={{ fontSize: 9, color: 'var(--color-muted)', marginTop: 1 }}>
                    {formatDistanceToNow(new Date(c.last_activity_at), { addSuffix: true })}
                  </p>
                </div>

                {/* Status */}
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 100, background: st.bg, border: `1px solid ${st.border}` }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: st.color }}>{st.label}</span>
                  </div>
                </div>

                {/* Type */}
                <div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: isConcil ? '#DC2626' : 'var(--color-muted)' }}>
                    {CASE_TYPE_LABELS[c.case_type] ?? c.case_type}
                  </span>
                </div>

                {/* BRP */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: bColor, fontFamily: 'var(--font-mono)' }}>
                    {brpLabel(c.brp_end_date)}
                  </p>
                </div>

                {/* Items */}
                <div>
                  {(c.item_count ?? 0) > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text)', fontWeight: 700 }}>{c.outstanding_count}</span>
                      <span style={{ fontSize: 9, color: 'var(--color-muted)' }}>/ {c.item_count}</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>—</span>
                  )}
                </div>

                <ChevronRight size={14} color="var(--color-muted)" />
              </div>
            );
          })
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}