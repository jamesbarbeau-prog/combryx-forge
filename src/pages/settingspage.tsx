import { useState, useEffect } from 'react';
import { useFeatureStore, Features } from '@/store/featurestore';
import {
  Building2, Upload, Palette, Users, Receipt,
  HardHat, Save, ChevronRight, Check, Plus,
  Trash2, Mail, Phone, MapPin, Globe, Shield, Zap,
} from 'lucide-react';

type Tab = 'company' | 'tax' | 'trades' | 'team' | 'branding' | 'features';

const PROVINCES = [
  { code: 'ON', name: 'Ontario',          tax: 'HST',        rate: 13    },
  { code: 'QC', name: 'Quebec',           tax: 'GST + QST',  rate: 14.975},
  { code: 'BC', name: 'British Columbia', tax: 'GST + PST',  rate: 12    },
  { code: 'AB', name: 'Alberta',          tax: 'GST',        rate: 5     },
  { code: 'SK', name: 'Saskatchewan',     tax: 'GST + PST',  rate: 11    },
  { code: 'MB', name: 'Manitoba',         tax: 'GST + RST',  rate: 12    },
  { code: 'NS', name: 'Nova Scotia',      tax: 'HST',        rate: 15    },
  { code: 'NB', name: 'New Brunswick',    tax: 'HST',        rate: 15    },
  { code: 'PE', name: 'PEI',             tax: 'HST',        rate: 15    },
  { code: 'NL', name: 'Newfoundland',     tax: 'HST',        rate: 15    },
  { code: 'US', name: 'United States',    tax: 'State Tax',  rate: 0     },
];

const TRADES = [
  { id: 'general',     label: 'General Contractor',  icon: '🏗️' },
  { id: 'renovation',  label: 'Renovation',          icon: '🔨' },
  { id: 'electrical',  label: 'Electrician',         icon: '⚡' },
  { id: 'plumbing',    label: 'Plumber',             icon: '🔧' },
  { id: 'hvac',        label: 'HVAC',                icon: '❄️' },
  { id: 'roofing',     label: 'Roofing',             icon: '🏠' },
  { id: 'framing',     label: 'Framing / Carpentry', icon: '🪚' },
  { id: 'painting',    label: 'Painting',            icon: '🎨' },
  { id: 'landscaping', label: 'Landscaping',         icon: '🌿' },
  { id: 'concrete',    label: 'Concrete / Masonry',  icon: '🧱' },
  { id: 'insulation',  label: 'Insulation',          icon: '🌡️' },
  { id: 'drywall',     label: 'Drywall / Finishing', icon: '🪣' },
];

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'company',  label: 'Company Profile', icon: Building2 },
  { id: 'tax',      label: 'Tax & Billing',   icon: Receipt   },
  { id: 'trades',   label: 'Trade Types',     icon: HardHat   },
  { id: 'team',     label: 'Team',            icon: Users     },
  { id: 'branding', label: 'Branding',        icon: Palette   },
  { id: 'features', label: 'Features',        icon: Zap       },
];

