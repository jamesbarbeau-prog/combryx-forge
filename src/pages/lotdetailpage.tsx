import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

const PERIOD_LABELS: Record<string, string> = {
  initial: 'Initial', mid_year: 'Mid-Year', year_end: 'Year-End',
  second_year: '2nd Year', msd: 'MSD',
};
const PERIOD_ORDER = ['initial', 'mid_year', 'year_end', 'second_year', 'msd'];

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}
function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function PeriodBar({ period, cases }: { period: any; cases: any[] }) {
  const today = new Date();
  const open  = new Date(period.form_open_date);
  const close = new Date(period.form_close_date);
  const isOpen    = today >= open && today <= close;
  const isPast    = today > close;
  const isFuture  = today < open;
  const daysToOpen  = daysUntil(period.form_open_date);
  const daysToClose = daysUntil(period.form_close_date);

  const periodCase = cases.find(c => c.period_id === period.id || c.period_type === period.period_type);

  let statusColor = '#6B7280';
  let statusLabel = 'Upcoming';
  let statusBg    = 'rgba(107,114,128,0.10)';
  let statusBorder = 'rgba(107,114,128,0.2)';

  if (period.is_optional && !periodCase && isPast) {
    statusColor = '#6B7280'; statusLabel = 'Waived'; statusBg = 'rgba(107,114,128,0.08)'; statusBorder = 'rgba(107,114,128,0.15)';
  } else if (period.is_optional && !periodCase && isOpen) {
    statusColor = '#6BA3D6'; statusLabel = 'Optional — Open'; statusBg = 'rgba(107,163,214,0.10)'; statusBorder = 'rgba(107,163,214,0.2)';
  } else if (isFuture) {
    statusColor = '#6B7280'; statusLabel = 'Upcoming';
  } else if (isOpen && !periodCase) {
    statusColor = '#16A34A'; statusLabel = 'Window Open'; statusBg = 'rgba(22,163,74,0.10)'; statusBorder = 'rgba(22,163,74,0.2)';
  } else if (periodCase) {
    statusColor = '#1E5FA4'; statusLabel = 'Case Filed'; statusBg = 'rgba(30,95,164,0.10)'; statusBorder = 'rgba(30,95,164,0.2)';
  } else if (isPast) {
    statusColor = '#6B7280'; statusLabel = 'Closed';
  }

  return (
    <div style={{
      padding: '16px 18px', borderRadius: 10,
      background: 'var(--color-panel)',
      border: `1px solid ${isOpen ? 'rgba(22,163,74,0.25)' : 'var(--color-border)'}`,
      opacity: isFuture ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text)' }}>
            {PERIOD_LABELS[period.period_type]}
          </span>
          {period.is_optional && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 100, background: 'rgba(107,163,214,0.12)', color: '#6BA3D6', border: '1px solid rgba(107,163,214,0.2)' }}>OPTIONAL</span>
          )}
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: statusBg, color: statusColor, border: `1px solid ${statusBorder}` }}>
            {statusLabel}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 10, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
            {fmt(period.form_open_date)} → {fmt(period.form_close_date)}
          </p>
          {isOpen && (
            <p style={{ fontSize: 10, fontWeight: 700, color: '#16A34A' }}>{daysToClose} days remaining</p>
          )}
          {isFuture && (
            <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>Opens in {daysToOpen} days</p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, fontSize: 11, color: 'var(--color-muted)' }}>
        <span>BRP: <strong style={{ color: 'var(--color-text)' }}>{period.brp_days} days</strong></span>
        {periodCase && (
          <>
            <span>Case: <strong style={{ color: '#1E5FA4', cursor: 'pointer' }}>{periodCase.case_number ?? 'View →'}</strong></span>
            <span>BRP ends: <strong style={{ color: 'var(--color-text)' }}>{periodCase.brp_end_date ? fmt(periodCase.brp_end_date) : '—'}</strong></span>
          </>
        )}
      </div>

      {isOpen && !periodCase && !period.is_optional && (
        <div style={{ marginTop: 10, padding: '6px 12px', borderRadius: 6, background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)', fontSize: 11, color: '#16A34A', fontWeight: 600 }}>
          ✓ Form window is currently open — homeowner may submit
        </div>
      )}
      {period.is_optional && isOpen && !periodCase && (
        <div style={{ marginTop: 10, padding: '6px 12px', borderRadius: 6, background: 'rgba(107,163,214,0.08)', border: '1px solid rgba(107,163,214,0.2)', fontSize: 11, color: '#6BA3D6' }}>
          Mid-Year is optional. Encourage homeowner to submit seasonal issues now to reduce Year-End volume.
        </div>
      )}
    </div>
  );
}

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
    const [{ data: l }, { data: p }, { data: c }] = await Promise.all([
      supabase.from('warranty_lots').select('*, warranty_communities(name)').eq('id', id!).single(),
      supabase.from('warranty_periods').select('*').eq('lot_id', id!).order('form_open_date'),
      supabase.from('warranty_cases').select('*').eq('lot_id', id!),
    ]);
    if (l) setLot(l);
    if (p) setPeriods(p.sort((a: any, b: any) => PERIOD_ORDER.indexOf(a.period_type) - PERIOD_ORDER.indexOf(b.period_type)));
    if (c) setCases(c);
    setLoading(false);
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-muted)' }}>Loading...</div>;
  if (!lot) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-muted)' }}>Lot not found.</div>;

  const wsd = lot.warranty_start_date;
  const wsdDate = new Date(wsd);
  const warrantyEnd = new Date(wsdDate);
  warrantyEnd.setFullYear(warrantyEnd.getFullYear() + 7);
  const totalDays = warrantyEnd.getTime() - wsdDate.getTime();
  const elapsed = Date.now() - wsdDate.getTime();
  const pct = Math.min(100, Math.max(0, (elapsed / totalDays) * 100));

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 12, color: 'var(--color-muted)' }}>
        <span style={{ cursor: 'pointer' }} onClick={() => navigate('/warranty/communities')}>Communities</span>
        <span>›</span>
        <span style={{ cursor: 'pointer' }} onClick={() => navigate(`/warranty/lots?community=${lot.community_id}`)}>
          {lot.warranty_communities?.name}
        </span>
        <span>›</span>
        <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{lot.lot_number}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            {lot.lot_number}{lot.unit_number ? ` — Unit ${lot.unit_number}` : ''}
          </h1>
          {lot.address && <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 2 }}>{lot.address}</p>}
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>{lot.warranty_communities?.name}</p>
        </div>
        <button
          onClick={() => navigate(`/warranty/cases?lot=${id}`)}
          className="forge-button forge-button--primary"
        >
          + New Case
        </button>
      </div>

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>

        {/* LEFT — Periods */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--color-muted)', marginBottom: 12 }}>
            Warranty Timeline
          </p>

          {/* 7-year progress bar */}
          <div style={{ marginBottom: 20, padding: '14px 16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>Warranty Start: <strong style={{ color: 'var(--color-text)' }}>{fmt(wsd)}</strong></span>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>Expires: <strong style={{ color: 'var(--color-text)' }}>{fmt(warrantyEnd.toISOString().split('T')[0])}</strong></span>
            </div>
            <div style={{ height: 6, borderRadius: 100, background: 'var(--color-mist)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: 100, background: 'linear-gradient(90deg, #FCE205 0%, #D4A800 100%)' }} />
            </div>
            <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 5 }}>{pct.toFixed(1)}% of 7-year warranty elapsed</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {periods.map(p => <PeriodBar key={p.id} period={p} cases={cases} />)}
            {periods.length === 0 && (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13, background: 'var(--color-panel)', borderRadius: 10, border: '1px solid var(--color-border)' }}>
                No warranty periods found. This lot may have been created without a WSD.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Info panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Homeowner */}
          <div style={{ padding: '16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--color-muted)', marginBottom: 12 }}>Homeowner</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 6 }}>{lot.homeowner_name ?? '—'}</p>
            {lot.homeowner_email && (
              <p style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>✉ {lot.homeowner_email}</p>
            )}
            {lot.homeowner_phone && (
              <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>📞 {lot.homeowner_phone}</p>
            )}
          </div>

          {/* Enrollment */}
          <div style={{ padding: '16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--color-muted)', marginBottom: 10 }}>Tarion Details</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Enrollment #', value: lot.enrollment_number },
                { label: 'Possession Date', value: lot.possession_date ? fmt(lot.possession_date) : null },
                { label: 'Warranty Start', value: fmt(wsd) },
                { label: 'MSD Expires', value: fmt(warrantyEnd.toISOString().split('T')[0]) },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{r.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>{r.value ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cases summary */}
          <div style={{ padding: '16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--color-muted)', marginBottom: 10 }}>Cases</p>
            {cases.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>No cases filed yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cases.map(c => (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/warranty/cases/${c.id}`)}
                    style={{ padding: '8px 10px', borderRadius: 7, background: 'var(--color-mist)', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: 11 }}
                  >
                    <p style={{ fontWeight: 700, color: 'var(--color-text)', marginBottom: 2 }}>{PERIOD_LABELS[c.period_type]} — {c.status}</p>
                    <p style={{ color: 'var(--color-muted)' }}>Filed: {c.submission_date ? fmt(c.submission_date) : '—'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}