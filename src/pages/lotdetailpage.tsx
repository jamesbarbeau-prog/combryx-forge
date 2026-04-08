import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const PERIOD_LABELS: Record<string, string> = {
  initial:     '30-Day Initial',
  mid_year:    'Mid-Year',
  year_end:    'Year-End',
  second_year: '2nd Year',
  msd:         'Major Structural Defect',
};

const PERIOD_ORDER = ['initial', 'mid_year', 'year_end', 'second_year', 'msd'];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  open:          { label: 'Open',          color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)',  border: 'rgba(30,95,164,0.25)'  },
  in_progress:   { label: 'In Progress',   color: '#D97706', bg: 'rgba(217,119,6,0.10)',  border: 'rgba(217,119,6,0.25)'  },
  pending_parts: { label: 'Pending Parts', color: '#7C3AED', bg: 'rgba(124,58,237,0.10)', border: 'rgba(124,58,237,0.25)' },
  pending_owner: { label: 'Pending Owner', color: '#DC2626', bg: 'rgba(220,38,38,0.10)',  border: 'rgba(220,38,38,0.25)'  },
  resolved:      { label: 'Resolved',      color: '#16A34A', bg: 'rgba(22,163,74,0.10)',  border: 'rgba(22,163,74,0.25)'  },
  closed:        { label: 'Closed',        color: '#6B7280', bg: 'rgba(107,114,128,0.10)',border: 'rgba(107,114,128,0.25)' },
};

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Period bar (timeline row) ────────────────────────────────