const FEATURE_GROUPS = [
  {
    group: 'Operations',
    items: [
      { key: 'dispatch'              as keyof Features, label: 'Dispatch Board',        desc: 'Real-time crew scheduling, work orders, GPS tracking'       },
      { key: 'crew_tracking'         as keyof Features, label: 'Crew Tracking',         desc: 'Live crew locations, status updates, time tracking'         },
      { key: 'service_calls'         as keyof Features, label: 'Service Calls',         desc: 'Rapid dispatch for emergency and maintenance calls'         },
      { key: 'maintenance_contracts' as keyof Features, label: 'Maintenance Contracts', desc: 'Recurring service agreements and scheduled visits'          },
    ],
  },
  {
    group: 'Sales & CRM',
    items: [
      { key: 'opportunities' as keyof Features, label: 'Opportunities Pipeline', desc: 'Track leads, proposals, and conversion rates' },
      { key: 'quotes'        as keyof Features, label: 'Quote Builder',          desc: 'Build and send detailed quotes to clients'   },
    ],
  },
  {
    group: 'Projects',
    items: [
      { key: 'permits'       as keyof Features, label: 'Permit Tracking', desc: 'Track permit applications, inspections, and approvals' },
      { key: 'defense_vault' as keyof Features, label: 'Defense Vault',   desc: 'Defensible job file with SHA-256 tamper detection'    },
    ],
  },
  {
    group: 'Financial',
    items: [
      { key: 'phase_invoicing' as keyof Features, label: 'Phase / Draw Invoicing', desc: 'Multi-draw schedules for larger projects and renovations'   },
      { key: 'procurement'     as keyof Features, label: 'Procurement',             desc: 'Purchase orders, supplier management, material tracking'   },
      { key: 'reports'         as keyof Features, label: 'Financial Reports',       desc: 'Revenue, outstanding, project health dashboards'           },
    ],
  },
  {
    group: 'Tools',
    items: [
      { key: 'obc_ask_the_code' as keyof Features, label: 'Ask The Code (OBC AI)', desc: '2024 Ontario Building Code AI assistant with citations' },
      { key: 'automations'      as keyof Features, label: 'Automations',            desc: 'Automated follow-ups, reminders, and workflows'         },
    ],
  },
];

