import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

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
  e.currentTarget.style.borderColor = '#FCE205';
  e.currentTarget.style.boxShadow   = '0 0 0 3px rgba(252,226,5,0.12)';
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
    { lot_id: lotId, period_type: 'initial',     form_open_date: wsd,             form_close_date: add(w, 41),    brp_days: 120, is_optional: false },
    { lot_id: lotId, period_type: 'mid_year',    form_open_date: add(w, 42),      form_close_date: add(w, 183),   brp_days: 120, is_optional: true  },
    { lot_id: lotId, period_type: 'year_end',    form_open_date: add(w, 184),     form_close_date: add(w, 375),   brp_days: 120, is_optional: false },
    { lot_id: lotId, period_type: 'second_year', form_open_date: addYears(w, 1),  form_close_date: addYears(w, 2), brp_days: 120, is_optional: false },
    { lot_id: lotId, period_type: 'msd',         form_open_date: addYears(w, 3),  form_close_date: addYears(w, 7), brp_days: 90,  is_optional: false },
  ];
}

const PERIOD_LABELS: Record<string, string> = {
  initial: 'Initial', mid_year: 'Mid-Year', year_end: 'Year-End',
  second_year: '2nd Year', msd: 'MSD',
};

export default function LotsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const communityFilter = searchParams.get('community');

  const [lots, setLots]               = useState<any[]>([]);
  const [communities, setCommunities] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]           = useState('');
  const [form, setForm] = useState({
    community_id: communityFilter ?? '',
    lot_number: '', unit_number: '', address: '',
    possession_date: '', warranty_start_date: '',
    homeowner_name: '', homeowner_email: '', homeowner_phone: '',
    enrollment_number: '',
  });

  useEffect(() => {
    loadCommunities();
    loadLots();
  }, [communityFilter]);

  async function loadCommunities() {
    const { data } = await supabase
      .from('warranty_communities')
      .select('id, name')
      .eq('company_id', COMPANY_ID)
      .order('name');
    if (data) setCommunities(data);
  }

  async function loadLots() {
    setLoading(true);
    let q = supabase
      .from('warranty_lots')
      .select('*, warranty_communities(name)')
      .eq('company_id', COMPANY_ID)
      .order('created_at', { ascending: false });
    if (communityFilter) q = q.eq('community_id', communityFilter);
    const { data } = await q;
    if (data) setLots(data);
    setLoading(false);
  }

  function setF(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function save() {
    if (!form.lot_number || !form.warranty_start_date || !form.community_id) return;
    setSaving(true);

    const { data: lot } = await supabase
      .from('warranty_lots')
      .insert({
        company_id:          COMPANY_ID,
        community_id:        form.community_id,
        lot_number:          form.lot_number,
        unit_number:         form.unit_number   || null,
        address:             form.address       || null,
        possession_date:     form.possession_date || null,
        warranty_start_date: form.warranty_start_date,
        homeowner_name:      form.homeowner_name  || null,
        homeowner_email:     form.homeowner_email || null,
        homeowner_phone:     form.homeowner_phone || null,
        enrollment_number:   form.enrollment_number || null,
        warranty_status:     'active',
      })
      .select()
      .single();

    if (lot) {
      // Auto-generate all 5 warranty periods
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

  const filtered = lots.filter(l =>
    !search ||
    l.lot_number?.toLowerCase().includes(search.toLowerCase()) ||
    l.homeowner_name?.toLowerCase().includes(search.toLowerCase()) ||
    l.enrollment_number?.toLowerCase().includes(search.toLowerCase()) ||
    l.address?.toLowerCase().includes(search.toLowerCase())
  );

  const communityName = communityFilter
    ? communities.find(c => c.id === communityFilter)?.name
    : null;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

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

              {/* Community */}
              <div>
                <label style={lbl}>Community *</label>
                <select style={inp} value={form.community_id} onChange={e => setF('community_id', e.target.value)} onFocus={focus} onBlur={blur}>
                  <option value="">Select community...</option>
                  {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Lot + Unit */}
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

              {/* Address */}
              <div>
                <label style={lbl}>Street Address</label>
                <input style={inp} placeholder="123 Rideau Crest Dr" value={form.address} onChange={e => setF('address', e.target.value)} onFocus={focus} onBlur={blur} />
              </div>

              {/* Enrollment */}
              <div>
                <label style={lbl}>Tarion Enrollment Number</label>
                <input style={inp} placeholder="H1892341" value={form.enrollment_number} onChange={e => setF('enrollment_number', e.target.value)} onFocus={focus} onBlur={blur} />
              </div>

              {/* Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Possession Date</label>
                  <input style={inp} type="date" value={form.possession_date} onChange={e => {
                    setF('possession_date', e.target.value);
                    if (!form.warranty_start_date) setF('warranty_start_date', e.target.value);
                  }} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label style={lbl}>Warranty Start Date *</label>
                  <input style={inp} type="date" value={form.warranty_start_date} onChange={e => setF('warranty_start_date', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
              </div>

              {form.warranty_start_date && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(252,226,5,0.06)', border: '1px solid rgba(252,226,5,0.2)' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#8A7600', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Auto-generated warranty periods</p>
                  {generatePeriods('preview', form.warranty_start_date).map(p => (
                    <div key={p.period_type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-muted)', marginBottom: 3 }}>
                      <span style={{ fontWeight: 600 }}>{PERIOD_LABELS[p.period_type]}{p.is_optional ? ' (optional)' : ''}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{p.form_open_date} → {p.form_close_date}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Homeowner */}
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

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--color-panel-raised)' }}>
              <button onClick={() => setShowModal(false)} className="forge-button forge-button--secondary">Cancel</button>
              <button
                onClick={save}
                disabled={saving || !form.lot_number || !form.warranty_start_date || !form.community_id}
                className="forge-button forge-button--primary"
              >
                {saving ? 'Saving...' : 'Create Lot + Generate Periods'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>
            {communityName ? `${communityName} →` : 'Warranty →'} Lots
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
            {communityName ?? 'All Lots'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 2 }}>{filtered.length} lots</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            style={{ ...inp, width: 220 }}
            placeholder="Search lot, homeowner, enrollment..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button onClick={() => setShowModal(true)} className="forge-button forge-button--primary">
            + New Lot
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '60px 40px', textAlign: 'center', background: 'var(--color-panel)', borderRadius: 14, border: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: 36, marginBottom: 12 }}>🏠</p>
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>No lots yet</p>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 20 }}>
            Add your first lot to start tracking warranty timelines.
          </p>
          <button onClick={() => setShowModal(true)} className="forge-button forge-button--primary">
            + New Lot
          </button>
        </div>
      ) : (
        <div style={{ background: 'var(--color-panel)', borderRadius: 12, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 140px 120px 100px 80px', gap: 0, padding: '10px 16px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-panel-raised)' }}>
            {['Lot', 'Address', 'Homeowner', 'Enrollment', 'WSD', 'Status', ''].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{h}</span>
            ))}
          </div>

          {filtered.map((l, i) => (
            <div
              key={l.id}
              onClick={() => navigate(`/warranty/lots/${l.id}`)}
              style={{
                display: 'grid', gridTemplateColumns: '100px 1fr 1fr 140px 120px 100px 80px',
                gap: 0, padding: '13px 16px', cursor: 'pointer',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--color-border)' : 'none',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-panel-raised)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{l.lot_number}</p>
                {l.unit_number && <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>Unit {l.unit_number}</p>}
              </div>
              <div>
                <p style={{ fontSize: 12, color: 'var(--color-text)' }}>{l.address ?? '—'}</p>
                <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{l.warranty_communities?.name}</p>
              </div>
              <div>
                <p style={{ fontSize: 12, color: 'var(--color-text)' }}>{l.homeowner_name ?? '—'}</p>
                {l.homeowner_email && <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{l.homeowner_email}</p>}
              </div>
              <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>{l.enrollment_number ?? '—'}</p>
              <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>
                {l.warranty_start_date ? new Date(l.warranty_start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </p>
              <div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(22,163,74,0.10)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.2)' }}>
                  {l.warranty_status ?? 'Active'}
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>View →</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}