function PeriodBar({
  period,
  linkedCase,
  onCaseClick,
}: {
  period: any;
  linkedCase: any | null;
  onCaseClick: (id: string) => void;
}) {
  const today     = new Date();
  const open      = new Date(period.form_open_date);
  const close     = new Date(period.form_close_date);
  const isOpen    = today >= open && today <= close;
  const isPast    = today > close;
  const isFuture  = today < open;
  const daysToClose = daysUntil(period.form_close_date);
  const daysToOpen  = daysUntil(period.form_open_date);

  let statusColor  = '#6B7280';
  let statusLabel  = 'Upcoming';
  let statusBg     = 'rgba(107,114,128,0.08)';
  let statusBorder = 'rgba(107,114,128,0.18)';

  if (linkedCase) {
    const sc = STATUS_CONFIG[linkedCase.status] ?? STATUS_CONFIG.open;
    statusColor = sc.color; statusLabel = sc.label; statusBg = sc.bg; statusBorder = sc.border;
  } else if (period.is_optional && isPast) {
    statusLabel = 'Waived';
  } else if (isOpen) {
    statusColor = '#16A34A'; statusLabel = 'Window Open';
    statusBg = 'rgba(22,163,74,0.08)'; statusBorder = 'rgba(22,163,74,0.2)';
  } else if (isPast) {
    statusLabel = 'Closed';
  }

  // BRP urgency
  const brpUrgent = linkedCase?.brp_end_date && daysUntil(linkedCase.brp_end_date) <= 14 && daysUntil(linkedCase.brp_end_date) > 0;
  const brpExpired = linkedCase?.brp_end_date && daysUntil(linkedCase.brp_end_date) <= 0;

  return (
    <div style={{
      padding: '16px 18px',
      borderRadius: 10,
      background: 'var(--color-panel)',
      border: `1px solid ${brpUrgent ? 'rgba(220,38,38,0.3)' : isOpen ? 'rgba(22,163,74,0.25)' : 'var(--color-border)'}`,
      opacity: isFuture ? 0.55 : 1,
      transition: 'opacity 0.15s',
    }}>
      {/* Row top */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text)' }}>
            {PERIOD_LABELS[period.period_type] ?? period.period_type}
          </span>
          {period.is_optional && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 100, background: 'rgba(107,163,214,0.12)', color: '#6BA3D6', border: '1px solid rgba(107,163,214,0.2)' }}>
              OPTIONAL
            </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 100, background: statusBg, color: statusColor, border: `1px solid ${statusBorder}` }}>
            {statusLabel}
          </span>
          {brpUrgent && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#DC2626' }}>
              <AlertTriangle size={11} /> BRP expires in {daysUntil(linkedCase.brp_end_date)}d
            </span>
          )}
          {brpExpired && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#6B7280' }}>
              BRP expired
            </span>
          )}
        </div>

        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 10, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
            {fmt(period.form_open_date)} → {fmt(period.form_close_date)}
          </p>
          {isOpen && !linkedCase && (
            <p style={{ fontSize: 10, fontWeight: 700, color: '#16A34A' }}>
              {daysToClose} days remaining in window
            </p>
          )}
          {isFuture && (
            <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>
              Opens in {daysToOpen} days
            </p>
          )}
        </div>
      </div>

      {/* Details row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 11, color: 'var(--color-muted)' }}>
        <span>BRP: <strong style={{ color: 'var(--color-text)' }}>{period.brp_days} days</strong></span>

        {linkedCase ? (
          <>
            <span>
              Case: <strong style={{ fontFamily: 'var(--font-mono)' }}>{linkedCase.case_number}</strong>
            </span>
            {linkedCase.brp_end_date && (
              <span>
                BRP ends: <strong style={{ color: brpUrgent ? '#DC2626' : 'var(--color-text)' }}>
                  {fmt(linkedCase.brp_end_date)}
                </strong>
              </span>
            )}
            {linkedCase.interaction_count > 0 && (
              <span>{linkedCase.interaction_count} interaction{linkedCase.interaction_count !== 1 ? 's' : ''}</span>
            )}
            {/* Open Case button */}
            <button
              onClick={() => onCaseClick(linkedCase.id)}
              style={{
                marginLeft: 'auto',
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 6,
                fontSize: 11, fontWeight: 700,
                background: 'rgba(30,95,164,0.10)',
                border: '1px solid rgba(30,95,164,0.25)',
                color: '#1E5FA4', cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}
            >
              Open Case <ChevronRight size={11} />
            </button>
          </>
        ) : isOpen && !period.is_optional ? (
          <div style={{
            marginLeft: 'auto',
            padding: '5px 12px', borderRadius: 6,
            fontSize: 11, fontWeight: 600,
            background: 'rgba(22,163,74,0.08)',
            border: '1px solid rgba(22,163,74,0.2)',
            color: '#16A34A',
          }}>
            ✓ Homeowner submission window is open
          </div>
        ) : isOpen && period.is_optional ? (
          <div style={{
            marginLeft: 'auto',
            padding: '5px 12px', borderRadius: 6,
            fontSize: 11, color: '#6BA3D6',
            background: 'rgba(107,163,214,0.08)',
            border: '1px solid rgba(107,163,214,0.2)',
          }}>
            Optional period — encourage homeowner to submit seasonal issues
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────

export default function LotDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [lot, setLot]         = useState<any>(null);
  const [periods, setPeriods] = useState<any[]>([]);
  const [cases, setCases]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);

    const [{ data: l }, { data: p }] = await Promise.all([
      supabase.from('warranty_lots')
        .select('*, warranty_communities(name)')
        .eq('id', id!)
        .single(),
      supabase.from('warranty_periods')
        .select('*')
        .eq('lot_id', id!)
        .order('form_open_date'),
    ]);

    if (l) setLot(l);

    if (p) {
      setPeriods(
        [...p].sort((a: any, b: any) =>
          PERIOD_ORDER.indexOf(a.period_type) - PERIOD_ORDER.indexOf(b.period_type)
        )
      );
    }

    // Load cases from the NEW cases table, linked by property or lot
    // Try matching by lot's property_id first, then fallback to warranty_cases
    const { data: casesData } = await supabase
  .from('cases')
  .select('id, case_number, title, status, case_type, priority, opened_at, brp_end_date, interaction_count, document_count, period_type')
  .eq('lot_id', id!)
  .is('deleted_at', null)
  .order('opened_at');

