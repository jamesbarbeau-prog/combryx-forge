import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function CommunitiesPage() {
  const navigate = useNavigate();
  const [communities, setCommunities] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [form, setForm] = useState({
    name: '', address: '', city: '', province: 'ON', postal_code: '',
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('warranty_communities')
      .select('*')
      .eq('company_id', COMPANY_ID)
      .order('created_at', { ascending: false });
    if (data) setCommunities(data);
    setLoading(false);
  }

  function setF(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function save() {
    if (!form.name) return;
    setSaving(true);
    await supabase.from('warranty_communities').insert({
      company_id:  COMPANY_ID,
      name:        form.name,
      address:     form.address || null,
      city:        form.city    || null,
      province:    form.province,
      postal_code: form.postal_code || null,
    });
    setSaving(false);
    setShowModal(false);
    setForm({ name: '', address: '', city: '', province: 'ON', postal_code: '' });
    load();
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

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
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--color-panel-raised)' }}>
              <button onClick={() => setShowModal(false)} className="forge-button forge-button--secondary">Cancel</button>
              <button onClick={save} disabled={saving || !form.name} className="forge-button forge-button--primary">
                {saving ? 'Saving...' : 'Create Community'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>Warranty</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>Communities</h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 2 }}>{communities.length} {communities.length === 1 ? 'community' : 'communities'}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="forge-button forge-button--primary">
          + New Community
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Loading...</div>
      ) : communities.length === 0 ? (
        <div style={{ padding: '60px 40px', textAlign: 'center', background: 'var(--color-panel)', borderRadius: 14, border: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: 36, marginBottom: 12 }}>🏘️</p>
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>No communities yet</p>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 20 }}>
            Create your first community to start managing lots and warranty cases.
          </p>
          <button onClick={() => setShowModal(true)} className="forge-button forge-button--primary">
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
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(252,226,5,0.35)'; e.currentTarget.style.background = 'var(--color-panel-raised)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = 'var(--color-panel)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(252,226,5,0.08)', border: '1px solid rgba(252,226,5,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                  🏘️
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 100, background: 'rgba(22,163,74,0.10)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.2)' }}>
                  Active
                </span>
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: 'var(--color-text)' }}>{c.name}</p>
              {(c.city || c.address) && (
                <p style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 12 }}>
                  {[c.address, c.city, c.province].filter(Boolean).join(', ')}
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>View Lots →</span>
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