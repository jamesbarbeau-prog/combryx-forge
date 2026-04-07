import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Filter, ChevronRight, AlertTriangle,
  Clock, CheckCircle2, Circle, Home, User, Calendar,
  FileText, MessageSquare, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, formatDistanceToNow } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────

interface CaseRow {
  id: string;
  case_number: string;
  title: string;
  status: string;
  case_type: string;
  priority: number;
  opened_at: string;
  last_activity_at: string;
  interaction_count: number;
  document_count: number;
  properties: { address_line1: string; city: string; lot_number: string | null } | null;
  contacts: { first_name: string | null; last_name: string | null; company_name: string | null } | null;
  assigned_user: { first_name: string; last_name: string } | null;
}

// ─── Constants ────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Circle }> = {
  open:          { label: 'Open',          color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)',  icon: Circle       },
  in_progress:   { label: 'In Progress',   color: '#D97706', bg: 'rgba(217,119,6,0.10)',  icon: Clock        },
  pending_parts: { label: 'Pending Parts', color: '#7C3AED', bg: 'rgba(124,58,237,0.10)', icon: Clock        },
  pending_owner: { label: 'Pending Owner', color: '#DC2626', bg: 'rgba(220,38,38,0.10)',  icon: AlertTriangle },
  resolved:      { label: 'Resolved',      color: '#16A34A', bg: 'rgba(22,163,74,0.10)',  icon: CheckCircle2 },
  closed:        { label: 'Closed',        color: '#6B7280', bg: 'rgba(107,114,128,0.10)',icon: CheckCircle2 },
};

const PRIORITY_COLOR: Record<number, { color: string; label: string }> = {
  1: { color: '#DC2626', label: 'Critical' },
  2: { color: '#D97706', label: 'Normal'   },
  3: { color: '#6B7280', label: 'Low'      },
};

const ALL_STATUSES = ['open', 'in_progress', 'pending_parts', 'pending_owner', 'resolved', 'closed'];

// ─── Component ────────────────────────────────────────────────