setCases(casesData ?? []);
    setLoading(false);
  }

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
      Loading lot…
    </div>
  );

  if (!lot) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
      Lot not found.
    </div>
  );

  const wsd = lot.warranty_start_date;
  const wsdDate = new Date(wsd);
  const warrantyEnd = new Date(wsdDate);
  warrantyEnd.setFullYear(warrantyEnd.getFullYear() + 7);
  const totalDays = warrantyEnd.getTime() - wsdDate.getTime();
  const elapsed   = Date.now() - wsdDate.getTime();
  const pct       = Math.min(100, Math.max(0, (elapsed / totalDays) * 100));

  // Match a case to a period
  function caseForPeriod(period: any) {
    return cases.find(c =>
      c.period_type === period.period_type ||
      c.period_id === period.id
    ) ?? null;
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto', fontFamily: 'var(--font-body)', color: 'var(--color-text)' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 12, color: 'var(--color-muted)' }}>
        <span style={{ cursor: 'pointer' }} onClick={() => navigate('/warranty/communities')}>
          Communities
        </span>
        <ChevronRight size={12} />
        <span style={{ cursor: 'pointer' }} onClick={() => navigate(`/warranty/lots?community=${lot.community_id}`)}>
          {lot.warranty_communities?.name}
        </span>
        <ChevronRight size={12} />
        <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{lot.lot_number}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
            {lot.lot_number}{lot.unit_number ? ` — Unit ${lot.unit_number}` : ''}
          </h1>
          {lot.address && (
            <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 2 }}>{lot.address}</p>
          )}
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>{lot.warranty_communities?.name}</p>
        </div>
      </div>
      <button
  onClick={() => navigate(`/warranty/lots/${id}/import-form`)}
  className="forge-button forge-button--primary"
>
  ↑ Import Tarion Form
</button>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>

        {/* LEFT — Warranty timeline */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--color-muted)', marginBottom: 12 }}>
            Warranty Timeline
          </p>

          {/* 7-year bar */}
          <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                Start: <strong style={{ color: 'var(--color-text)' }}>{fmt(wsd)}</strong>
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                Expires: <strong style={{ color: 'var(--color-text)' }}>{fmt(warrantyEnd.toISOString().split('T')[0])}</strong>
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 100, background: 'var(--color-mist)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`, borderRadius: 100,
                background: 'linear-gradient(90deg, #FCE205 0%, #D4A800 100%)',
              }} />
            </div>
            <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 5 }}>
              {pct.toFixed(1)}% of 7-year warranty elapsed
            </p>
          </div>

          {/* Period rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {periods.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13, background: 'var(--color-panel)', borderRadius: 10, border: '1px solid var(--color-border)' }}>
                No warranty periods found. This lot may have been created without a WSD.
              </div>
            ) : (
              periods.map(p => (
                <PeriodBar
                  key={p.id}
                  period={p}
                  linkedCase={caseForPeriod(p)}
                  onCaseClick={(caseId) => navigate(`/warranty/cases/${caseId}`)}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT — Info panels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Homeowner */}
          <div style={{ padding: '16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--color-muted)', marginBottom: 12 }}>
              Homeowner
            </p>
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{lot.homeowner_name ?? '—'}</p>
            {lot.homeowner_email && (
              <p style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>✉ {lot.homeowner_email}</p>
            )}
            {lot.homeowner_phone && (
              <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>📞 {lot.homeowner_phone}</p>
            )}
          </div>

          {/* Tarion details */}
          <div style={{ padding: '16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--color-muted)', marginBottom: 10 }}>
              Tarion Details
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Enrollment #',     value: lot.enrollment_number },
                { label: 'Possession Date',  value: lot.possession_date ? fmt(lot.possession_date) : null },
                { label: 'Warranty Start',   value: fmt(wsd) },
                { label: 'MSD Expires',      value: fmt(warrantyEnd.toISOString().split('T')[0]) },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{r.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{r.value ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cases summary */}
          <div style={{ padding: '16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--color-muted)', marginBottom: 10 }}>
              Cases ({cases.length})
            </p>
            {cases.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.6 }}>
                No cases filed yet. Cases appear here automatically when imported from BuilderLink.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cases.map(c => {
                  const sc = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.open;
                  return (
                    <div
                      key={c.id}
                      onClick={() => navigate(`/warranty/cases/${c.id}`)}
                      style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: 'var(--color-mist)',
                        border: `1px solid ${sc.border}`,
                        cursor: 'pointer', transition: 'border-color 0.12s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = sc.color)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = sc.border)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text)' }}>
                          {PERIOD_LABELS[c.period_type] ?? c.title}
                        </p>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 100, background: sc.bg, color: sc.color }}>
                          {sc.label}
                        </span>
                      </div>
                      <p style={{ fontSize: 10, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                        {c.case_number}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                        <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                          {c.interaction_count ?? 0} interactions
                        </span>
                        <ChevronRight size={11} color="var(--color-muted)" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}