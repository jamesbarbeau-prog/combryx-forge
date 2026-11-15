import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import {
  Building2, DollarSign, Hammer, Users, BookOpen, Zap,
  Lock, Eye, EyeOff, Plus, X, Check,
  Download, Shield, UserX, UserCheck,
  Upload, Trash2, Car, Palette,
  Mail, RefreshCw,
} from 'lucide-react';

const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

type Tab = 'company' | 'branding' | 'tax' | 'trades' | 'team' | 'bookkeeping' | 'features' | 'warranty' | 'warranty_team' | 'email';

const TRADE_TAGS = [
  { tag: 'Lead Carpenter',  gifi: '7620' },
  { tag: 'Apprentice',      gifi: '7620' },
  { tag: 'Electrician',     gifi: '7621' },
  { tag: 'Plumber',         gifi: '7622' },
  { tag: 'HVAC Tech',       gifi: '7623' },
  { tag: 'Framer',          gifi: '7620' },
  { tag: 'Drywaller',       gifi: '7620' },
  { tag: 'Painter',         gifi: '7624' },
  { tag: 'Tile Setter',     gifi: '7620' },
  { tag: 'Labourer',        gifi: '7620' },
  { tag: 'Site Supervisor', gifi: '7610' },
  { tag: 'Project Manager', gifi: '7600' },
  { tag: 'Estimator',       gifi: '7600' },
  { tag: 'Office Admin',    gifi: '7590' },
];

const COA_DEFAULTS = [
  { forge_trade: 'Framing',       account_code: '5010', account_name: 'Direct Labor — Framing'    },
  { forge_trade: 'Electrical',    account_code: '5020', account_name: 'Direct Labor — Electrical'  },
  { forge_trade: 'Plumbing',      account_code: '5030', account_name: 'Direct Labor — Plumbing'    },
  { forge_trade: 'HVAC',          account_code: '5040', account_name: 'Direct Labor — HVAC'        },
  { forge_trade: 'Drywall',       account_code: '5050', account_name: 'Direct Labor — Drywall'     },
  { forge_trade: 'Painting',      account_code: '5060', account_name: 'Direct Labor — Painting'    },
  { forge_trade: 'Flooring',      account_code: '5070', account_name: 'Direct Labor — Flooring'    },
  { forge_trade: 'Tile',          account_code: '5080', account_name: 'Direct Labor — Tile'        },
  { forge_trade: 'Concrete',      account_code: '5090', account_name: 'Direct Labor — Concrete'    },
  { forge_trade: 'Demolition',    account_code: '5100', account_name: 'Direct Labor — Demo'        },
  { forge_trade: 'Materials',     account_code: '5200', account_name: 'Materials & Supplies'       },
  { forge_trade: 'Allowances',    account_code: '5210', account_name: 'Client Allowances'          },
  { forge_trade: 'Subcontractor', account_code: '5300', account_name: 'Subcontractor Costs'        },
  { forge_trade: 'Overhead',      account_code: '6000', account_name: 'Overhead — General'         },
];

const inp: React.CSSProperties = {
  height: 38, padding: '0 10px', borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-panel-raised)',
  color: 'var(--color-text)', fontSize: 12,
  fontFamily: 'var(--font-body)', outline: 'none',
  width: '100%', transition: 'all 0.15s',
};
const lbl: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
  textTransform: 'uppercase', color: 'var(--color-muted)',
  marginBottom: 5, display: 'block',
};
function focus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = '#FCE205';
  e.currentTarget.style.boxShadow   = '0 0 0 3px rgba(252,226,5,0.12)';
}
function blur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'var(--color-border)';
  e.currentTarget.style.boxShadow   = 'none';
}

/* ── File Upload ── */
interface FileUploadProps {
  bucket: string; path: string; label: string;
  accept?: string; currentUrl?: string; isPublic?: boolean;
  onUploaded: (url: string) => void;
}
function FileUpload({ bucket, path, label, accept = 'image/*', currentUrl, isPublic = false, onUploaded }: FileUploadProps) {
  const [dragging, setDragging]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState<string | null>(currentUrl ?? null);
  const [error, setError]         = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (currentUrl) setPreview(currentUrl); }, [currentUrl]);

  const upload = useCallback(async (file: File) => {
    if (!file) return;
    setUploading(true); setError('');
    const ext = file.name.split('.').pop();
    const filename = `${path}.${ext}`;
    const { error: upErr } = await supabase.storage.from(bucket).upload(filename, file, { upsert: true });
    if (upErr) { setError(upErr.message); setUploading(false); return; }
    let url = '';
    if (isPublic) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(filename);
      url = data.publicUrl;
    } else {
      const { data } = await supabase.storage.from(bucket).createSignedUrl(filename, 60 * 60 * 24 * 365);
      url = data?.signedUrl ?? '';
    }
    setPreview(url); onUploaded(url); setUploading(false);
  }, [bucket, path, isPublic, onUploaded]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }
  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload(file);
  }

  return (
    <div>
      <label style={lbl}>{label}</label>
      {preview ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img src={preview} alt={label} style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 8, border: '1px solid var(--color-border)', display: 'block', objectFit: 'cover' }} onError={() => setPreview(null)} />
          <button onClick={() => { setPreview(null); onUploaded(''); }} style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', background: '#DC2626', border: '2px solid var(--color-panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={10} color="#FFFFFF" strokeWidth={3} />
          </button>
          <button onClick={() => inputRef.current?.click()} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, background: 'var(--color-mist)', border: '1px solid var(--color-border)', fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            <Upload size={10} /> Replace
          </button>
        </div>
      ) : (
        <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()} style={{ border: `2px dashed ${dragging ? '#FCE205' : 'var(--color-border)'}`, borderRadius: 10, padding: '28px 20px', background: dragging ? 'rgba(252,226,5,0.06)' : 'var(--color-mist)', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}>
          {uploading ? (
            <div>
              <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #FCE205', borderTopColor: 'transparent', margin: '0 auto 10px', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Uploading...</p>
            </div>
          ) : (
            <div>
              <Upload size={22} color={dragging ? '#8A7600' : 'var(--color-muted)'} strokeWidth={1.5} style={{ margin: '0 auto 10px' }} />
              <p style={{ fontSize: 12, fontWeight: 600, color: dragging ? '#8A7600' : 'var(--color-text)', marginBottom: 4 }}>{dragging ? 'Drop to upload' : 'Drop file here or click to browse'}</p>
              <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>PNG, JPG, PDF accepted</p>
            </div>
          )}
        </div>
      )}
      {error && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 5 }}>{error}</p>}
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={onChange} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── PIN Gate ── */
function PinGate({ section, children }: { section: string; children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin]           = useState('');
  const [show, setShow]         = useState(false);
  const [error, setError]       = useState('');
  const [checking, setChecking] = useState(false);

  async function checkPin() {
    if (!pin.trim()) return;
    setChecking(true);
    const { data } = await supabase.from('admin_pins').select('pin_hash').eq('company_id', COMPANY_ID).eq('section', section).single();
    setChecking(false);
    if (data?.pin_hash === pin) { setUnlocked(true); setError(''); }
    else { setError('Incorrect PIN. Try again.'); setPin(''); }
  }

  if (unlocked) return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '8px 12px', borderRadius: 8, background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', width: 'fit-content' }}>
        <Shield size={12} color="#16A34A" strokeWidth={1.5} />
        <span style={{ fontSize: 11, fontWeight: 600, color: '#16A34A' }}>Admin access granted</span>
        <button onClick={() => { setUnlocked(false); setPin(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 8, fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>Lock</button>
      </div>
      {children}
    </div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div style={{ background: 'var(--color-panel)', borderRadius: 14, padding: '40px', maxWidth: 360, width: '100%', border: '1px solid var(--color-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(252,226,5,0.12)', border: '1px solid rgba(252,226,5,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Lock size={22} color="#8A7600" strokeWidth={1.5} />
        </div>
        <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text)', marginBottom: 6 }}>Admin Access Required</p>
        <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 24, lineHeight: 1.6 }}>This section is restricted. Enter your admin PIN to continue.</p>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input style={{ ...inp, textAlign: 'center', fontSize: 24, letterSpacing: '0.3em', fontFamily: 'var(--font-mono)', height: 52 }} type={show ? 'text' : 'password'} placeholder="••••" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === 'Enter' && checkPin()} onFocus={focus} onBlur={blur} maxLength={8} />
          <button onClick={() => setShow(!show)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}>
            {show ? <EyeOff size={14} color="var(--color-muted)" /> : <Eye size={14} color="var(--color-muted)" />}
          </button>
        </div>
        {error && <p style={{ fontSize: 11, color: '#DC2626', marginBottom: 10 }}>{error}</p>}
        <button onClick={checkPin} disabled={checking || !pin} style={{ width: '100%', padding: '12px', borderRadius: 9, fontSize: 13, fontWeight: 700, background: pin ? '#FCE205' : 'var(--color-mist)', border: 'none', color: pin ? '#111010' : 'var(--color-muted)', cursor: pin ? 'pointer' : 'default', fontFamily: 'var(--font-body)', transition: 'all 0.15s' }}>
          {checking ? 'Checking...' : 'Unlock'}
        </button>
        <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 14 }}>Default PIN: 1234</p>
      </div>
    </div>
  );
}

