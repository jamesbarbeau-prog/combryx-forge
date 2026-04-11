import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

const inp: React.CSSProperties = {
  height: 38, padding: '0 10px', borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-panel-raised)',
  color: 'var(--color-text)', fontSize: 12,
  fontFamily: 'var(--font-body)', outline: 'none',
  width: '100%',
};
const lbl: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
  textTransform: 'uppercase', color: 'var(--color-muted)',
  marginBottom: 5, display: 'block',
};
function focus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = '#1E5FA4';
  e.currentTarget.style.boxShadow   = '0 0 0 3px rgba(30,95,164,0.12)';
}
function blur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'var(--color-border)';
  e.currentTarget.style.boxShadow   = 'none';
}

// Auto-generate all 5 warranty periods from WSD
function generatePeriods(lotId: string, wsd: string) {
  const w = new Date(wsd);
  const add = (d: Date, days: number) => {
    const r = new Date(d); r.setDate(r.getDate() + days); return r.toISOString().split('T')[0];
  };
  const addYears = (d: Date, years: number) => {
    const r = new Date(d); r.setFullYear(r.getFullYear() + years); return r.toISOString().split('T')[0];
  };
  return [
    { lot_id: lotId, period_type: 'initial',     form_open_date: wsd,             form_close_date: add(w, 41),     brp_days: 120, is_optional: false },
    { lot_id: lotId, period_type: 'mid_year',    form_open_date: add(w, 42),      form_close_date: add(w, 183),    brp_days: 120, is_optional: true  },
    { lot_id: lotId, period_type: 'year_end',    form_open_date: add(w, 184),     form_close_date: add(w, 375),    brp_days: 120, is_optional: false },
    { lot_id: lotId, period_type: 'second_year', form_open_date: addYears(w, 1),  form_close_date: addYears(w, 2), brp_days: 120, is_optional: false },
    { lot_id: lotId, period_type: 'msd',         form_open_date: addYears(w, 3),  form_close_date: addYears(w, 7), brp_days: 90,  is_optional: false },
  ];
}

const PERIOD_LABELS: Record<string, string> = {
  initial: 'Initial', mid_year: 'Mid-Year', year_end: 'Year-End',
  second_year: '2nd Year', msd: 'MSD',
};

interface Lot {
  id: string;
  lot_number: string;
  unit_number: string | null;
  address: string | null;
  homeowner_name: string | null;
  homeowner_email: string | null;
  homeowner_phone: string | null;
  enrollment_number: string | null;
  warranty_start_date: string | null;
  possession_date: string | null;
  warranty_status: string | null;
  community_id: string;
  created_at: string;
  warranty_communities: { name: string } | null;
  open_cases?: number;
  brp_end_date?: string | null;
}

interface Community {
  id: string;
  name: string;
}