export default function CasesPage() {
  const navigate = useNavigate();

  const [cases, setCases]           = useState<CaseRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  async function fetchCases() {
    setRefreshing(true);

    let query = supabase
      .from('cases')
      .select(`
        id, case_number, title, status, case_type, priority,
        opened_at, last_activity_at, interaction_count, document_count,
        properties(address_line1, city, lot_number),
        contacts!cases_primary_contact_id_fkey(first_name, last_name, company_name),
        assigned_user:users!cases_assigned_to_id_fkey(first_name, last_name)
      `)
      .is('deleted_at', null)
      .order('last_activity_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;

    if (error) console.error('Cases fetch error:', error);
    if (data) setCases(data as CaseRow[]);

    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { fetchCases(); }, [statusFilter]);

  // Client-side search filter
  const filtered = cases.filter(c => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      c.case_number.toLowerCase().includes(s) ||
      c.title.toLowerCase().includes(s) ||
      c.properties?.address_line1?.toLowerCase().includes(s) ||
      c.properties?.city?.toLowerCase().includes(s) ||
      c.contacts?.first_name?.toLowerCase().includes(s) ||
      c.contacts?.last_name?.toLowerCase().includes(s)
    );
  });

  // Stats for the top bar
  const openCount    = cases.filter(c => c.status === 'open').length;
  const urgentCount  = cases.filter(c => c.status === 'pending_owner' || c.priority === 1).length;
  const activeCount  = cases.filter(c => c.status === 'in_progress').length;

  return (
    <div style={{
      padding: '24px 28px',
      maxWidth: 1300,
      margin: '0 auto',
      fontFamily: 'var(--font-body)',
      color: 'var(--color-text)',
    }}>

      {/* ── Page header ─────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
            Cases
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            Warranty cases imported from BuilderLink · log emails with case number in Outlook or Gmail
          </p>
        </div>
        <button
          onClick={fetchCases}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8,
            background: 'var(--color-mist)', border: '1px solid var(--color-border)',
            cursor: 'pointer', fontSize: 12, color: 'var(--color-muted)',
            fontFamily: 'var(--font-body)',
          }}
        >
          <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* ── Stat pills ──────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Cases',  value: cases.length,  color: 'var(--color-text)' },
          { label: 'Open',         value: openCount,     color: '#1E5FA4'            },
          { label: 'In Progress',  value: activeCount,   color: '#D97706'            },
          { label: 'Needs Attention', value: urgentCount, color: '#DC2626'           },
        ].map(s => (
          <div key={s.label} style={{
            padding: '12px 18px', borderRadius: 10,
            background: 'var(--color-panel)', border: '1px solid var(--color-border)',
            minWidth: 110,
          }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 4 }}>
              {s.label}
            </p>
            <p style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Search + filters ─────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={13} color="var(--color-muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search case number, address, homeowner…"
            style={{
              width: '100%', padding: '9px 12px 9px 34px',
              borderRadius: 8, border: '1px solid var(--color-border)',
              background: 'var(--color-panel)', fontSize: 12,
              color: 'var(--color-text)', fontFamily: 'var(--font-body)',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Status filter pills */}
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', ...ALL_STATUSES].map(s => {
            const cfg = STATUS_CONFIG[s];
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatus(s)}
                style={{
                  padding: '6px 12px', borderRadius: 100,
                  fontSize: 11, fontWeight: active ? 700 : 500,
                  background: active ? (cfg?.bg ?? 'var(--color-mist)') : 'var(--color-mist)',
                  border: `1px solid ${active ? (cfg?.color ?? 'var(--color-text)') + '40' : 'var(--color-border)'}`,
                  color: active ? (cfg?.color ?? 'var(--color-text)') : 'var(--color-muted)',
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                  transition: 'all 0.12s',
                }}
              >
                {s === 'all' ? 'All' : cfg?.label ?? s}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────── */}
      <div style={{
        background: 'var(--color-panel)',
        borderRadius: 12, border: '1px solid var(--color-border)',
        overflow: 'hidden',
      }}>

        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '100px 1fr 140px 130px 80px 80px 36px',
          padding: '10px 16px',
          background: 'var(--color-mist)',
          borderBottom: '1px solid var(--color-border)',
        }}>
          {['Case #', 'Title / Property', 'Homeowner', 'Status', 'Activity', 'Docs', ''].map(h => (
            <span key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)' }}>
              {h}
            </span>
          ))}
        </div>

        {/* Rows */}
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
            Loading cases…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <FileText size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
              {search ? 'No cases match your search' : 'No cases yet'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              Cases are imported from BuilderLink via the Import button.
            </p>
          </div>
        ) : (
          filtered.map((c, i) => {
            const status = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.open;
            const StatusIcon = status.icon;
            const priority = PRIORITY_COLOR[c.priority] ?? PRIORITY_COLOR[2];
            const contactName = c.contacts
              ? [c.contacts.first_name, c.contacts.last_name].filter(Boolean).join(' ') || c.contacts.company_name
              : null;

            return (
              <div
                key={c.id}
                onClick={() => navigate(`/warranty/cases/${c.id}`)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 1fr 140px 130px 80px 80px 36px',
                  padding: '14px 16px',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--color-border)' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                  alignItems: 'center',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-mist)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Case number */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text)', marginBottom: 2 }}>
                    {c.case_number}
                  </p>
                  {c.priority === 1 && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: priority.color, textTransform: 'uppercase' }}>
                      ● Critical
                    </span>
                  )}
                </div>

                {/* Title + property */}
                <div style={{ paddingRight: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.title}
                  </p>
                  {c.properties && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Home size={10} color="var(--color-muted)" />
                      <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                        {c.properties.address_line1}, {c.properties.city}
                        {c.properties.lot_number ? ` · Lot ${c.properties.lot_number}` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Homeowner */}
                <div>
                  {contactName ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <User size={10} color="var(--color-muted)" />
                      <span style={{ fontSize: 11, color: 'var(--color-text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {contactName}
                      </span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>—</span>
                  )}
                  {c.assigned_user && (
                    <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>
                      Tech: {c.assigned_user.first_name} {c.assigned_user.last_name[0]}.
                    </p>
                  )}
                </div>

                {/* Status */}
                <div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 100,
                    background: status.bg, border: `1px solid ${status.color}30`,
                  }}>
                    <StatusIcon size={10} color={status.color} strokeWidth={2} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: status.color }}>
                      {status.label}
                    </span>
                  </div>
                </div>

                {/* Last activity */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MessageSquare size={10} color="var(--color-muted)" />
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
                      {c.interaction_count}
                    </span>
                  </div>
                  <p style={{ fontSize: 9, color: 'var(--color-muted)', marginTop: 2 }}>
                    {formatDistanceToNow(new Date(c.last_activity_at), { addSuffix: true })}
                  </p>
                </div>

                {/* Doc count */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FileText size={10} color="var(--color-muted)" />
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
                    {c.document_count}
                  </span>
                </div>

                {/* Arrow */}
                <ChevronRight size={14} color="var(--color-muted)" />
              </div>
            );
          })
        )}
      </div>

      {filtered.length > 0 && (
        <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 12, textAlign: 'right' }}>
          {filtered.length} case{filtered.length !== 1 ? 's' : ''}
          {search ? ` matching "${search}"` : ''}
        </p>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}