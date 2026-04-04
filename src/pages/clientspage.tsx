import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Plus, Search, ChevronRight, User, Mail, Phone, MapPin, Building2, X, Check } from 'lucide-react';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  company_name: string | null;
  status: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { badge: string; label: string }> = {
  active:   { badge: 'forge-badge--success', label: 'Active'   },
  inactive: { badge: 'forge-badge--neutral', label: 'Inactive' },
  prospect: { badge: 'forge-badge--info',    label: 'Prospect' },
};

export default function ClientsPage() {
  const navigate = useNavigate();
  const [clients, setClients]     = useState<Client[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [showModal, setShowModal] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [phone, setPhone]         = useState('');
  const [company, setCompany]     = useState('');
  const [address, setAddress]     = useState('');
  const [city, setCity]           = useState('');
  const [postal, setPostal]       = useState('');
  const [province, setProvince]   = useState('ON');
  const [clientType, setClientType] = useState('residential');
  const [source, setSource]       = useState('referral');
  const [notes, setNotes]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => { fetchClients(); }, []);

  async function fetchClients() {
    setLoading(true);
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('company_id', '00000000-0000-0000-0000-000000000001')
      .order('created_at', { ascending: false });
    if (data) setClients(data as Client[]);
    setLoading(false);
  }

  function resetForm() {
    setFirstName(''); setLastName(''); setEmail(''); setPhone('');
    setCompany(''); setAddress(''); setCity(''); setPostal('');
    setProvince('ON'); setClientType('residential');
    setSource('referral'); setNotes(''); setError('');
  }

  async function handleSave() {
    if (!firstName.trim()) { setError('First name is required'); return; }
    if (!lastName.trim())  { setError('Last name is required');  return; }
    setError(''); setSaving(true);
    const { error: err } = await supabase.from('clients').insert({
      company_id:   '00000000-0000-0000-0000-000000000001',
      first_name:   firstName.trim(),
      last_name:    lastName.trim(),
      email:        email.trim() || null,
      phone:        phone.trim() || null,
      company_name: company.trim() || null,
      address:      address.trim() || null,
      city:         city.trim() || null,
      postal_code:  postal.trim() || null,
      province,
      client_type:  clientType,
      lead_source:  source,
      notes:        notes.trim() || null,
      status:       'active',
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setShowModal(false);
    resetForm();
    fetchClients();
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return (
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.company_name ?? '').toLowerCase().includes(q) ||
      (c.city ?? '').toLowerCase().includes(q)
    );
  });

  const inp: React.CSSProperties = {
    height: 38, padding: '0 12px', borderRadius: 8,
    border: '1px solid var(--color-border)',
    background: 'var(--color-panel-raised)',
    color: 'var(--color-text)', fontSize: 13,
    fontFamily: 'var(--font-body)', width: '100%', outline: 'none',
    transition: 'all 0.15s',
  };
  const lbl: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
    textTransform: 'uppercase', color: 'var(--color-muted)',
    marginBottom: 6, display: 'block',
  };
  function focus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = '#FCE205';
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(252,226,5,0.12)';
  }
  function blur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = 'var(--color-border)';
    e.currentTarget.style.boxShadow = 'none';
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 24px', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); resetForm(); } }}
        >
          <div style={{ background: 'var(--color-panel)', borderRadius: 14, width: '100%', maxWidth: 600, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>

            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(252,226,5,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={15} color="#FCE205" strokeWidth={1.5} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>New Client</span>
              </div>
              <button onClick={() => { setShowModal(false); resetForm(); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={16} color="var(--color-muted)" />
              </button>
            </div>

            <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Client Type</label>
                  <select style={inp} value={clientType} onChange={e => setClientType(e.target.value)} onFocus={focus} onBlur={blur}>
                    <option value="residential">Residential</option>
                    <option value="commercial">Commercial</option>
                    <option value="industrial">Industrial</option>
                    <option value="government">Government</option>
                    <option value="property_mgmt">Property Management</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Lead Source</label>
                  <select style={inp} value={source} onChange={e => setSource(e.target.value)} onFocus={focus} onBlur={blur}>
                    <option value="referral">Referral</option>
                    <option value="website">Website</option>
                    <option value="google">Google</option>
                    <option value="facebook">Facebook</option>
                    <option value="kijiji">Kijiji</option>
                    <option value="homeadvisor">HomeAdvisor</option>
                    <option value="repeat">Repeat Client</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>First Name *</label>
                  <input style={inp} placeholder="John" value={firstName} onChange={e => setFirstName(e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label style={lbl}>Last Name *</label>
                  <input style={inp} placeholder="Smith" value={lastName} onChange={e => setLastName(e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
              </div>

              <div>
                <label style={lbl}>Company Name</label>
                <div style={{ position: 'relative' }}>
                  <Building2 size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                  <input style={{ ...inp, paddingLeft: 30 }} placeholder="Smith Construction Ltd." value={company} onChange={e => setCompany(e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Email</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                    <input style={{ ...inp, paddingLeft: 30 }} placeholder="john@email.com" value={email} onChange={e => setEmail(e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                </div>
                <div>
                  <label style={lbl}>Phone</label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                    <input style={{ ...inp, paddingLeft: 30 }} placeholder="(416) 555-0100" value={phone} onChange={e => setPhone(e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                </div>
              </div>

              <div>
                <label style={lbl}>Street Address</label>
                <div style={{ position: 'relative' }}>
                  <MapPin size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                  <input style={{ ...inp, paddingLeft: 30 }} placeholder="123 Main Street" value={address} onChange={e => setAddress(e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>City</label>
                  <input style={inp} placeholder="Toronto" value={city} onChange={e => setCity(e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label style={lbl}>Province</label>
                  <select style={inp} value={province} onChange={e => setProvince(e.target.value)} onFocus={focus} onBlur={blur}>
                    {['ON','QC','BC','AB','SK','MB','NS','NB','PE','NL'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Postal Code</label>
                  <input style={{ ...inp, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }} placeholder="M5V 1A1" value={postal} onChange={e => setPostal(e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
              </div>

              <div>
                <label style={lbl}>Notes</label>
                <textarea
                  style={{ ...inp, height: 72, padding: '10px 12px', resize: 'none', lineHeight: 1.6 }}
                  placeholder="Any additional notes about this client..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  onFocus={focus}
                  onBlur={blur}
                />
              </div>

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-danger-bg)', border: '1px solid #DDB0B0' }}>
                  <p style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</p>
                </div>
              )}
            </div>

            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--color-panel-raised)' }}>
              <button className="forge-button forge-button--secondary" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</button>
              <button className="forge-button forge-button--primary" onClick={handleSave} disabled={saving} style={{ gap: 6 }}>
                {saving ? 'Saving...' : <><Check size={13} /> Create Client</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p className="forge-label" style={{ marginBottom: 4 }}>CRM</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Clients</h1>
          <p className="forge-subtitle" style={{ marginTop: 2 }}>{clients.length} clients total</p>
        </div>
        <button className="forge-button forge-button--primary" onClick={() => setShowModal(true)}>
          <Plus size={13} /> New Client
        </button>
      </div>

      <div style={{ position: 'relative', maxWidth: 380, marginBottom: 20 }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
        <input className="forge-input" placeholder="Search clients..." style={{ paddingLeft: 30 }} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="forge-card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)' }}>Loading clients...</div>
        ) : (
          <table className="forge-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone</th>
                <th>City</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-muted)' }}>
                    {search ? 'No clients match your search' : 'No clients yet — add your first client'}
                  </td>
                </tr>
              ) : (
                filtered.map(client => (
                  <tr key={client.id} onClick={() => navigate(`/forge/clients/${client.id}`)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(252,226,5,0.12)', border: '1px solid rgba(252,226,5,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#8A7600', flexShrink: 0 }}>
                          {client.first_name[0]}{client.last_name[0]}
                        </div>
                        <p style={{ fontWeight: 600, fontSize: 13 }}>{client.first_name} {client.last_name}</p>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{client.company_name ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{client.email ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{client.phone ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{client.city ?? '—'}</td>
                    <td>
                      <span className={`forge-badge ${STATUS_CONFIG[client.status ?? 'active']?.badge ?? 'forge-badge--neutral'}`}>
                        {STATUS_CONFIG[client.status ?? 'active']?.label ?? client.status}
                      </span>
                    </td>
                    <td><ChevronRight size={13} color="var(--color-muted)" /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}