/* ── Section helper ── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8A7600', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--color-border)' }}>{title}</p>
      {children}
    </div>
  );
}

/* ── Main Settings Page ── */
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('company');

  const TABS = [
    { id: 'company',     label: 'Company',     icon: Building2,  locked: false },
    { id: 'branding',    label: 'Branding',    icon: Palette,    locked: false },
    { id: 'tax',         label: 'Tax & Rates', icon: DollarSign, locked: false },
    { id: 'trades',      label: 'Trades',      icon: Hammer,     locked: false },
    { id: 'team',        label: 'Team',        icon: Users,      locked: true  },
    { id: 'bookkeeping', label: 'Bookkeeping', icon: BookOpen,   locked: true  },
    { id: 'features',    label: 'Features',    icon: Zap,        locked: false },
    { id: 'warranty',    label: 'Warranty',    icon: Shield,     locked: false },
    { id: 'email',       label: 'Email & API', icon: Mail,       locked: true  },
    { id: 'warranty_team', label: 'Warranty Team', icon: Shield, locked: false },
  ];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>System</p>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Settings</h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as Tab)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: active ? 700 : 400, background: active ? 'rgba(252,226,5,0.10)' : 'transparent', border: active ? '1px solid rgba(252,226,5,0.2)' : '1px solid transparent', color: active ? '#8A7600' : 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left', transition: 'all 0.12s' }}>
                <Icon size={13} strokeWidth={active ? 2 : 1.5} />
                {tab.label}
                {tab.locked && <Lock size={10} style={{ marginLeft: 'auto' }} color="var(--color-muted)" />}
              </button>
            );
          })}
        </div>
        <div>
          {activeTab === 'company'     && <CompanyTab />}
          {activeTab === 'branding'    && <BrandingTab />}
          {activeTab === 'tax'         && <TaxTab />}
          {activeTab === 'trades'      && <TradesTab />}
          {activeTab === 'team'        && <PinGate section="team"><TeamTab /></PinGate>}
          {activeTab === 'bookkeeping' && <PinGate section="bookkeeping"><BookkeepingTab /></PinGate>}
          {activeTab === 'features'    && <FeaturesTab />}
          {activeTab === 'warranty'    && <WarrantySettingsTab />}  
          {activeTab === 'warranty_team' && <WarrantyTeamTab />}
    
          {activeTab === 'email'       && <PinGate section="team"><EmailConnectionsTab /></PinGate>}
        </div>
      </div>
    </div>
  );
}

