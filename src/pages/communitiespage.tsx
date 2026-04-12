import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

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

interface Community {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  created_at: string;
  lot_count?: number;
  open_cases?: number;
}

export default function CommunitiesPage() {
  const navigate = useNavigate();
  const [companyId, setCompanyId]     = useState<string | null>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [form, setForm] = useState({
    name: '', address: '', city: '', province: 'ON', postal_code: '',
  });

  // ── Get company ID from logged-in user ──────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      // Try users table first, fall back to known company ID
      supabase.from('users').select('company_id').eq('id', user.id).single()
        .then(({ data, error }) => {
          if (data?.company_id) {
            setCompanyId(data.company_id);
            console.log('COMPANY ID SET:', data.company_id);
          } else {
            console.warn('users table lookup failed:', error?.message, '— using fallback');
            setCompanyId('c8bd8b99-090d-4379-86cd-95c3844c09f9');
          }
        });
    });
  }, []);

  // ── Load communities ─────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return;
  
    async function load() {
      setLoading(true);
  
      console.log('Loading communities for:', companyId);
  
      const { data, error } = await supabase
        .from('warranty_communities')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
  
      console.log('RESULT:', data, error);
  
      if (!data) {
        setLoading(false);
        return;
      }
  
      setCommunities(data);
      setLoading(false);
    }
  
    load();
  }, [companyId]);

  function setF(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function save() {
    if (!form.name || !companyId) return;
    setSaving(true);
    await supabase.from('warranty_communities').insert({
      company_id:  companyId,
      name:        form.name,
      address:     form.address     || null,
      city:        form.city        || null,
      province:    form.province,
      postal_code: form.postal_code || null,
    });
    setSaving(false);
    setShowModal(false);
    setForm({ name: '', address: '', city: '', province: 'ON', postal_code: '' });
    load();
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto', fontFamily: 'var(--font-body)', color: 'var(--color-text)' }}>

      {/* Modal */}
      {showModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div style={{ background: 'var(--color-panel)', borderRadius: 14, width: '100%', maxWidth: 520, border: '1px solid var(--color-border)', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>New Community</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--color-muted)', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Community Name *</label>
                <input style={inp} placeholder="e.g. Rideau Forest Phase 2" value={form.name} onChange={e => setF('name', e.target.value)} onFocus={focus} onBlur={blur} />
              </div>
              <div>
                <label style={lbl}>Street Address</label>
                <input style={inp} placeholder="123 Main St" value={form.address} onChange={e => setF('address', e.target.value)} onFocus={focus} onBlur={blur} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px', gap: 10 }}>
                <div>
                  <label style={lbl}>City</label>
                  <input style={inp} placeholder="Ottawa" value={form.city} onChange={e => setF('city', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label style={lbl}>Province</label>
                  <select style={inp} value={form.province} onChange={e => setF('province', e.target.value)} onFocus={focus} onBlur={blur}>
                    {['ON','BC','AB','QC','MB','SK','NS','NB','NL','PE'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Postal Code</label>
                  <input style={inp} placeholder="K1A 0A9" value={form.postal_code} onChange={e => setF('postal_code', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--color-mist)' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', borderRadius: 7, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={save} disabled={saving || !form.name} style={{ padding: '8px 20px', borderRadius: 7, background: form.name ? '#1E5FA4' : 'var(--color-mist)', border: 'none', color: form.name ? '#fff' : 'var(--color-muted)', fontSize: 12, fontWeight: 700, cursor: form.name ? 'pointer' : 'default', fontFamily: 'var(--font-body)' }}>
                {saving ? 'Saving…' : 'Create Community'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>Warranty</p>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-text)', marginBottom: 2 }}>Portfolio</h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
            {communities.length} {communities.length === 1 ? 'community' : 'communities'}
            {communities.length > 0 && ` · ${communities.reduce((s, c) => s + (c.lot_count ?? 0), 0)} lots`}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{ padding: '9px 20px', borderRadius: 8, background: '#1E5FA4', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
        >
          + New Community
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Loading communities…</div>
      ) : communities.length === 0 ? (
        <div style={{ padding: '60px 40px', textAlign: 'center', background: 'var(--color-panel)', borderRadius: 14, border: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: 36, marginBottom: 12 }}>🏘️</p>
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>No communities yet</p>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 20 }}>
            Create your first community to start managing lots and warranty cases.
          </p>
          <button onClick={() => setShowModal(true)} style={{ padding: '9px 20px', borderRadius: 8, background: '#1E5FA4', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            + New Community
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {communities.map(c => (
            <div
              key={c.id}
              onClick={() => navigate(`/warranty/lots?community=${c.id}`)}
              style={{
                padding: 20, borderRadius: 12,
                background: 'var(--color-panel)',
                border: '1px solid var(--color-border)',
                cursor: 'pointer', transition: 'all 0.12s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(30,95,164,0.35)';
                e.currentTarget.style.background = 'var(--color-mist)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
                e.currentTarget.style.background = 'var(--color-panel)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(30,95,164,0.08)', border: '1px solid rgba(30,95,164,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                  🏘️
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 100, background: 'rgba(22,163,74,0.10)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.2)' }}>
                  Active
                </span>
              </div>

              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: 'var(--color-text)' }}>{c.name}</p>

              {(c.city || c.address) && (
                <p style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 12 }}>
                  {[c.city, c.province].filter(Boolean).join(', ')}
                </p>
              )}

              {/* Stats */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1, padding: '8px 10px', borderRadius: 7, background: 'var(--color-mist)', textAlign: 'center' }}>
                  <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-text)', fontFamily: 'var(--font-mono)', lineHeight: 1, marginBottom: 2 }}>{c.lot_count ?? 0}</p>
                  <p style={{ fontSize: 9, color: 'var(--color-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Lots</p>
                </div>
                <div style={{ flex: 1, padding: '8px 10px', borderRadius: 7, background: (c.open_cases ?? 0) > 0 ? 'rgba(220,38,38,0.06)' : 'var(--color-mist)', textAlign: 'center' }}>
                  <p style={{ fontSize: 18, fontWeight: 900, color: (c.open_cases ?? 0) > 0 ? '#DC2626' : 'var(--color-text)', fontFamily: 'var(--font-mono)', lineHeight: 1, marginBottom: 2 }}>{c.open_cases ?? 0}</p>
                  <p style={{ fontSize: 9, color: (c.open_cases ?? 0) > 0 ? '#DC2626' : 'var(--color-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Open Cases</p>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 11, color: '#1E5FA4', fontWeight: 600 }}>View Lots →</span>
                <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                  {new Date(c.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}