interface TeamMember { id: string; name: string; email: string; role: string; }

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('company');
  const [saved, setSaved]         = useState(false);
  const { features, fetchFeatures, setFeature } = useFeatureStore();

  useEffect(() => { fetchFeatures(); }, []);

  const [companyName, setCompanyName] = useState('Combryx Demo Co');
  const [tagline, setTagline]         = useState('Building Better Together');
  const [email, setEmail]             = useState('info@combryxdemo.com');
  const [phone, setPhone]             = useState('(416) 555-0100');
  const [address, setAddress]         = useState('123 Main Street');
  const [city, setCity]               = useState('Toronto');
  const [postal, setPostal]           = useState('M5V 1A1');
  const [website, setWebsite]         = useState('www.combryxdemo.com');
  const [hst, setHst]                 = useState('123456789 RT0001');
  const [province, setProvince]       = useState('ON');
  const [customRate, setCustomRate]   = useState(13);
  const [holdbackEnabled, setHoldbackEnabled] = useState(true);
  const [holdbackPct, setHoldbackPct] = useState(10);
  const [paymentTerms, setPaymentTerms] = useState(30);
  const [selectedTrades, setSelectedTrades] = useState<string[]>(['general', 'renovation']);
  const [team, setTeam] = useState<TeamMember[]>([
    { id: '1', name: 'James Barbeau', email: 'admin@combryxdemo.com', role: 'Owner'           },
    { id: '2', name: 'Kevin Tran',    email: 'kevin@combryxdemo.com', role: 'Project Manager' },
  ]);
  const [newName, setNewName]   = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole]   = useState('Field Tech');
  const [primaryColor, setPrimaryColor] = useState('#FCE205');
  const [logoPreview, setLogoPreview]   = useState<string | null>(null);

  const selectedProvince = PROVINCES.find(p => p.code === province) ?? PROVINCES[0];

  function handleSave() { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  function toggleTrade(id: string) {
    setSelectedTrades(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  }
  function addTeamMember() {
    if (!newName.trim() || !newEmail.trim()) return;
    setTeam(prev => [...prev, { id: crypto.randomUUID(), name: newName, email: newEmail, role: newRole }]);
    setNewName(''); setNewEmail(''); setNewRole('Field Tech');
  }
  function removeTeamMember(id: string) { setTeam(prev => prev.filter(m => m.id !== id)); }
  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

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
  const secHead: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: 'var(--color-text)',
    marginBottom: 14, paddingBottom: 10,
    borderBottom: '1px solid var(--color-border)',
    display: 'flex', alignItems: 'center', gap: 8,
  };

  function focus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.currentTarget.style.borderColor = '#FCE205';
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(252,226,5,0.12)';
  }
  function blur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.currentTarget.style.borderColor = 'var(--color-border)';
    e.currentTarget.style.boxShadow = 'none';
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1000, margin: '0 auto' }}>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p className="forge-label" style={{ marginBottom: 4 }}>System</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Settings</h1>
          <p className="forge-subtitle" style={{ marginTop: 2 }}>Configure your company, taxes, team and branding</p>
        </div>
        <button className="forge-button forge-button--primary" onClick={handleSave} style={{ gap: 6, minWidth: 120, justifyContent: 'center' }}>
          {saved ? <><Check size={13} /> Saved!</> : <><Save size={13} /> Save Changes</>}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20 }}>

        {/* Tab nav */}
        <div className="forge-card" style={{ padding: '8px', alignSelf: 'start' }}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                width: '100%', padding: '9px 12px', borderRadius: 7,
                display: 'flex', alignItems: 'center', gap: 9,
                fontSize: 12, fontWeight: active ? 600 : 400,
                color: active ? '#8A7600' : 'var(--color-text-sub)',
                background: active ? 'rgba(252,226,5,0.10)' : 'transparent',
                border: active ? '1px solid rgba(252,226,5,0.2)' : '1px solid transparent',
                cursor: 'pointer', textAlign: 'left',
                fontFamily: 'var(--font-body)', transition: 'all 0.1s', marginBottom: 2,
              }}>
                <Icon size={13} strokeWidth={active ? 2.2 : 1.6} />
                {tab.label}
                {active && <ChevronRight size={11} style={{ marginLeft: 'auto' }} />}
              </button>
            );
          })}
        </div>

        {/* Content panel */}
        <div className="forge-card" style={{ padding: '24px' }}>

          {/* COMPANY */}
          {activeTab === 'company' && (
            <div>
              <p style={secHead}><Building2 size={14} color="#8A7600" strokeWidth={1.5} />Company Information</p>
              <div style={{ marginBottom: 20 }}>
                <label style={lbl}>Company Logo</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 72, height: 72, borderRadius: 12, background: logoPreview ? 'transparent' : 'rgba(252,226,5,0.10)', border: '2px dashed rgba(252,226,5,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    {logoPreview ? <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Building2 size={24} color="rgba(252,226,5,0.5)" strokeWidth={1} />}
                  </div>
                  <div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, cursor: 'pointer', background: 'var(--color-mist)', border: '1px solid var(--color-border)', fontSize: 12, fontWeight: 600, color: 'var(--color-text-sub)' }}>
                      <Upload size={12} strokeWidth={1.5} />Upload Logo
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
                    </label>
                    <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 6 }}>PNG, JPG or SVG · Max 2MB · Appears on invoices</p>
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                {[
                  { label: 'Company Name', value: companyName, set: setCompanyName, icon: null },
                  { label: 'Tagline',      value: tagline,     set: setTagline,     icon: null },
                ].map(f => (
                  <div key={f.label}>
                    <label style={lbl}>{f.label}</label>
                    <input style={inp} value={f.value} onChange={e => f.set(e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                ))}
                <div><label style={lbl}>Email</label><div style={{ position: 'relative' }}><Mail size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} /><input style={{ ...inp, paddingLeft: 30 }} value={email} onChange={e => setEmail(e.target.value)} onFocus={focus} onBlur={blur} /></div></div>
                <div><label style={lbl}>Phone</label><div style={{ position: 'relative' }}><Phone size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} /><input style={{ ...inp, paddingLeft: 30 }} value={phone} onChange={e => setPhone(e.target.value)} onFocus={focus} onBlur={blur} /></div></div>
                <div><label style={lbl}>Website</label><div style={{ position: 'relative' }}><Globe size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} /><input style={{ ...inp, paddingLeft: 30 }} value={website} onChange={e => setWebsite(e.target.value)} onFocus={focus} onBlur={blur} /></div></div>
                <div><label style={lbl}>HST / Business Number</label><div style={{ position: 'relative' }}><Shield size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} /><input style={{ ...inp, paddingLeft: 30, fontFamily: 'var(--font-mono)' }} value={hst} onChange={e => setHst(e.target.value)} onFocus={focus} onBlur={blur} /></div></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14 }}>
                <div><label style={lbl}>Street Address</label><div style={{ position: 'relative' }}><MapPin size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} /><input style={{ ...inp, paddingLeft: 30 }} value={address} onChange={e => setAddress(e.target.value)} onFocus={focus} onBlur={blur} /></div></div>
                <div><label style={lbl}>City</label><input style={inp} value={city} onChange={e => setCity(e.target.value)} onFocus={focus} onBlur={blur} /></div>
                <div><label style={lbl}>Postal Code</label><input style={{ ...inp, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }} value={postal} onChange={e => setPostal(e.target.value)} onFocus={focus} onBlur={blur} /></div>
              </div>
            </div>
          )}

          {/* TAX */}
          {activeTab === 'tax' && (
            <div>
              <p style={secHead}><Receipt size={14} color="#8A7600" strokeWidth={1.5} />Region & Tax Configuration</p>
              <p style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 16, lineHeight: 1.6 }}>Set your province or state. Tax rates apply automatically to all invoices.</p>
              <div style={{ marginBottom: 20 }}>
                <label style={lbl}>Province / State</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {PROVINCES.map(p => (
                    <button key={p.code} onClick={() => { setProvince(p.code); setCustomRate(p.rate); }} style={{ padding: '10px 8px', borderRadius: 8, cursor: 'pointer', textAlign: 'center', fontFamily: 'var(--font-body)', background: province === p.code ? 'rgba(252,226,5,0.10)' : 'var(--color-mist)', border: province === p.code ? '2px solid #FCE205' : '2px solid transparent', transition: 'all 0.1s' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: province === p.code ? '#8A7600' : 'var(--color-text)' }}>{p.code}</p>
                      <p style={{ fontSize: 9, color: 'var(--color-muted)', marginTop: 2 }}>{p.tax}</p>
                      <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: province === p.code ? '#8A7600' : 'var(--color-text-sub)', marginTop: 2 }}>{p.rate}%</p>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ padding: '14px 16px', borderRadius: 10, marginBottom: 20, background: 'rgba(252,226,5,0.06)', border: '1px solid rgba(252,226,5,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#8A7600' }}>Active Tax — {selectedProvince.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-sub)', marginTop: 3 }}>{selectedProvince.tax} applied to all invoices</p>
                </div>
                <p style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#8A7600' }}>{selectedProvince.rate}%</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
                <div>
                  <label style={lbl}>Custom Rate Override</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="number" min="0" max="30" step="0.1" style={{ ...inp, width: 80 }} value={customRate} onChange={e => setCustomRate(parseFloat(e.target.value) || 0)} onFocus={focus} onBlur={blur} />
                    <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>% override</span>
                  </div>
                </div>
                <div>
                  <label style={lbl}>Default Payment Terms</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[7, 14, 30, 45].map(days => (
                      <button key={days} onClick={() => setPaymentTerms(days)} style={{ flex: 1, padding: '7px 4px', borderRadius: 7, fontSize: 11, fontWeight: paymentTerms === days ? 700 : 400, background: paymentTerms === days ? 'rgba(252,226,5,0.12)' : 'var(--color-mist)', border: paymentTerms === days ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)', color: paymentTerms === days ? '#8A7600' : 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Net {days}</button>
                    ))}
                  </div>
                </div>
              </div>
              <p style={secHead}><Shield size={14} color="#8A7600" strokeWidth={1.5} />Ontario Construction Act — Holdback</p>
              <div style={{ padding: '14px 16px', borderRadius: 10, background: holdbackEnabled ? 'rgba(252,226,5,0.05)' : 'var(--color-mist)', border: `1px solid ${holdbackEnabled ? 'rgba(252,226,5,0.2)' : 'var(--color-border)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: holdbackEnabled ? 12 : 0 }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700 }}>Statutory Holdback</p>
                    <p style={{ fontSize: 11, color: 'var(--color-text-sub)', marginTop: 3 }}>Required for contracts over $100,000 under the Construction Act (Ontario)</p>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={holdbackEnabled} onChange={e => setHoldbackEnabled(e.target.checked)} style={{ accentColor: '#FCE205', width: 16, height: 16 }} />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{holdbackEnabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>
                {holdbackEnabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="number" min="0" max="20" step="0.5" style={{ ...inp, width: 70 }} value={holdbackPct} onChange={e => setHoldbackPct(parseFloat(e.target.value) || 0)} onFocus={focus} onBlur={blur} />
                    <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>% withheld — released after lien period expires</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TRADES */}
          {activeTab === 'trades' && (
            <div>
              <p style={secHead}><HardHat size={14} color="#8A7600" strokeWidth={1.5} />Your Trade Types</p>
              <p style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 16, lineHeight: 1.6 }}>Select all trades that apply. This customizes invoice templates, scope items, and OBC references.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {TRADES.map(trade => {
                  const selected = selectedTrades.includes(trade.id);
                  return (
                    <button key={trade.id} onClick={() => toggleTrade(trade.id)} style={{ padding: '14px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)', background: selected ? 'rgba(252,226,5,0.08)' : 'var(--color-mist)', border: selected ? '2px solid #FCE205' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.12s' }}>
                      <span style={{ fontSize: 20 }}>{trade.icon}</span>
                      <p style={{ fontSize: 12, fontWeight: selected ? 700 : 400, color: selected ? '#8A7600' : 'var(--color-text)', flex: 1 }}>{trade.label}</p>
                      {selected && <Check size={14} color="#8A7600" strokeWidth={2.5} />}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
                <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{selectedTrades.length} trade{selectedTrades.length !== 1 ? 's' : ''} selected</p>
              </div>
            </div>
          )}

          {/* TEAM */}
          {activeTab === 'team' && (
            <div>
              <p style={secHead}><Users size={14} color="#8A7600" strokeWidth={1.5} />Team Members</p>
              <div style={{ marginBottom: 20 }}>
                {team.map(member => (
                  <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, marginBottom: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: 'rgba(252,226,5,0.15)', border: '1px solid rgba(252,226,5,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#8A7600' }}>
                      {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600 }}>{member.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{member.email}</p>
                    </div>
                    <span className="forge-badge forge-badge--neutral" style={{ fontSize: 10 }}>{member.role}</span>
                    <button onClick={() => removeTeamMember(member.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, opacity: 0.5 }}>
                      <Trash2 size={13} color="var(--color-danger)" />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ padding: '16px', borderRadius: 10, background: 'rgba(252,226,5,0.03)', border: '1px dashed rgba(252,226,5,0.25)' }}>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Add Team Member</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px', gap: 10, marginBottom: 10 }}>
                  <div><label style={lbl}>Full Name</label><input style={inp} placeholder="Jane Smith" value={newName} onChange={e => setNewName(e.target.value)} onFocus={focus} onBlur={blur} /></div>
                  <div><label style={lbl}>Email</label><input style={inp} placeholder="jane@company.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} onFocus={focus} onBlur={blur} /></div>
                  <div><label style={lbl}>Role</label>
                    <select style={inp} value={newRole} onChange={e => setNewRole(e.target.value)} onFocus={focus} onBlur={blur}>
                      {['Owner', 'Project Manager', 'Estimator', 'Field Tech', 'Admin', 'Accountant'].map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <button className="forge-button forge-button--secondary" onClick={addTeamMember} style={{ gap: 6 }}>
                  <Plus size={12} /> Add Member
                </button>
              </div>
            </div>
          )}

          {/* BRANDING */}
          {activeTab === 'branding' && (
            <div>
              <p style={secHead}><Palette size={14} color="#8A7600" strokeWidth={1.5} />Brand Colors</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <div>
                  <label style={lbl}>Primary Brand Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} style={{ width: 48, height: 38, borderRadius: 8, border: '1px solid var(--color-border)', cursor: 'pointer', padding: 2 }} />
                    <input style={{ ...inp, width: 120, fontFamily: 'var(--font-mono)' }} value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                </div>
              </div>
              <label style={lbl}>Presets</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
                {[{ color: '#FCE205', name: 'Forge Yellow' }, { color: '#2563EB', name: 'Blueprint Blue' }, { color: '#16A34A', name: 'Site Green' }, { color: '#DC2626', name: 'Safety Red' }, { color: '#9333EA', name: 'Premium Purple' }, { color: '#EA580C', name: 'Copper Orange' }, { color: '#0F172A', name: 'Graphite' }].map(preset => (
                  <button key={preset.color} onClick={() => setPrimaryColor(preset.color)} title={preset.name} style={{ width: 36, height: 36, borderRadius: 8, cursor: 'pointer', background: preset.color, border: primaryColor === preset.color ? '3px solid var(--color-text)' : '2px solid var(--color-border)', transition: 'all 0.1s' }} />
                ))}
              </div>
              <p style={secHead}><Receipt size={14} color="#8A7600" strokeWidth={1.5} />Invoice Preview</p>
              <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                <div style={{ padding: '16px 20px', background: primaryColor, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 800, color: '#111' }}>{companyName}</p>
                    {tagline && <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.6)', marginTop: 2 }}>{tagline}</p>}
                  </div>
                  <p style={{ fontSize: 20, fontWeight: 800, color: '#111' }}>INVOICE</p>
                </div>
                <div style={{ padding: '16px 20px', background: '#FFFFFF' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div><p style={{ fontSize: 10, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bill To</p><p style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>Client Name</p></div>
                    <div style={{ textAlign: 'right' }}><p style={{ fontSize: 10, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Invoice #</p><p style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, marginTop: 4 }}>INV-240001</p><p style={{ fontSize: 11, color: '#666' }}>Due in {paymentTerms} days</p></div>
                  </div>
                  <div style={{ padding: '10px 12px', background: '#F9F9F7', borderRadius: 6, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12 }}>Services rendered</span><span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700 }}>$5,000.00</span>
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 24, fontSize: 11, color: '#666' }}><span>Subtotal</span><span style={{ fontFamily: 'monospace' }}>$5,000.00</span></div>
                    <div style={{ display: 'flex', gap: 24, fontSize: 11, color: '#666' }}><span>{selectedProvince.tax} {selectedProvince.rate}%</span><span style={{ fontFamily: 'monospace' }}>${(5000 * selectedProvince.rate / 100).toFixed(2)}</span></div>
                    <div style={{ display: 'flex', gap: 24, fontSize: 14, fontWeight: 800, color: '#111', paddingTop: 6, borderTop: '1px solid #eee', marginTop: 4 }}><span>Total</span><span style={{ fontFamily: 'monospace' }}>${(5000 * (1 + selectedProvince.rate / 100)).toFixed(2)}</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FEATURES */}
          {activeTab === 'features' && (
            <div>
              <p style={secHead}><Zap size={14} color="#8A7600" strokeWidth={1.5} />Feature Configuration</p>
              <p style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 20, lineHeight: 1.6 }}>
                Turn features on or off. Changes apply instantly — hidden features disappear from the sidebar. Re-enable any feature at any time.
              </p>
              {FEATURE_GROUPS.map(group => (
                <div key={group.group} style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10 }}>
                    {group.group}
                  </p>
                  {group.items.map(item => {
                    const isOn = features[item.key];
                    return (
                      <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 10, marginBottom: 8, background: isOn ? 'rgba(252,226,5,0.04)' : 'var(--color-mist)', border: `1px solid ${isOn ? 'rgba(252,226,5,0.2)' : 'var(--color-border)'}`, transition: 'all 0.15s' }}>
                        <button
                          onClick={() => setFeature(item.key, !isOn)}
                          style={{ width: 44, height: 24, borderRadius: 100, flexShrink: 0, background: isOn ? '#FCE205' : 'var(--color-border)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'all 0.2s', boxShadow: isOn ? '0 0 0 3px rgba(252,226,5,0.2)' : 'none' }}
                        >
                          <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', position: 'absolute', top: 3, left: isOn ? 23 : 3, transition: 'all 0.2s' }} />
                        </button>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: isOn ? 'var(--color-text)' : 'var(--color-text-sub)' }}>{item.label}</p>
                          <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>{item.desc}</p>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 100, letterSpacing: '0.05em', textTransform: 'uppercase', background: isOn ? 'rgba(45,122,80,0.12)' : 'rgba(140,134,128,0.12)', color: isOn ? 'var(--color-success)' : 'var(--color-muted)', border: `1px solid ${isOn ? 'rgba(45,122,80,0.2)' : 'var(--color-border)'}`, flexShrink: 0 }}>
                          {isOn ? 'Active' : 'Hidden'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}