/* ── COMPANY TAB ── */
function CompanyTab() {
  const [settings, setSettings] = useState<any>({});
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from('company_settings').select('settings').eq('company_id', COMPANY_ID).single();
    if (data?.settings) setSettings(data.settings);
  }
  async function save() {
    setSaving(true);
    await supabase.from('company_settings').upsert({ company_id: COMPANY_ID, settings });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }
  function set(key: string, val: string) { setSettings((prev: any) => ({ ...prev, [key]: val })); }

  return (
    <div className="forge-card" style={{ padding: '24px' }}>
      <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>Company Information</p>
      <div style={{ marginBottom: 20 }}>
        <FileUpload bucket="company-assets" path={`logos/${COMPANY_ID}`} label="Company Logo" accept="image/png,image/jpeg,image/svg+xml" currentUrl={settings.logo_url} isPublic={true} onUploaded={url => set('logo_url', url)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {[
          { key: 'name',    label: 'Company Name',      placeholder: 'Combryx Construction Inc.' },
          { key: 'phone',   label: 'Phone',              placeholder: '416-555-0100'              },
          { key: 'email',   label: 'Email',              placeholder: 'office@combryx.ca'         },
          { key: 'website', label: 'Website',            placeholder: 'www.combryx.ca'            },
          { key: 'hst',     label: 'HST Registration #', placeholder: '123456789 RT0001'          },
          { key: 'cra',     label: 'Business Number',    placeholder: '123456789'                 },
        ].map(f => (
          <div key={f.key}>
            <label style={lbl}>{f.label}</label>
            <input style={inp} placeholder={f.placeholder} value={settings[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} onFocus={focus} onBlur={blur} />
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>Street Address</label>
        <input style={inp} placeholder="123 Main St, Toronto, ON M5V 1A1" value={settings.address ?? ''} onChange={e => set('address', e.target.value)} onFocus={focus} onBlur={blur} />
      </div>
      <div style={{ marginBottom: 24 }}>
        <label style={lbl}>Closing Message</label>
        <textarea style={{ ...inp, height: 72, padding: '8px 10px', resize: 'none' }} value={settings.closing_message ?? ''} onChange={e => set('closing_message', e.target.value)} onFocus={focus} onBlur={blur} placeholder="Thank you for choosing us." />
      </div>
      <button onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: saved ? '#16A34A' : '#FCE205', border: 'none', color: saved ? '#FFFFFF' : '#111010', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s' }}>
        {saved ? <><Check size={14} /> Saved!</> : saving ? 'Saving...' : 'Save Company Info'}
      </button>
    </div>
  );
}

/* ── TAX TAB ── */
function TaxTab() {
  const [settings, setSettings] = useState<any>({});
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from('company_settings').select('settings').eq('company_id', COMPANY_ID).single();
    if (data?.settings) setSettings(data.settings);
  }
  async function save() {
    setSaving(true);
    await supabase.from('company_settings').upsert({ company_id: COMPANY_ID, settings });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }
  function set(key: string, val: any) { setSettings((prev: any) => ({ ...prev, [key]: val })); }

  return (
    <div className="forge-card" style={{ padding: '24px' }}>
      <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>Tax & Rate Defaults</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div>
          <label style={lbl}>Default HST Rate (%)</label>
          <input style={{ ...inp, fontFamily: 'var(--font-mono)' }} type="number" min="0" max="20" step="0.5" value={settings.hst_rate ?? 13} onChange={e => set('hst_rate', e.target.value)} onFocus={focus} onBlur={blur} />
          <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 4 }}>Ontario: 13% HST</p>
        </div>
        <div>
          <label style={lbl}>Default Holdback (%)</label>
          <select style={inp} value={settings.holdback_pct ?? 0} onChange={e => set('holdback_pct', e.target.value)} onFocus={focus} onBlur={blur}>
            {[0, 5, 10, 15].map(v => <option key={v} value={v}>{v === 0 ? 'None' : `${v}%`}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Fiscal Year End</label>
          <select style={inp} value={settings.fiscal_year_end ?? 'December'} onChange={e => set('fiscal_year_end', e.target.value)} onFocus={focus} onBlur={blur}>
            {['January','February','March','April','May','June','July','August','September','October','November','December'].map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Default Payment Terms</label>
          <select style={inp} value={settings.payment_terms ?? 'net_30'} onChange={e => set('payment_terms', e.target.value)} onFocus={focus} onBlur={blur}>
            {[{id:'due_on_receipt',label:'Due on Receipt'},{id:'net_7',label:'Net 7'},{id:'net_14',label:'Net 14'},{id:'net_30',label:'Net 30'},{id:'net_45',label:'Net 45'},{id:'net_60',label:'Net 60'}].map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>WSIB Rate (%)</label>
          <input style={{ ...inp, fontFamily: 'var(--font-mono)' }} type="number" min="0" step="0.1" value={settings.wsib_rate ?? 6.9} onChange={e => set('wsib_rate', e.target.value)} onFocus={focus} onBlur={blur} />
        </div>
        <div>
          <label style={lbl}>EHT Rate (%) — Employer Health Tax</label>
          <input style={{ ...inp, fontFamily: 'var(--font-mono)' }} type="number" min="0" step="0.1" value={settings.eht_rate ?? 1.95} onChange={e => set('eht_rate', e.target.value)} onFocus={focus} onBlur={blur} />
        </div>
      </div>
      <button onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: saved ? '#16A34A' : '#FCE205', border: 'none', color: saved ? '#FFFFFF' : '#111010', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
        {saved ? <><Check size={14} /> Saved!</> : saving ? 'Saving...' : 'Save Tax Settings'}
      </button>
    </div>
  );
}

/* ── TRADES TAB ── */
function TradesTab() {
  const [trades, setTrades]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from('trade_matrix').select('*').order('sort_order');
    if (data) setTrades(data);
    setLoading(false);
  }
  async function updateTrade(id: string, field: string, val: any) {
    setTrades(prev => prev.map(t => t.id === id ? { ...t, [field]: val } : t));
    await supabase.from('trade_matrix').update({ [field]: val }).eq('id', id);
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Loading trades...</div>;

  return (
    <div className="forge-card">
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: 14, fontWeight: 700 }}>Trade Matrix</p>
        <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{trades.length} trades — click any cell to edit</p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="forge-table">
          <thead>
            <tr><th>Trade</th><th>Unit</th><th>Labour Rate</th><th>Markup</th><th>Std Allow</th><th>Prem Allow</th><th>Lux Allow</th><th>Sundries %</th></tr>
          </thead>
          <tbody>
            {trades.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 600, fontSize: 12 }}>{t.trade}</td>
                <td style={{ fontSize: 11, color: 'var(--color-muted)' }}>{t.unit}</td>
                {(['labour_rate','markup_multiplier','allowance_standard','allowance_premium','allowance_luxury','sundries_percent'] as const).map(field => (
                  <td key={field}>
                    <input style={{ width: 76, height: 28, padding: '0 6px', borderRadius: 5, border: '1px solid transparent', background: 'transparent', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text)', outline: 'none' }} type="number" step="0.01" value={t[field] ?? ''} onChange={e => updateTrade(t.id, field, Number(e.target.value))} onFocus={e => { e.currentTarget.style.borderColor = '#FCE205'; e.currentTarget.style.background = 'var(--color-panel)'; }} onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── TEAM TAB ── */
function TeamTab() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [firing, setFiring]       = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState<any>({
    first_name: '', last_name: '', email: '', phone: '',
    employee_id: `EMP-${Date.now().toString().slice(-4)}`,
    hire_date: new Date().toISOString().split('T')[0],
    trade_tag: 'Labourer', role: 'field',
    base_rate: '', vacation_pct: 4, burden_pct: 20,
    hsa_monthly: 0, rrsp_match_pct: 0, tool_allowance: 0,
    sin_last4: '', address: '', notes: '',
    has_vehicle: false, license_class: 'G', license_expiry: '',
    drivers_license_url: '', background_check_date: '', first_aid_expiry: '',
    photo_url: '',
  });

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from('employees').select('*').eq('company_id', COMPANY_ID).order('last_name');
    if (data) setEmployees(data);
    setLoading(false);
  }
  function setF(key: string, val: any) { setForm((prev: any) => ({ ...prev, [key]: val })); }
  const burdenedRate = form.base_rate ? (Number(form.base_rate) * (1 + Number(form.burden_pct) / 100)).toFixed(2) : '0.00';

  async function onboard() {
    if (!form.first_name || !form.last_name) return;
    setSaving(true);
    const gifi = TRADE_TAGS.find(t => t.tag === form.trade_tag)?.gifi ?? '7620';
    await supabase.from('employees').insert({ ...form, company_id: COMPANY_ID, gifi_code: gifi, status: 'active', base_rate: Number(form.base_rate) });
    setSaving(false); setShowModal(false); load();
  }

  async function toggleStatus(emp: any) {
    const newStatus = emp.status === 'active' ? 'terminated' : 'active';
    const updates: any = { status: newStatus };
    if (newStatus === 'terminated') updates.termination_date = new Date().toISOString().split('T')[0];
    await supabase.from('employees').update(updates).eq('id', emp.id);
    setFiring(null); load();
  }

  const active     = employees.filter(e => e.status === 'active');
  const terminated = employees.filter(e => e.status === 'terminated');

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Loading team...</div>;

  return (
    <div>
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px', overflowY: 'auto' }} onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={{ background: 'var(--color-panel)', borderRadius: 14, width: '100%', maxWidth: 680, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', border: '1px solid var(--color-border)', overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserCheck size={15} color="#FCE205" strokeWidth={1.5} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>Onboard New Employee</span>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="var(--color-muted)" /></button>
            </div>
            <div style={{ padding: '20px', maxHeight: '78vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Section title="Personal Information">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label style={lbl}>First Name *</label><input style={inp} value={form.first_name} onChange={e => setF('first_name', e.target.value)} onFocus={focus} onBlur={blur} /></div>
                  <div><label style={lbl}>Last Name *</label><input style={inp} value={form.last_name} onChange={e => setF('last_name', e.target.value)} onFocus={focus} onBlur={blur} /></div>
                  <div><label style={lbl}>Email</label><input style={inp} type="email" value={form.email} onChange={e => setF('email', e.target.value)} onFocus={focus} onBlur={blur} /></div>
                  <div><label style={lbl}>Phone</label><input style={inp} value={form.phone} onChange={e => setF('phone', e.target.value)} onFocus={focus} onBlur={blur} /></div>
                  <div><label style={lbl}>Employee ID</label><input style={{ ...inp, fontFamily: 'var(--font-mono)' }} value={form.employee_id} onChange={e => setF('employee_id', e.target.value)} onFocus={focus} onBlur={blur} /></div>
                  <div><label style={lbl}>SIN (last 4 only)</label><input style={{ ...inp, fontFamily: 'var(--font-mono)' }} maxLength={4} placeholder="****" value={form.sin_last4} onChange={e => setF('sin_last4', e.target.value)} onFocus={focus} onBlur={blur} /></div>
                  <div><label style={lbl}>Hire Date</label><input style={inp} type="date" value={form.hire_date} onChange={e => setF('hire_date', e.target.value)} onFocus={focus} onBlur={blur} /></div>
                  <div>
                    <label style={lbl}>Role</label>
                    <select style={inp} value={form.role} onChange={e => setF('role', e.target.value)} onFocus={focus} onBlur={blur}>
                      {['field','supervisor','admin','estimator','office'].map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: 12 }}><label style={lbl}>Address</label><input style={inp} value={form.address} onChange={e => setF('address', e.target.value)} onFocus={focus} onBlur={blur} /></div>
              </Section>
              <Section title="Profile Photo">
                <FileUpload bucket="employee-docs" path={`photos/${form.employee_id}`} label="Employee Photo" accept="image/png,image/jpeg" currentUrl={form.photo_url} isPublic={false} onUploaded={url => setF('photo_url', url)} />
              </Section>
              <Section title="Trade & Compensation">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={lbl}>Trade Tag</label>
                    <select style={inp} value={form.trade_tag} onChange={e => setF('trade_tag', e.target.value)} onFocus={focus} onBlur={blur}>
                      {TRADE_TAGS.map(t => <option key={t.tag} value={t.tag}>{t.tag} (GIFI {t.gifi})</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Vacation Pay</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[4, 6].map(v => (
                        <button key={v} onClick={() => setF('vacation_pct', v)} style={{ flex: 1, padding: '8px', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: form.vacation_pct === v ? 700 : 400, background: form.vacation_pct === v ? 'rgba(252,226,5,0.12)' : 'var(--color-mist)', border: form.vacation_pct === v ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)', color: form.vacation_pct === v ? '#8A7600' : 'var(--color-muted)' }}>{v}%</button>
                      ))}
                    </div>
                    <p style={{ fontSize: 9, color: 'var(--color-muted)', marginTop: 3 }}>Ontario min 4% (6% after 5 yrs)</p>
                  </div>
                  <div>
                    <label style={lbl}>Base Rate ($/hr)</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--color-muted)' }}>$</span>
                      <input style={{ ...inp, paddingLeft: 20, fontFamily: 'var(--font-mono)' }} type="number" min="0" step="0.25" placeholder="35.00" value={form.base_rate} onChange={e => setF('base_rate', e.target.value)} onFocus={focus} onBlur={blur} />
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Burden % (CPP + EI + WSIB + EHT)</label>
                    <input style={{ ...inp, fontFamily: 'var(--font-mono)' }} type="number" min="0" max="40" step="0.5" value={form.burden_pct} onChange={e => setF('burden_pct', e.target.value)} onFocus={focus} onBlur={blur} />
                    <p style={{ fontSize: 9, color: 'var(--color-muted)', marginTop: 3 }}>Typical: 18–22%</p>
                  </div>
                </div>
                {form.base_rate && (
                  <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 9, background: 'rgba(252,226,5,0.06)', border: '1px solid rgba(252,226,5,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#8A7600', marginBottom: 2 }}>True Cost Per Hour</p>
                      <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>${form.base_rate}/hr base + {form.burden_pct}% burden</p>
                    </div>
                    <p style={{ fontSize: 22, fontWeight: 900, color: '#8A7600', fontFamily: 'var(--font-mono)' }}>${burdenedRate}<span style={{ fontSize: 12, fontWeight: 400 }}>/hr</span></p>
                  </div>
                )}
              </Section>
              <Section title="Benefits & Allowances">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={lbl}>HSA Monthly ($)</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--color-muted)' }}>$</span>
                      <input style={{ ...inp, paddingLeft: 20, fontFamily: 'var(--font-mono)' }} type="number" min="0" step="50" value={form.hsa_monthly} onChange={e => setF('hsa_monthly', e.target.value)} onFocus={focus} onBlur={blur} />
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>RRSP Match (%)</label>
                    <input style={{ ...inp, fontFamily: 'var(--font-mono)' }} type="number" min="0" max="10" step="0.5" value={form.rrsp_match_pct} onChange={e => setF('rrsp_match_pct', e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                  <div>
                    <label style={lbl}>Tool Allowance ($/yr)</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--color-muted)' }}>$</span>
                      <input style={{ ...inp, paddingLeft: 20, fontFamily: 'var(--font-mono)' }} type="number" min="0" step="100" value={form.tool_allowance} onChange={e => setF('tool_allowance', e.target.value)} onFocus={focus} onBlur={blur} />
                    </div>
                  </div>
                </div>
              </Section>
              <Section title="Vehicle & Driving">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)', cursor: 'pointer' }} onClick={() => setF('has_vehicle', !form.has_vehicle)}>
                  <div style={{ width: 36, height: 20, borderRadius: 100, background: form.has_vehicle ? '#FCE205' : 'var(--color-border)', position: 'relative', transition: 'all 0.2s', flexShrink: 0 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#FFFFFF', position: 'absolute', top: 3, left: form.has_vehicle ? 19 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600 }}>Company vehicle assigned</p>
                    <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>Requires valid driver's license on file</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>License Class</label>
                    <select style={inp} value={form.license_class} onChange={e => setF('license_class', e.target.value)} onFocus={focus} onBlur={blur}>
                      {['G','G2','AZ','DZ','BZ','CZ'].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>License Expiry</label><input style={inp} type="date" value={form.license_expiry} onChange={e => setF('license_expiry', e.target.value)} onFocus={focus} onBlur={blur} /></div>
                  <div><label style={lbl}>Background Check Date</label><input style={inp} type="date" value={form.background_check_date} onChange={e => setF('background_check_date', e.target.value)} onFocus={focus} onBlur={blur} /></div>
                  <div><label style={lbl}>First Aid Cert Expiry</label><input style={inp} type="date" value={form.first_aid_expiry} onChange={e => setF('first_aid_expiry', e.target.value)} onFocus={focus} onBlur={blur} /></div>
                </div>
                <FileUpload bucket="employee-docs" path={`licenses/${form.employee_id}`} label="Driver's License (photo or scan)" accept="image/png,image/jpeg,application/pdf" currentUrl={form.drivers_license_url} isPublic={false} onUploaded={url => setF('drivers_license_url', url)} />
              </Section>
              <div>
                <label style={lbl}>Internal Notes</label>
                <textarea style={{ ...inp, height: 64, padding: '8px 10px', resize: 'none' }} value={form.notes} onChange={e => setF('notes', e.target.value)} onFocus={focus} onBlur={blur} placeholder="Certifications, emergency contact, special notes..." />
              </div>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--color-panel-raised)' }}>
              <button onClick={() => setShowModal(false)} className="forge-button forge-button--secondary">Cancel</button>
              <button onClick={onboard} disabled={saving || !form.first_name || !form.last_name} className="forge-button forge-button--primary" style={{ gap: 6 }}>
                <UserCheck size={13} /> {saving ? 'Saving...' : 'Onboard Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Team</p>
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>{active.length} active · {terminated.length} terminated</p>
        </div>
        <button onClick={() => setShowModal(true)} className="forge-button forge-button--primary" style={{ gap: 6 }}>
          <Plus size={13} /> Onboard Employee
        </button>
      </div>
      {employees.length === 0 ? (
        <div className="forge-card" style={{ padding: '60px', textAlign: 'center' }}>
          <Users size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No employees yet</p>
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Click Onboard Employee to add your first team member</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {employees.map(emp => {
            const burdened = emp.base_rate ? (emp.base_rate * (1 + (emp.burden_pct ?? 20) / 100)).toFixed(2) : null;
            const isActive = emp.status === 'active';
            const licenseExpiring = emp.license_expiry && new Date(emp.license_expiry) < new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
            return (
              <div key={emp.id} style={{ padding: '14px 18px', borderRadius: 10, background: 'var(--color-panel)', border: `1px solid ${isActive ? 'var(--color-border)' : 'rgba(220,38,38,0.15)'}`, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: isActive ? 'rgba(252,226,5,0.12)' : 'rgba(220,38,38,0.08)', border: `1px solid ${isActive ? 'rgba(252,226,5,0.25)' : 'rgba(220,38,38,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: isActive ? '#8A7600' : '#DC2626', flexShrink: 0, overflow: 'hidden' }}>
                  {emp.photo_url ? <img src={emp.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} /> : <>{emp.first_name[0]}{emp.last_name[0]}</>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <p style={{ fontSize: 13, fontWeight: 700 }}>{emp.first_name} {emp.last_name}</p>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100, color: isActive ? '#16A34A' : '#DC2626', background: isActive ? 'rgba(22,163,74,0.10)' : 'rgba(220,38,38,0.10)', textTransform: 'uppercase' }}>{emp.status}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 100, background: 'var(--color-mist)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>{emp.trade_tag}</span>
                    {emp.has_vehicle && <Car size={12} color="#1E5FA4" strokeWidth={1.5} />}
                    {licenseExpiring && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100, color: '#D97706', background: 'rgba(217,119,6,0.10)' }}>License Expiring</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <p style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{emp.employee_id}</p>
                    {emp.email && <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{emp.email}</p>}
                    {emp.hire_date && <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>Hired {new Date(emp.hire_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
                  </div>
                </div>
                {burdened && (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#8A7600' }}>${burdened}/hr</p>
                    <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>burdened · ${emp.base_rate}/hr base</p>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {firing === emp.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 7, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
                      <p style={{ fontSize: 11, color: '#DC2626', fontWeight: 600 }}>Confirm?</p>
                      <button onClick={() => toggleStatus(emp)} style={{ padding: '3px 8px', borderRadius: 5, background: '#DC2626', border: 'none', color: '#FFF', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{isActive ? 'Terminate' : 'Reactivate'}</button>
                      <button onClick={() => setFiring(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={12} color="var(--color-muted)" /></button>
                    </div>
                  ) : (
                    <button onClick={() => setFiring(emp.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, background: isActive ? 'rgba(220,38,38,0.06)' : 'rgba(22,163,74,0.06)', border: isActive ? '1px solid rgba(220,38,38,0.2)' : '1px solid rgba(22,163,74,0.2)', color: isActive ? '#DC2626' : '#16A34A', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                      {isActive ? <><UserX size={11} /> Terminate</> : <><UserCheck size={11} /> Reactivate</>}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── BOOKKEEPING TAB ── */
function BookkeepingTab() {
  const [coa, setCoa]             = useState<any[]>(COA_DEFAULTS.map((c, i) => ({ ...c, id: i })));
  const [invoices, setInvoices]   = useState<any[]>([]);
  const [quotes, setQuotes]       = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => { load(); }, []);
  async function load() {
    const [invRes, quoteRes, empRes] = await Promise.all([
      supabase.from('invoices').select('*, clients(first_name, last_name), projects(name)').eq('company_id', COMPANY_ID),
      supabase.from('quotes').select('*, clients(first_name, last_name)').eq('company_id', COMPANY_ID).in('status', ['signed','converted']),
      supabase.from('employees').select('*').eq('company_id', COMPANY_ID).eq('status', 'active'),
    ]);
    if (invRes.data)   setInvoices(invRes.data);
    if (quoteRes.data) setQuotes(quoteRes.data);
    if (empRes.data)   setEmployees(empRes.data);
    setLoading(false);
  }
  function updateCoa(id: number, field: string, val: string) { setCoa(prev => prev.map(c => c.id === id ? { ...c, [field]: val } : c)); }

  function exportFile(sheets: { name: string; data: any[] }[], filename: string) {
    const wb = XLSX.utils.book_new();
    sheets.forEach(s => { const ws = XLSX.utils.json_to_sheet(s.data); XLSX.utils.book_append_sheet(wb, ws, s.name); });
    XLSX.writeFile(wb, filename);
  }

  function exportJournalEntries() {
    const now = new Date().toLocaleDateString('en-CA');
    const rows: any[] = [];
    invoices.forEach(inv => {
      const client = inv.clients ? `${inv.clients.first_name} ${inv.clients.last_name}` : 'Unknown';
      const project = inv.projects?.name ?? '—';
      const ref = inv.invoice_number;
      rows.push({ 'Date': now, 'Ref Number': ref, 'Account': '1100 - Accounts Receivable', 'Debit': inv.total.toFixed(2), 'Credit': '', 'Memo': `Invoice ${ref} — ${client}`, 'Customer:Job': `${client}:${project}`, 'Type': 'Invoice' });
      rows.push({ 'Date': now, 'Ref Number': ref, 'Account': '4000 - Revenue', 'Debit': '', 'Credit': inv.subtotal.toFixed(2), 'Memo': `Revenue — ${client}`, 'Customer:Job': `${client}:${project}`, 'Type': 'Invoice' });
      if (inv.tax_amount > 0) rows.push({ 'Date': now, 'Ref Number': ref, 'Account': '2200 - HST Payable', 'Debit': '', 'Credit': inv.tax_amount.toFixed(2), 'Memo': `HST ${inv.tax_rate}% — ${ref}`, 'Customer:Job': `${client}:${project}`, 'Type': 'Invoice' });
      if (inv.amount_paid > 0) {
        const pDate = inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('en-CA') : now;
        rows.push({ 'Date': pDate, 'Ref Number': `${ref}-PMT`, 'Account': '1000 - Bank', 'Debit': inv.amount_paid.toFixed(2), 'Credit': '', 'Memo': `Payment received — ${ref}`, 'Customer:Job': `${client}:${project}`, 'Type': 'Payment' });
        rows.push({ 'Date': pDate, 'Ref Number': `${ref}-PMT`, 'Account': '1100 - Accounts Receivable', 'Debit': '', 'Credit': inv.amount_paid.toFixed(2), 'Memo': `Payment applied — ${ref}`, 'Customer:Job': `${client}:${project}`, 'Type': 'Payment' });
      }
    });
    exportFile([{ name: 'Journal Entries', data: rows }], `Journal_Entries_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  function exportARSummary() {
    const rows = invoices.filter(i => i.status !== 'paid').map(inv => {
      const days = inv.due_date ? Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000) : 0;
      return { 'Invoice #': inv.invoice_number, 'Client': inv.clients ? `${inv.clients.first_name} ${inv.clients.last_name}` : '—', 'Project': inv.projects?.name ?? '—', 'Total': inv.total.toFixed(2), 'Paid': inv.amount_paid.toFixed(2), 'Outstanding': (inv.total - inv.amount_paid).toFixed(2), 'Due Date': inv.due_date ?? '—', 'Days Overdue': Math.max(0, days), 'Status': inv.status };
    });
    exportFile([{ name: 'AR Summary', data: rows }], `AR_Summary_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  function exportSignedQuotes() {
    const rows = quotes.map(q => ({ 'Quote #': q.quote_number, 'Client': q.clients ? `${q.clients.first_name} ${q.clients.last_name}` : '—', 'Title': q.title, 'Type': q.type, 'Trade': q.trade ?? '—', 'Subtotal': q.subtotal?.toFixed(2) ?? '0.00', 'HST': q.tax_amount?.toFixed(2) ?? '0.00', 'Total': q.total?.toFixed(2) ?? '0.00', 'Signed Date': q.signed_at ? new Date(q.signed_at).toLocaleDateString('en-CA') : '—', 'Status': q.status, 'Account Code': coa.find(c => c.forge_trade === q.trade)?.account_code ?? '4000' }));
    exportFile([{ name: 'Signed Quotes', data: rows }], `Signed_Quotes_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  function exportFullReconciliation() {
    exportFile([
      { name: 'Invoices',      data: invoices.map(i => ({ 'Ref': i.invoice_number, 'Client': i.clients ? `${i.clients.first_name} ${i.clients.last_name}` : '—', 'Project': i.projects?.name ?? '—', 'Date': new Date(i.created_at).toLocaleDateString('en-CA'), 'Subtotal': i.subtotal?.toFixed(2), 'HST': i.tax_amount?.toFixed(2), 'Total': i.total?.toFixed(2), 'Paid': i.amount_paid?.toFixed(2), 'Outstanding': (i.total - i.amount_paid).toFixed(2), 'Status': i.status })) },
      { name: 'Signed Quotes', data: quotes.map(q => ({ 'Ref': q.quote_number, 'Client': q.clients ? `${q.clients.first_name} ${q.clients.last_name}` : '—', 'Project': q.title, 'Date': q.signed_at ? new Date(q.signed_at).toLocaleDateString('en-CA') : '—', 'Total': q.total?.toFixed(2), 'Status': q.status })) },
      { name: 'Team Rates',    data: employees.map(e => ({ 'ID': e.employee_id, 'Name': `${e.first_name} ${e.last_name}`, 'Trade': e.trade_tag, 'GIFI': e.gifi_code, 'Base Rate': e.base_rate?.toFixed(2), 'Burden %': e.burden_pct, 'Burdened Rate': (e.base_rate * (1 + (e.burden_pct ?? 20) / 100)).toFixed(2), 'Vac %': e.vacation_pct, 'HSA/mo': e.hsa_monthly, 'RRSP %': e.rrsp_match_pct, 'Tool Allow': e.tool_allowance })) },
      { name: 'COA Mapping',   data: coa.map(c => ({ 'Forge Trade': c.forge_trade, 'Account Code': c.account_code, 'Account Name': c.account_name })) },
    ], `Full_Reconciliation_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Loading...</div>;

  const totalInvoiced  = invoices.reduce((s, i) => s + i.total, 0);
  const totalCollected = invoices.reduce((s, i) => s + i.amount_paid, 0);
  const totalSigned    = quotes.reduce((s, q) => s + (q.total ?? 0), 0);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Invoiced',   value: `$${totalInvoiced.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`,                    color: '#1E5FA4' },
          { label: 'Collected',        value: `$${totalCollected.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`,                   color: '#16A34A' },
          { label: 'Outstanding',      value: `$${(totalInvoiced - totalCollected).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, color: '#DC2626' },
          { label: 'Signed Contracts', value: `$${totalSigned.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`,                      color: '#8A7600' },
        ].map(stat => (
          <div key={stat.label} style={{ padding: '14px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 5 }}>{stat.label}</p>
            <p style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-mono)', color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="forge-card" style={{ padding: '20px', marginBottom: 24 }}>
        <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Export for Bookkeeper</p>
        <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 16, lineHeight: 1.6 }}>Clean XLSX files ready for QuickBooks, Sage, or any accounting software import.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Journal Entries',        sub: 'Double-entry: AR, Revenue, HST, Bank',    fn: exportJournalEntries,    color: '#1E5FA4' },
            { label: 'AR Aging Summary',       sub: 'All outstanding invoices by client',       fn: exportARSummary,         color: '#DC2626' },
            { label: 'Signed Quotes Register', sub: 'Revenue recognized from signed contracts', fn: exportSignedQuotes,      color: '#16A34A' },
            { label: 'Full Reconciliation',    sub: 'All-in-one: invoices, quotes, team, COA', fn: exportFullReconciliation, color: '#8A7600' },
          ].map(btn => (
            <button key={btn.label} onClick={btn.fn} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, background: `${btn.color}08`, border: `1px solid ${btn.color}22`, cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left', transition: 'all 0.12s' }} onMouseEnter={e => { e.currentTarget.style.background = `${btn.color}14`; }} onMouseLeave={e => { e.currentTarget.style.background = `${btn.color}08`; }}>
              <Download size={16} color={btn.color} strokeWidth={1.5} style={{ flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: btn.color, marginBottom: 2 }}>{btn.label}</p>
                <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{btn.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="forge-card">
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>Chart of Accounts Mapping</p>
          <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>Map Forge trades to your QuickBooks COA. Used in all exports.</p>
        </div>
        <table className="forge-table">
          <thead><tr><th>Forge Trade</th><th>Account Code</th><th>Account Name</th></tr></thead>
          <tbody>
            {coa.map(c => (
              <tr key={c.id}>
                <td style={{ fontSize: 12, fontWeight: 600 }}>{c.forge_trade}</td>
                <td><input style={{ width: 80, height: 28, padding: '0 6px', borderRadius: 5, border: '1px solid transparent', background: 'transparent', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text)', outline: 'none' }} value={c.account_code} onChange={e => updateCoa(c.id, 'account_code', e.target.value)} onFocus={e => { e.currentTarget.style.borderColor = '#FCE205'; e.currentTarget.style.background = 'var(--color-panel)'; }} onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }} /></td>
                <td><input style={{ width: '100%', height: 28, padding: '0 6px', borderRadius: 5, border: '1px solid transparent', background: 'transparent', fontSize: 11, color: 'var(--color-text)', fontFamily: 'var(--font-body)', outline: 'none' }} value={c.account_name} onChange={e => updateCoa(c.id, 'account_name', e.target.value)} onFocus={e => { e.currentTarget.style.borderColor = '#FCE205'; e.currentTarget.style.background = 'var(--color-panel)'; }} onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── FEATURES TAB ── */
function FeaturesTab() {
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from('company_settings').select('settings').eq('company_id', COMPANY_ID).single();
    if (data?.settings?.features) setFeatures(data.settings.features);
  }
  async function save() {
    setSaving(true);
    const { data } = await supabase.from('company_settings').select('settings').eq('company_id', COMPANY_ID).single();
    const updated = { ...(data?.settings ?? {}), features };
    await supabase.from('company_settings').upsert({ company_id: COMPANY_ID, settings: updated });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  const FEATURE_LIST = [
    { key: 'forge_mail',      label: 'Forge Mail',      sub: '3-pane email client with CRM linking'  },
    { key: 'quick_create',    label: 'Quick Create',    sub: '5-step guided estimate wizard'         },
    { key: 'digital_signing', label: 'Digital Signing', sub: 'Client e-signature on quotes'          },
    { key: 'ask_the_code',    label: 'Ask The Code',    sub: 'OBC 2024 AI search'                    },
    { key: 'forge_ai',        label: 'Forge Assistant', sub: 'CRM AI powered by live data'           },
    { key: 'reports',         label: 'Reports',         sub: 'Revenue, WIP, AR Aging, Allowances'    },
    { key: 'defense_vault',   label: 'Defense Vault',   sub: 'Court-ready documentation package'     },
    { key: 'dispatch',        label: 'Dispatch Board',  sub: 'Real-time crew scheduling'             },
  ];

  return (
    <div className="forge-card" style={{ padding: '24px' }}>
      <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Feature Flags</p>
      <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 20 }}>Enable or disable modules for your team.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {FEATURE_LIST.map(f => {
          const enabled = features[f.key] ?? true;
          return (
            <div key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 9, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{f.label}</p>
                <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{f.sub}</p>
              </div>
              <button onClick={() => setFeatures(prev => ({ ...prev, [f.key]: !enabled }))} style={{ width: 44, height: 24, borderRadius: 100, background: enabled ? '#FCE205' : 'var(--color-border)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'all 0.2s', flexShrink: 0 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#FFFFFF', position: 'absolute', top: 3, left: enabled ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </button>
            </div>
          );
        })}
      </div>
      <button onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: saved ? '#16A34A' : '#FCE205', border: 'none', color: saved ? '#FFFFFF' : '#111010', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
        {saved ? <><Check size={14} /> Saved!</> : saving ? 'Saving...' : 'Save Features'}
      </button>
    </div>
  );
}

/* ── BRANDING TAB ── */
function BrandingTab() {
  const [settings, setSettings]     = useState<any>({});
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted]   = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from('company_settings').select('settings').eq('company_id', COMPANY_ID).single();
    if (data?.settings) setSettings(data.settings);
  }
  async function save() {
    setSaving(true);
    await supabase.from('company_settings').upsert({ company_id: COMPANY_ID, settings });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }
  function set(key: string, val: string) { setSettings((prev: any) => ({ ...prev, [key]: val })); }

  function extractColorsFromLogo() {
    const logoUrl = settings.logo_url;
    if (!logoUrl) return;
    setExtracting(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d')!;
      canvas.width = 80; canvas.height = 80;
      ctx.drawImage(img, 0, 0, 80, 80);
      const data = ctx.getImageData(0, 0, 80, 80).data;
      const buckets: Record<string, number> = {};
      for (let i = 0; i < data.length; i += 16) {
        const r = Math.round(data[i] / 32) * 32;
        const g = Math.round(data[i + 1] / 32) * 32;
        const b = Math.round(data[i + 2] / 32) * 32;
        const a = data[i + 3];
        if (a < 128) continue;
        if (r > 230 && g > 230 && b > 230) continue;
        if (r < 25  && g < 25  && b < 25)  continue;
        const key = `${r},${g},${b}`;
        buckets[key] = (buckets[key] ?? 0) + 1;
      }
      const sorted = Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key]) => {
        const [r, g, b] = key.split(',').map(Number);
        return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
      });
      setExtracted(sorted); setExtracting(false);
    };
    img.onerror = () => setExtracting(false);
    img.src = logoUrl;
  }

  const primary = settings.brand_primary ?? '#FCE205';
  const dark    = settings.brand_dark    ?? '#111010';
  const accent  = settings.brand_accent  ?? '#1E5FA4';

  const PRESETS = [
    { name: 'Classic Yellow', primary: '#FCE205', dark: '#111010', accent: '#1E5FA4' },
    { name: 'Deep Navy',      primary: '#1E3A5F', dark: '#FFFFFF', accent: '#3B82F6' },
    { name: 'Forest',         primary: '#166534', dark: '#111010', accent: '#22C55E' },
    { name: 'Slate',          primary: '#475569', dark: '#0F172A', accent: '#64748B' },
    { name: 'Crimson',        primary: '#991B1B', dark: '#111010', accent: '#DC2626' },
    { name: 'Charcoal',       primary: '#374151', dark: '#111827', accent: '#9CA3AF' },
    { name: 'Warm Amber',     primary: '#D97706', dark: '#111010', accent: '#F59E0B' },
    { name: 'Ocean',          primary: '#0369A1', dark: '#111010', accent: '#0EA5E9' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="forge-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(252,226,5,0.15)', border: '1px solid rgba(252,226,5,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: '#8A7600', flexShrink: 0 }}>1</div>
          <p style={{ fontSize: 14, fontWeight: 700 }}>Upload Your Logo</p>
        </div>
        <FileUpload bucket="company-assets" path={`logos/${COMPANY_ID}`} label="Company Logo" accept="image/png,image/jpeg,image/svg+xml,image/webp" currentUrl={settings.logo_url} isPublic={true} onUploaded={url => set('logo_url', url)} />
        {settings.logo_url && (
          <button onClick={extractColorsFromLogo} disabled={extracting} style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(30,95,164,0.08)', border: '1px solid rgba(30,95,164,0.2)', color: '#1E5FA4', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            <Palette size={14} strokeWidth={1.5} />
            {extracting ? 'Reading colors...' : '✨ Extract Colors from Logo'}
          </button>
        )}
        {extracted.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-muted)', marginBottom: 8 }}>Colors found in your logo — click to apply</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {extracted.map(color => (
                <div key={color} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <button title={color} style={{ width: 40, height: 40, borderRadius: 10, background: color, border: '2px solid var(--color-border)', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }} onClick={() => set('brand_primary', color)} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button onClick={() => set('brand_primary', color)} style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, border: '1px solid var(--color-border)', background: primary === color ? '#FCE205' : 'var(--color-mist)', color: primary === color ? '#111010' : 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Primary</button>
                    <button onClick={() => set('brand_dark', color)} style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, border: '1px solid var(--color-border)', background: dark === color ? '#FCE205' : 'var(--color-mist)', color: dark === color ? '#111010' : 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Dark</button>
                    <button onClick={() => set('brand_accent', color)} style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, border: '1px solid var(--color-border)', background: accent === color ? '#FCE205' : 'var(--color-mist)', color: accent === color ? '#111010' : 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Accent</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="forge-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(252,226,5,0.15)', border: '1px solid rgba(252,226,5,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: '#8A7600', flexShrink: 0 }}>2</div>
          <p style={{ fontSize: 14, fontWeight: 700 }}>Set Your Brand Colors</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
          {[
            { key: 'brand_primary', label: 'Primary', value: primary, sub: 'Letterhead border, total line, buttons, footer strip' },
            { key: 'brand_dark',    label: 'Dark',    value: dark,    sub: 'Company name, totals, signature lines, headings'      },
            { key: 'brand_accent',  label: 'Accent',  value: accent,  sub: 'Allowance tags, disclaimer boxes, links'              },
          ].map(c => (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderRadius: 10, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 56, height: 56, borderRadius: 12, background: c.value, boxShadow: '0 3px 12px rgba(0,0,0,0.15)', border: '3px solid var(--color-panel)' }} />
                <input type="color" value={c.value} onChange={e => set(c.key, e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', borderRadius: 12 }} />
                <div style={{ position: 'absolute', bottom: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: 'var(--color-panel)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <Palette size={9} color="var(--color-muted)" />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{c.label} Color</p>
                <p style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.5 }}>{c.sub}</p>
              </div>
              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                <p style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)', textTransform: 'uppercase' }}>{c.value}</p>
                <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>Click swatch to change</p>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={lbl}>Start from a preset</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRESETS.map(preset => (
              <button key={preset.name} onClick={() => { set('brand_primary', preset.primary); set('brand_dark', preset.dark); set('brand_accent', preset.accent); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-panel)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-text)' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#FCE205'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}>
                <div style={{ display: 'flex', gap: 3 }}>
                  <div style={{ width: 14, height: 14, borderRadius: 4, background: preset.primary, border: '1px solid rgba(0,0,0,0.1)' }} />
                  <div style={{ width: 14, height: 14, borderRadius: 4, background: preset.dark,    border: '1px solid rgba(0,0,0,0.1)' }} />
                  <div style={{ width: 14, height: 14, borderRadius: 4, background: preset.accent,  border: '1px solid rgba(0,0,0,0.1)' }} />
                </div>
                {preset.name}
              </button>
            ))}
          </div>
        </div>
        <button onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: saved ? '#16A34A' : '#FCE205', border: 'none', color: saved ? '#FFFFFF' : '#111010', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          {saved ? <><Check size={14} /> Brand Saved!</> : saving ? 'Saving...' : 'Save Brand Colors'}
        </button>
      </div>

      <div className="forge-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(252,226,5,0.15)', border: '1px solid rgba(252,226,5,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: '#8A7600', flexShrink: 0 }}>3</div>
          <p style={{ fontSize: 14, fontWeight: 700 }}>Live Document Preview</p>
        </div>
        <div style={{ background: '#F0EDE8', borderRadius: 10, padding: 16 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 8, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.10)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px 16px', borderBottom: `3px solid ${primary}` }}>
              <div>
                {settings.logo_url ? (
                  <img src={settings.logo_url} alt="Logo" style={{ height: 40, marginBottom: 8, objectFit: 'contain', borderRadius: 4 }} onError={e => { e.currentTarget.style.display = 'none'; }} />
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: 9, background: primary, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 900, color: dark }}>{(settings.name ?? 'C').charAt(0)}</span>
                  </div>
                )}
                <p style={{ fontSize: 13, fontWeight: 800, color: dark }}>{settings.name || 'Your Company Name'}</p>
                <p style={{ fontSize: 11, color: '#6B7280' }}>{settings.email || 'info@yourcompany.com'}</p>
                <p style={{ fontSize: 11, color: '#6B7280' }}>HST# {settings.hst || '000000000 RT0001'}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 16, fontWeight: 900, color: dark, letterSpacing: '0.04em' }}>INVOICE</p>
                <p style={{ fontSize: 11, color: '#8C8680', fontFamily: 'monospace' }}>INV-00142</p>
                <p style={{ fontSize: 11, color: '#8C8680', marginTop: 6 }}>{new Date().toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
            <div style={{ padding: '16px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F0EDE8' }}>
                <span style={{ fontSize: 12, color: '#111010' }}>Kitchen Renovation — Labour</span>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>$12,500.00</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F0EDE8' }}>
                <span style={{ fontSize: 12, color: '#111010' }}>Materials Allowance</span>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>$8,000.00</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, marginTop: 4, borderTop: `2px solid ${primary}` }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: dark }}>Total Due</span>
                <span style={{ fontSize: 14, fontWeight: 900, fontFamily: 'monospace', color: dark }}>$23,165.00</span>
              </div>
            </div>
            <div style={{ margin: '0 24px 16px', padding: '10px 14px', borderRadius: 8, background: `${accent}10`, border: `1px solid ${accent}25` }}>
              <p style={{ fontSize: 10, color: accent, fontStyle: 'italic' }}><strong>Note:</strong> Allowance items are estimates. Final costs adjusted on actuals.</p>
            </div>
            <div style={{ padding: '10px 24px', background: primary, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: dark }}>{settings.name || 'Your Company'}</p>
              <p style={{ fontSize: 10, color: dark, opacity: 0.75 }}>Thank you for your business</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── WARRANTY SETTINGS TAB ── */
function WarrantySettingsTab() {
  const [settings, setSettings] = useState<any>({});
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from('company_settings').select('settings').eq('company_id', COMPANY_ID).single();
    if (data?.settings) setSettings(data.settings);
  }
  async function save() {
    setSaving(true);
    await supabase.from('company_settings').upsert({ company_id: COMPANY_ID, settings });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }
  function set(key: string, val: any) { setSettings((p: any) => ({ ...p, [key]: val })); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="forge-card" style={{ padding: '24px' }}>
        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>Tarion Builder Profile</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {[
            { key: 'tarion_builder_id',  label: 'Tarion Builder ID',     placeholder: 'B35002'               },
            { key: 'hcra_number',        label: 'HCRA Registration #',   placeholder: 'HR-00123'             },
            { key: 'builder_legal_name', label: 'Legal Builder Name',    placeholder: 'Claridge Homes Ltd.'  },
            { key: 'warranty_contact',   label: 'Warranty Contact Name', placeholder: 'Jane Smith'           },
            { key: 'warranty_email',     label: 'Warranty Contact Email',placeholder: 'warranty@builder.ca'  },
            { key: 'warranty_phone',     label: 'Warranty Contact Phone',placeholder: '613-555-0100'         },
          ].map(f => (
            <div key={f.key}>
              <label style={lbl}>{f.label}</label>
              <input style={inp} placeholder={f.placeholder} value={settings[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} onFocus={focus} onBlur={blur} />
            </div>
          ))}
        </div>
        <button onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: saved ? '#16A34A' : '#FCE205', border: 'none', color: saved ? '#FFFFFF' : '#111010', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          {saved ? <><Check size={14} /> Saved!</> : saving ? 'Saving...' : 'Save Warranty Settings'}
        </button>
      </div>

      <div className="forge-card" style={{ padding: '24px' }}>
        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>BuilderLink Sync</p>
        <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 20, lineHeight: 1.6 }}>Configure automatic syncing of warranty lists from BuilderLink via the Tarion VBI API.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={lbl}>Auto-Sync Schedule</label>
            <select style={inp} value={settings.sync_schedule ?? 'daily_6am'} onChange={e => set('sync_schedule', e.target.value)} onFocus={focus} onBlur={blur}>
              <option value="manual">Manual Only</option>
              <option value="daily_6am">Daily at 6:00 AM</option>
              <option value="daily_8am">Daily at 8:00 AM</option>
              <option value="twice_daily">Twice Daily (6am + 6pm)</option>
            </select>
          </div>
          <div>
            <label style={lbl}>BRP Alert — Warn At</label>
            <select style={inp} value={settings.brp_warn_days ?? 14} onChange={e => set('brp_warn_days', Number(e.target.value))} onFocus={focus} onBlur={blur}>
              <option value={30}>30 days before expiry</option>
              <option value={21}>21 days before expiry</option>
              <option value={14}>14 days before expiry</option>
              <option value={7}>7 days before expiry</option>
            </select>
          </div>
        </div>
        <div style={{ padding: '12px 16px', borderRadius: 9, background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16A34A', boxShadow: '0 0 6px rgba(22,163,74,0.7)' }} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#16A34A' }}>Last synced: Today 6:00 AM</p>
              <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>3 new forms pulled · 0 unmatched</p>
            </div>
          </div>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.25)', color: '#16A34A', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            <RefreshCw size={11} /> Sync Now
          </button>
        </div>
      </div>

      <div className="forge-card" style={{ padding: '24px' }}>
        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Notification Preferences</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { key: 'notify_new_list',     label: 'New warranty list received from Tarion',  sub: 'Immediate notification when homeowner submits a form'             },
            { key: 'notify_brp_expiry',   label: 'BRP expiry warnings',                     sub: 'Alert coordinator when BRP is within your warning window'        },
            { key: 'notify_car_issued',   label: 'CAR report issued',                       sub: 'Alert when Tarion issues a Conciliation Assessment Report'       },
            { key: 'notify_msd_deadline', label: 'MSD agreement deadline approaching',      sub: 'Alert 3 days before 10-day MSD agreement window closes'         },
            { key: 'notify_low_evidence', label: 'Low evidence score alert',                sub: 'Flag cases where evidence health drops below 60%'               },
            { key: 'notify_po_submitted', label: 'Tech submits PO request',                 sub: 'Alert manager immediately when a tech submits a trade PO'       },
          ].map(f => {
            const enabled = settings[f.key] ?? true;
            return (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 9, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{f.label}</p>
                  <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{f.sub}</p>
                </div>
                <button onClick={() => set(f.key, !enabled)} style={{ width: 44, height: 24, borderRadius: 100, background: enabled ? '#FCE205' : 'var(--color-border)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'all 0.2s', flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#FFFFFF', position: 'absolute', top: 3, left: enabled ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </button>
              </div>
            );
          })}
        </div>
        <button onClick={save} disabled={saving} style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: saved ? '#16A34A' : '#FCE205', border: 'none', color: saved ? '#FFFFFF' : '#111010', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          {saved ? <><Check size={14} /> Saved!</> : saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}

/* ── EMAIL CONNECTIONS TAB ── */
function EmailConnectionsTab() {
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [testing, setTesting]         = useState<string | null>(null);

  useEffect(() => { loadConnections(); }, []);
  async function loadConnections() {
    const { data } = await supabase.from('email_connections').select('*').eq('company_id', COMPANY_ID).order('created_at', { ascending: false });
    if (data) setConnections(data);
    setLoading(false);
  }
  async function disconnect(id: string) {
    await supabase.from('email_connections').update({ is_active: false }).eq('id', id);
    loadConnections();
  }

  const PROVIDERS = [
    {
      id: 'outlook', label: 'Microsoft Outlook / 365', sub: 'Connect via Microsoft OAuth — emails log automatically to cases',
      color: '#0078D4', icon: '⊞',
      steps: ['Admin registers Combryx as an Azure AD app', 'Grant Mail.Read + Mail.Send permissions', 'Each user connects their own Outlook account', 'Emails with lot/case references auto-log to interactions'],
    },
    {
      id: 'gmail', label: 'Google Gmail / Workspace', sub: 'Connect via Google OAuth — emails log automatically to cases',
      color: '#EA4335', icon: 'G',
      steps: ['Admin enables Gmail API in Google Cloud Console', 'Each user connects their own Gmail account', 'Install Combryx Gmail Add-on from Google Workspace Marketplace', 'Use "Log to Case" button directly inside Gmail'],
    },
  ];

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Loading...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ padding: '16px 18px', borderRadius: 10, background: 'rgba(30,95,164,0.05)', border: '1px solid rgba(30,95,164,0.2)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#1E5FA4', marginBottom: 8 }}>How Email Integration Works</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            { step: '1', label: 'Connect Email',    desc: 'Each coordinator connects their Outlook or Gmail account via OAuth'                        },
            { step: '2', label: 'Email Arrives',    desc: 'Homeowner or trade sends an email to your warranty address'                               },
            { step: '3', label: 'Auto-Log to Case', desc: 'System matches enrollment number or lot number and logs to the case timeline'             },
          ].map(s => (
            <div key={s.step} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(30,95,164,0.15)', border: '1px solid rgba(30,95,164,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: '#1E5FA4', flexShrink: 0 }}>{s.step}</div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text)', marginBottom: 2 }}>{s.label}</p>
                <p style={{ fontSize: 10, color: 'var(--color-muted)', lineHeight: 1.5 }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {connections.filter(c => c.is_active).length > 0 && (
        <div className="forge-card" style={{ padding: '20px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Connected Accounts</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {connections.filter(c => c.is_active).map(conn => (
              <div key={conn.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 9, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: conn.provider === 'gmail' ? 'rgba(234,67,53,0.10)' : 'rgba(0,120,212,0.10)', border: `1px solid ${conn.provider === 'gmail' ? 'rgba(234,67,53,0.2)' : 'rgba(0,120,212,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: conn.provider === 'gmail' ? '#EA4335' : '#0078D4', flexShrink: 0 }}>
                  {conn.provider === 'gmail' ? 'G' : '⊞'}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 12, fontWeight: 700 }}>{conn.display_name ?? conn.email_address}</p>
                  <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{conn.email_address} · {conn.provider === 'gmail' ? 'Gmail' : 'Outlook'}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#16A34A' }} />
                  <span style={{ fontSize: 10, color: '#16A34A', fontWeight: 600 }}>Connected</span>
                </div>
                <button onClick={() => setTesting(conn.id)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: 'var(--color-panel)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  {testing === conn.id ? 'Testing...' : 'Test'}
                </button>
                <button onClick={() => disconnect(conn.id)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', color: '#DC2626', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Disconnect</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {PROVIDERS.map(p => (
          <div key={p.id} className="forge-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: `${p.color}12`, border: `1px solid ${p.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, color: p.color }}>{p.icon}</div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700 }}>{p.label}</p>
                <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{p.sub}</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {p.steps.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: `${p.color}12`, border: `1px solid ${p.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: p.color, flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                  <p style={{ fontSize: 10, color: 'var(--color-muted)', lineHeight: 1.5 }}>{step}</p>
                </div>
              ))}
            </div>
            <button style={{ width: '100%', padding: '10px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: `${p.color}10`, border: `1px solid ${p.color}30`, color: p.color, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }} onMouseEnter={e => e.currentTarget.style.background = `${p.color}18`} onMouseLeave={e => e.currentTarget.style.background = `${p.color}10`} onClick={() => alert(`OAuth flow for ${p.label} — configure your Azure AD or Google Cloud app credentials first in the Supabase secrets.`)}>
              <Mail size={13} /> Connect {p.id === 'gmail' ? 'Gmail' : 'Outlook'}
            </button>
          </div>
        ))}
      </div>

      <div className="forge-card" style={{ padding: '20px' }}>
        <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>BuilderLink VBI API Credentials</p>
        <p style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          Create a user with role <code style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>EXTERNAL_VB_API_ONLY</code> in BuilderLink and enter the credentials below.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
          {[
            { key: 'vbi_builder_id', label: 'Builder ID',   placeholder: 'B35002'          },
            { key: 'vbi_api_user',   label: 'API Username', placeholder: 'api_user@builder' },
            { key: 'vbi_api_key',    label: 'API Key',      placeholder: '••••••••••••'    },
          ].map(f => (
            <div key={f.key}>
              <label style={lbl}>{f.label}</label>
              <input style={{ ...inp, fontFamily: f.key === 'vbi_api_key' ? 'var(--font-mono)' : 'var(--font-body)' }} type={f.key === 'vbi_api_key' ? 'password' : 'text'} placeholder={f.placeholder} onFocus={focus} onBlur={blur} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{ padding: '8px 18px', borderRadius: 7, fontSize: 12, fontWeight: 700, background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.25)', color: '#16A34A', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Test Connection</button>
          <button style={{ padding: '8px 18px', borderRadius: 7, fontSize: 12, fontWeight: 700, background: '#FCE205', border: 'none', color: '#111010', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Save Credentials</button>
        </div>
      </div>
    </div>
  );
}


const WARRANTY_COMPANY_ID = 'c8bd8b99-090d-4379-86cd-95c3844c09f9';

interface WUser {
  id: string; first_name: string; last_name: string;
  email: string; phone: string | null; access_level: string; is_active: boolean;
}
interface WTechProfile {
  id: string; user_id: string; tech_type: string;
  supervisor_id: string | null; team: string | null;
  can_do_interior: boolean; can_do_exterior: boolean;
  can_do_pdi: boolean; can_do_emergency: boolean; notes: string | null;
}
interface WUserCommunity {
  id: string; user_id: string; community_id: string; is_primary: boolean;
}
interface WCommunity { id: string; name: string; }

export function WarrantyTeamTab() {
  const [users,          setUsers]          = useState<WUser[]>([]);
  const [techProfiles,   setTechProfiles]   = useState<Record<string, WTechProfile>>({});
  const [userCommunities,setUserCommunities]= useState<Record<string, WUserCommunity[]>>({});
  const [communities,    setCommunities]    = useState<WCommunity[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState<string | null>(null);
  const [expandedUser,   setExpandedUser]   = useState<string | null>(null);
  const [activeView,     setActiveView]     = useState<'team'|'sites'>('team');
  const [toast,          setToast]          = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [uRes, cRes, tRes, ucRes] = await Promise.all([
      supabase.from('users').select('id,first_name,last_name,email,phone,access_level,is_active').eq('company_id', WARRANTY_COMPANY_ID).eq('is_active', true).order('first_name'),
      supabase.from('warranty_communities').select('id,name').eq('company_id', WARRANTY_COMPANY_ID).order('name'),
      supabase.from('tech_profiles').select('*').eq('company_id', WARRANTY_COMPANY_ID),
      supabase.from('user_communities').select('*'),
    ]);
    if (uRes.data)  setUsers(uRes.data as WUser[]);
    if (cRes.data)  setCommunities(cRes.data as WCommunity[]);
    if (tRes.data)  { const m: Record<string,WTechProfile> = {}; (tRes.data as WTechProfile[]).forEach(t => m[t.user_id]=t); setTechProfiles(m); }
    if (ucRes.data) { const m: Record<string,WUserCommunity[]> = {}; (ucRes.data as WUserCommunity[]).forEach(uc => { if (!m[uc.user_id]) m[uc.user_id]=[]; m[uc.user_id].push(uc); }); setUserCommunities(m); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2200); }

  async function saveRole(userId: string, level: string) {
    setSaving(userId+'_role');
    await supabase.from('users').update({ access_level: level }).eq('id', userId);
    await fetchAll(); setSaving(null); showToast('Role saved');
  }

  async function saveTech(userId: string, updates: Partial<WTechProfile>) {
    setSaving(userId+'_tech');
    const existing = techProfiles[userId];
    if (existing) await supabase.from('tech_profiles').update({ ...updates, updated_at: new Date().toISOString() }).eq('user_id', userId);
    else await supabase.from('tech_profiles').insert({ user_id: userId, company_id: WARRANTY_COMPANY_ID, tech_type: 'regular', ...updates });
    await fetchAll(); setSaving(null); showToast('Saved');
  }

  async function toggleSite(userId: string, communityId: string) {
    setSaving(userId+'_site_'+communityId);
    const existing = (userCommunities[userId]??[]).find(uc => uc.community_id===communityId);
    if (existing) await supabase.from('user_communities').delete().eq('id', existing.id);
    else { const sites = userCommunities[userId]??[]; await supabase.from('user_communities').insert({ user_id: userId, community_id: communityId, is_primary: sites.length===0 }); }
    await fetchAll(); setSaving(null);
  }

  async function setPrimary(userId: string, communityId: string) {
    const sites = userCommunities[userId]??[];
    for (const uc of sites) await supabase.from('user_communities').update({ is_primary: uc.community_id===communityId }).eq('id', uc.id);
    await fetchAll(); showToast('Primary site set');
  }

  const supervisors = users.filter(u => ['supervisor','manager','sr_manager','director'].includes(u.access_level));

  const ROLE_OPTIONS = [
    { value: 'coordinator', label: '📋 Coordinator' },
    { value: 'supervisor',  label: '🔍 Supervisor'  },
    { value: 'tech',        label: '🔧 Tech'        },
    { value: 'manager',     label: '👔 Manager'     },
    { value: 'staff',       label: '👤 Staff'       },
  ];

  const CAPS = [
    { key: 'can_do_interior',  label: 'Interior repairs' },
    { key: 'can_do_exterior',  label: 'Exterior'         },
    { key: 'can_do_pdi',       label: 'PDI'              },
    { key: 'can_do_emergency', label: 'Emergency'        },
  ];

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Loading warranty team…</div>;

  return (
    <div style={{ position: 'relative' }}>

      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 24, padding: '10px 18px', borderRadius: 8, background: '#16A34A', color: '#fff', fontSize: 12, fontWeight: 700, zIndex: 1000, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          ✓ {toast}
        </div>
      )}

      {/* Sub-nav */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {(['team','sites'] as const).map(v => (
          <button key={v} onClick={() => setActiveView(v)}
            style={{ padding: '7px 16px', borderRadius: 7, border: `1px solid ${activeView===v ? 'rgba(252,226,5,0.3)' : 'var(--color-border)'}`, background: activeView===v ? 'rgba(252,226,5,0.08)' : 'transparent', color: activeView===v ? '#8A7600' : 'var(--color-muted)', fontSize: 12, fontWeight: activeView===v ? 700 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', textTransform: 'capitalize' as const }}>
            {v === 'team' ? `Team (${users.length})` : `Sites (${communities.length})`}
          </button>
        ))}
        <button onClick={fetchAll} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 7, background: 'transparent', border: '1px solid var(--color-border)', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 11, fontFamily: 'var(--font-body)' }}>
          ↺ Refresh
        </button>
      </div>

      {/* ── TEAM VIEW ── */}
      {activeView === 'team' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {users.map(user => {
            const tech  = techProfiles[user.id];
            const sites = userCommunities[user.id] ?? [];
            const isExp = expandedUser === user.id;

            return (
              <div key={user.id} style={{ borderRadius: 10, overflow: 'hidden', background: 'var(--color-panel)', border: `1px solid ${isExp ? 'rgba(252,226,5,0.3)' : 'var(--color-border)'}`, transition: 'all 0.15s' }}>

                {/* Row */}
                <div onClick={() => setExpandedUser(isExp ? null : user.id)} style={{ padding: '13px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(252,226,5,0.12)', border: '1px solid rgba(252,226,5,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 800, color: '#8A7600' }}>
                    {user.first_name[0]}{user.last_name[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{user.first_name} {user.last_name}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: 'rgba(252,226,5,0.12)', border: '1px solid rgba(252,226,5,0.25)', color: '#8A7600' }}>{user.access_level}</span>
                      {tech?.tech_type && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: tech.tech_type==='foreman' ? 'rgba(220,38,38,0.10)' : 'rgba(217,119,6,0.10)', color: tech.tech_type==='foreman' ? '#DC2626' : '#D97706', border: `1px solid ${tech.tech_type==='foreman' ? 'rgba(220,38,38,0.2)' : 'rgba(217,119,6,0.2)'}` }}>
                          {tech.tech_type==='foreman' ? 'Foreman' : 'Regular tech'}
                        </span>
                      )}
                      {tech?.team && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: 'rgba(22,163,74,0.10)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.2)' }}>
                          {tech.team === 'warranty' ? 'Warranty' : 'Construction'}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{user.email}</span>
                      {sites.length > 0 && (
                        <span style={{ fontSize: 10, color: '#1E5FA4', fontWeight: 600 }}>
                          {sites.length} site{sites.length!==1?'s':''}{(() => { const primary = sites.find(s=>s.is_primary); if (!primary) return ''; const comm = communities.find(c=>c.id===primary.community_id); return comm ? ` · ★ ${comm.name}` : ''; })()}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--color-muted)', transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▾</span>
                </div>

                {/* Expanded */}
                {isExp && (
                  <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-mist)', padding: 18 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>

                      {/* Role */}
                      <div>
                        <label style={lbl}>Role</label>
                        <select defaultValue={user.access_level} onBlur={async e => { if (e.target.value !== user.access_level) await saveRole(user.id, e.target.value); }} style={inp} onFocus={focus}>
                          {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </div>

                      {/* Tech type */}
                      <div>
                        <label style={lbl}>Tech type</label>
                        <select defaultValue={tech?.tech_type ?? ''} onChange={async e => saveTech(user.id, { tech_type: e.target.value })} style={inp} onFocus={focus} onBlur={blur}>
                          <option value="">— Not a tech —</option>
                          <option value="regular">Regular tech — interior repairs</option>
                          <option value="foreman">Foreman — PDI, QA, emergency, exterior</option>
                        </select>
                        {tech?.tech_type === 'foreman' && <p style={{ fontSize: 10, color: '#DC2626', marginTop: 4 }}>Foreman is never scheduled for interior repairs</p>}
                      </div>

                      {/* Team */}
                      <div>
                        <label style={lbl}>Team</label>
                        <select defaultValue={tech?.team ?? ''} onChange={async e => saveTech(user.id, { team: e.target.value || null })} style={inp} onFocus={focus} onBlur={blur}>
                          <option value="">— Not assigned —</option>
                          <option value="warranty">Warranty</option>
                          <option value="construction">Construction</option>
                        </select>
                      </div>

                      {/* Supervisor */}
                      <div>
                        <label style={lbl}>Reports to</label>
                        <select defaultValue={tech?.supervisor_id ?? ''} onChange={async e => saveTech(user.id, { supervisor_id: e.target.value || null })} style={inp} onFocus={focus} onBlur={blur}>
                          <option value="">— No supervisor —</option>
                          {supervisors.filter(s => s.id !== user.id).map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                        </select>
                      </div>

                      {/* Capabilities */}
                      {tech && (
                        <div style={{ gridColumn: '2 / 4' }}>
                          <label style={lbl}>Capabilities</label>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {CAPS.map(cap => {
                              const val = (tech as any)[cap.key] ?? false;
                              return (
                                <button key={cap.key} onClick={() => saveTech(user.id, { [cap.key]: !val })}
                                  style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: val ? 'rgba(22,163,74,0.10)' : 'var(--color-panel)', border: `1px solid ${val ? 'rgba(22,163,74,0.3)' : 'var(--color-border)'}`, color: val ? '#16A34A' : 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                  {val ? '✓ ' : ''}{cap.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Site assignments */}
                    <div style={{ paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
                      <label style={lbl}>Site assignments</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                        {communities.map(comm => {
                          const assigned  = sites.find(s => s.community_id === comm.id);
                          const isPrimary = assigned?.is_primary ?? false;
                          const isSaving  = saving === user.id+'_site_'+comm.id;
                          return (
                            <div key={comm.id} style={{ display: 'flex', alignItems: 'center', gap: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${assigned ? 'rgba(252,226,5,0.4)' : 'var(--color-border)'}` }}>
                              <button onClick={() => toggleSite(user.id, comm.id)} disabled={!!isSaving}
                                style={{ padding: '6px 12px', background: assigned ? 'rgba(252,226,5,0.10)' : 'var(--color-panel)', border: 'none', color: assigned ? '#8A7600' : 'var(--color-muted)', fontSize: 11, fontWeight: assigned ? 700 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                {isSaving ? '…' : (assigned ? '✓ ' : '')}{comm.name}
                              </button>
                              {assigned && (
                                <button onClick={() => setPrimary(user.id, comm.id)} title="Set as primary"
                                  style={{ padding: '6px 8px', background: isPrimary ? '#FCE205' : 'rgba(252,226,5,0.05)', border: 'none', borderLeft: '1px solid rgba(252,226,5,0.25)', color: isPrimary ? '#111010' : '#8A7600', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                  {isPrimary ? '★' : '☆'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>Click to assign/unassign · ★ sets primary site</p>
                    </div>

                    {/* Notes */}
                    <div style={{ marginTop: 14 }}>
                      <label style={lbl}>Notes</label>
                      <textarea defaultValue={tech?.notes ?? ''} onBlur={async e => { blur(e); await saveTech(user.id, { notes: e.target.value.trim() || null }); }} placeholder="Certifications, notes…" rows={2}
                        style={{ ...inp, height: 'auto', padding: '8px 10px', resize: 'none' }} onFocus={focus} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── SITES VIEW ── */}
      {activeView === 'sites' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {communities.map(comm => {
            const assigned    = users.filter(u => (userCommunities[u.id]??[]).some(uc => uc.community_id===comm.id));
            const coordinator = assigned.find(u => u.access_level==='coordinator');
            const supervisor  = assigned.find(u => u.access_level==='supervisor');
            const techs       = assigned.filter(u => techProfiles[u.id]);
            return (
              <div key={comm.id} style={{ padding: '16px 18px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', marginBottom: 12 }}>{comm.name}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Coordinator', person: coordinator, color: '#1E5FA4' },
                    { label: 'Supervisor',  person: supervisor,  color: '#7C3AED' },
                  ].map(r => (
                    <div key={r.label}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 3 }}>{r.label}</p>
                      {r.person
                        ? <p style={{ fontSize: 12, fontWeight: 600, color: r.color }}>{r.person.first_name} {r.person.last_name}</p>
                        : <p style={{ fontSize: 11, color: 'var(--color-muted)', fontStyle: 'italic' }}>Not assigned</p>
                      }
                    </div>
                  ))}
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 3 }}>Techs ({techs.length})</p>
                    {techs.length > 0
                      ? techs.map(t => (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text)' }}>{t.first_name} {t.last_name}</span>
                          {techProfiles[t.id]?.tech_type==='foreman' && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(220,38,38,0.10)', color: '#DC2626' }}>Foreman</span>}
                        </div>
                      ))
                      : <p style={{ fontSize: 11, color: 'var(--color-muted)', fontStyle: 'italic' }}>No techs assigned</p>
                    }
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}