export default function LotsPage() {
  const navigate = useNavigate();
  const [searchParams]  = useSearchParams();
  const communityFilter = searchParams.get('community');

  const [companyId, setCompanyId]     = useState<string | null>(null);
  const [lots, setLots]               = useState<Lot[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [form, setForm] = useState({
    community_id: communityFilter ?? '',
    lot_number: '', unit_number: '', address: '',
    possession_date: '', warranty_start_date: '',
    homeowner_name: '', homeowner_email: '', homeowner_phone: '',
    enrollment_number: '',
  });

  // ── Get company ID ────────────────────────────────────────────
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

  // ── Load communities ──────────────────────────────────────────
  const loadCommunities = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('warranty_communities')
      .select('id, name')
      .eq('company_id', companyId)
      .order('name');
    if (data) setCommunities(data as Community[]);
  }, [companyId]);

  // ── Load lots ─────────────────────────────────────────────────
  const loadLots = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);

    let q = supabase
      .from('warranty_lots')
      .select('*, warranty_communities(name)')
      .eq('company_id', companyId)
      .order('lot_number');

    if (communityFilter) q = q.eq('community_id', communityFilter);

    const { data: lotsData } = await q;
    if (!lotsData) { setLoading(false); return; }

    // Get open case counts per lot
    const lotIds = lotsData.map(l => l.id);
    const { data: casesData } = lotIds.length ? await supabase
      .from('cases')
      .select('lot_id, brp_end_date')
      .in('lot_id', lotIds)
      .not('status', 'in', '("resolved","closed","voided")') : { data: [] };

    const caseCounts: Record<string, number>  = {};
    const brpMap:     Record<string, string>  = {};

    for (const c of (casesData ?? []) as { lot_id: string; brp_end_date: string | null }[]) {
      caseCounts[c.lot_id] = (caseCounts[c.lot_id] ?? 0) + 1;
      if (c.brp_end_date && (!brpMap[c.lot_id] || c.brp_end_date < brpMap[c.lot_id])) {
        brpMap[c.lot_id] = c.brp_end_date;
      }
    }

    setLots((lotsData as Lot[]).map(l => ({
      ...l,
      open_cases:   caseCounts[l.id] ?? 0,
      brp_end_date: brpMap[l.id] ?? null,
    })));
    setLoading(false);
  }, [companyId, communityFilter]);

  useEffect(() => {
    if (companyId) { loadCommunities(); loadLots(); }
  }, [companyId, loadCommunities, loadLots]);

  function setF(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function save() {
    if (!form.lot_number || !form.warranty_start_date || !form.community_id || !companyId) return;
    setSaving(true);

    const { data: lot } = await supabase
      .from('warranty_lots')
      .insert({
        company_id:          companyId,
        community_id:        form.community_id,
        lot_number:          form.lot_number,
        unit_number:         form.unit_number        || null,
        address:             form.address            || null,
        possession_date:     form.possession_date    || null,
        warranty_start_date: form.warranty_start_date,
        homeowner_name:      form.homeowner_name     || null,
        homeowner_email:     form.homeowner_email    || null,
        homeowner_phone:     form.homeowner_phone    || null,
        enrollment_number:   form.enrollment_number  || null,
        warranty_status:     'active',
      })
      .select()
      .single();

    if (lot) {
      const periods = generatePeriods(lot.id, form.warranty_start_date);
      await supabase.from('warranty_periods').insert(periods);
    }

    setSaving(false);
    setShowModal(false);
    setForm({
      community_id: communityFilter ?? '',
      lot_number: '', unit_number: '', address: '',
      possession_date: '', warranty_start_date: '',
      homeowner_name: '', homeowner_email: '', homeowner_phone: '',
      enrollment_number: '',
    });
    loadLots();
  }

  const communityName = communityFilter
    ? communities.find(c => c.id === communityFilter)?.name
    : null;

  const filtered = lots.filter(l => {
    const matchSearch = !search ||
      l.lot_number?.toLowerCase().includes(search.toLowerCase()) ||
      l.homeowner_name?.toLowerCase().includes(search.toLowerCase()) ||
      l.enrollment_number?.toLowerCase().includes(search.toLowerCase()) ||
      l.address?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || l.warranty_status === statusFilter;
    return matchSearch && matchStatus;
  });

  function brpColor(date: string | null | undefined): string {
    if (!date) return 'var(--color-muted)';
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
    if (days < 0)  return '#DC2626';
    if (days < 30) return '#DC2626';
    if (days < 60) return '#D97706';
    return '#16A34A';
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1300, margin: '0 auto', fontFamily: 'var(--font-body)', color: 'var(--color-text)' }}>

      {/* Modal */}
      {showModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div style={{ background: 'var(--color-panel)', borderRadius: 14, width: '100%', maxWidth: 580, border: '1px solid var(--color-border)', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.18)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'var(--color-panel)', zIndex: 1 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>New Lot / Unit</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--color-muted)', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={lbl}>Community *</label>
                <select style={inp} value={form.community_id} onChange={e => setF('community_id', e.target.value)} onFocus={focus} onBlur={blur}>
                  <option value="">Select community…</option>
                  {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Lot Number *</label>
                  <input style={inp} placeholder="e.g. Lot 45" value={form.lot_number} onChange={e => setF('lot_number', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label style={lbl}>Unit Number</label>
                  <input style={inp} placeholder="e.g. 302 (condos)" value={form.unit_number} onChange={e => setF('unit_number', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
              </div>

              <div>
                <label style={lbl}>Street Address</label>
                <input style={inp} placeholder="54 Rowe Dr" value={form.address} onChange={e => setF('address', e.target.value)} onFocus={focus} onBlur={blur} />
              </div>

              <div>
                <label style={lbl}>Tarion Enrollment Number</label>
                <input style={inp} placeholder="H1892341" value={form.enrollment_number} onChange={e => setF('enrollment_number', e.target.value)} onFocus={focus} onBlur={blur} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Possession Date</label>
                  <input style={{ ...inp, boxSizing: 'border-box' }} type="date" value={form.possession_date} onChange={e => {
                    setF('possession_date', e.target.value);
                    if (!form.warranty_start_date) setF('warranty_start_date', e.target.value);
                  }} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label style={lbl}>Warranty Start Date *</label>
                  <input style={{ ...inp, boxSizing: 'border-box' }} type="date" value={form.warranty_start_date} onChange={e => setF('warranty_start_date', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
              </div>

              {form.warranty_start_date && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(30,95,164,0.06)', border: '1px solid rgba(30,95,164,0.2)' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#1E5FA4', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Auto-generated warranty periods</p>
                  {generatePeriods('preview', form.warranty_start_date).map(p => (
                    <div key={p.period_type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-muted)', marginBottom: 3 }}>
                      <span style={{ fontWeight: 600 }}>{PERIOD_LABELS[p.period_type]}{p.is_optional ? ' (optional)' : ''}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{p.form_open_date} → {p.form_close_date}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ paddingTop: 4, borderTop: '1px solid var(--color-border)' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Homeowner Info</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={lbl}>Full Name</label>
                    <input style={inp} placeholder="Jane & John Smith" value={form.homeowner_name} onChange={e => setF('homeowner_name', e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={lbl}>Email</label>
                      <input style={inp} type="email" placeholder="jane@email.com" value={form.homeowner_email} onChange={e => setF('homeowner_email', e.target.value)} onFocus={focus} onBlur={blur} />
                    </div>
                    <div>
                      <label style={lbl}>Phone</label>
                      <input style={inp} type="tel" placeholder="613-555-0100" value={form.homeowner_phone} onChange={e => setF('homeowner_phone', e.target.value)} onFocus={focus} onBlur={blur} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--color-mist)', position: 'sticky', bottom: 0 }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', borderRadius: 7, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button
                onClick={save}
                disabled={saving || !form.lot_number || !form.warranty_start_date || !form.community_id}
                style={{ padding: '8px 20px', borderRadius: 7, background: (form.lot_number && form.warranty_start_date && form.community_id) ? '#1E5FA4' : 'var(--color-mist)', border: 'none', color: (form.lot_number && form.warranty_start_date && form.community_id) ? '#fff' : 'var(--color-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              >
                {saving ? 'Saving…' : 'Create Lot + Generate Periods'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>
            {communityName ? `Portfolio → ${communityName}` : 'Warranty → All Lots'}
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-text)', marginBottom: 2 }}>
            {communityName ?? 'All Lots'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
            {filtered.length} lots
            {filtered.filter(l => (l.open_cases ?? 0) > 0).length > 0 && ` · ${filtered.filter(l => (l.open_cases ?? 0) > 0).length} with open cases`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            style={{ ...inp, width: 220 }}
            placeholder="Search lot, homeowner, enrollment…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            style={{ ...inp, width: 130 }}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="closed">Closed</option>
          </select>
          <button
            onClick={() => setShowModal(true)}
            style={{ padding: '9px 20px', borderRadius: 8, background: '#1E5FA4', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}
          >
            + New Lot
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Loading lots…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '60px 40px', textAlign: 'center', background: 'var(--color-panel)', borderRadius: 14, border: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: 36, marginBottom: 12 }}>🏠</p>
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>
            {search ? 'No lots match your search' : 'No lots yet'}
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 20 }}>
            {search ? 'Try a different search term.' : 'Add your first lot to start tracking warranty timelines.'}
          </p>
          {!search && (
            <button onClick={() => setShowModal(true)} style={{ padding: '9px 20px', borderRadius: 8, background: '#1E5FA4', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              + New Lot
            </button>
          )}
        </div>
      ) : (
        <div style={{ background: 'var(--color-panel)', borderRadius: 12, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 130px 110px 100px 90px 60px', gap: 0, padding: '10px 16px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-mist)' }}>
            {['Lot', 'Address', 'Homeowner', 'Enrollment', 'WSD', 'BRP Ends', 'Cases', ''].map(h => (
              <span key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{h}</span>
            ))}
          </div>

          {filtered.map((l, i) => {
            const brp        = l.brp_end_date;
            const bColor     = brpColor(brp);
            const daysLeft   = brp ? Math.ceil((new Date(brp).getTime() - Date.now()) / 86400000) : null;

            return (
              <div
                key={l.id}
                onClick={() => navigate(`/warranty/lots/${l.id}`)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr 1fr 130px 110px 100px 90px 60px',
                  gap: 0, padding: '13px 16px', cursor: 'pointer',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--color-border)' : 'none',
                  transition: 'background 0.1s',
                  background: (l.open_cases ?? 0) > 0 ? 'rgba(220,38,38,0.02)' : 'transparent',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-mist)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = (l.open_cases ?? 0) > 0 ? 'rgba(220,38,38,0.02)' : 'transparent'; }}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{l.lot_number}</p>
                  {l.unit_number && <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>Unit {l.unit_number}</p>}
                </div>

                <div style={{ paddingRight: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--color-text)', marginBottom: 1 }}>{l.address ?? '—'}</p>
                  {!communityFilter && <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{l.warranty_communities?.name}</p>}
                </div>

                <div>
                  <p style={{ fontSize: 12, color: 'var(--color-text)', marginBottom: 1 }}>{l.homeowner_name ?? '—'}</p>
                  {l.homeowner_email && <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{l.homeowner_email}</p>}
                </div>

                <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)', alignSelf: 'center' }}>
                  {l.enrollment_number ?? '—'}
                </p>

                <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text)', alignSelf: 'center' }}>
                  {l.warranty_start_date ? format(new Date(l.warranty_start_date), 'MMM d, yyyy') : '—'}
                </p>

                <div style={{ alignSelf: 'center' }}>
                  {brp ? (
                    <>
                      <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: bColor, fontWeight: 700 }}>
                        {daysLeft !== null && daysLeft < 0 ? 'Expired' : daysLeft !== null ? `${daysLeft}d` : '—'}
                      </p>
                      <p style={{ fontSize: 9, color: bColor }}>{format(new Date(brp), 'MMM d, yyyy')}</p>
                    </>
                  ) : (
                    <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>—</p>
                  )}
                </div>

                <div style={{ alignSelf: 'center' }}>
                  {(l.open_cases ?? 0) > 0 ? (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(220,38,38,0.10)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.2)' }}>
                      {l.open_cases}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>—</span>
                  )}
                </div>

                <p style={{ fontSize: 11, color: '#1E5FA4', fontWeight: 600, alignSelf: 'center' }}>View →</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}