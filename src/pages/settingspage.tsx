import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { StaffAccess } from '@/components/staffaccess';
import { getCompanyId } from '@/lib/company';
import {
  Building2, Check, Upload, Shield, Users, Mail, Lock, Plus, X, RefreshCw,
} from 'lucide-react';

// Set once the signed-in user's company is known, before any tab renders.
let COMPANY_ID = '';

type Tab = 'company' | 'team' | 'tarion' | 'security';

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
  e.currentTarget.style.borderColor = '#3F6A8F';
  e.currentTarget.style.boxShadow   = '0 0 0 3px rgba(63,106,143,0.12)';
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
          <button onClick={() => { setPreview(null); onUploaded(''); }} style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', background: '#A5402F', border: '2px solid var(--color-panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={10} color="#FFFFFF" strokeWidth={3} />
          </button>
          <button onClick={() => inputRef.current?.click()} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, background: 'var(--color-mist)', border: '1px solid var(--color-border)', fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            <Upload size={10} /> Replace
          </button>
        </div>
      ) : (
        <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()} style={{ border: `2px dashed ${dragging ? '#3F6A8F' : 'var(--color-border)'}`, borderRadius: 10, padding: '28px 20px', background: dragging ? 'rgba(63,106,143,0.06)' : 'var(--color-mist)', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}>
          {uploading ? (
            <div>
              <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #3F6A8F', borderTopColor: 'transparent', margin: '0 auto 10px', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Uploading...</p>
            </div>
          ) : (
            <div>
              <Upload size={22} color={dragging ? '#2F5576' : 'var(--color-muted)'} strokeWidth={1.5} style={{ margin: '0 auto 10px' }} />
              <p style={{ fontSize: 12, fontWeight: 600, color: dragging ? '#2F5576' : 'var(--color-text)', marginBottom: 4 }}>{dragging ? 'Drop to upload' : 'Drop file here or click to browse'}</p>
              <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>PNG, JPG, PDF accepted</p>
            </div>
          )}
        </div>
      )}
      {error && <p style={{ fontSize: 11, color: '#A5402F', marginTop: 5 }}>{error}</p>}
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={onChange} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
          { key: 'name',    label: 'Company Name',      placeholder: 'Claridge Homes Ltd.' },
          { key: 'phone',   label: 'Phone',              placeholder: '416-555-0100'              },
          { key: 'email',   label: 'Email',              placeholder: 'warranty@yourbuilder.ca'         },
          { key: 'website', label: 'Website',            placeholder: 'www.yourbuilder.ca'            },
          { key: 'builder_licence', label: 'Tarion builder licence #', placeholder: 'Printed on the PDI form' },
        ].map(f => (
          <div key={f.key}>
            <label style={lbl}>{f.label}</label>
            <input style={inp} placeholder={f.placeholder} value={settings[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} onFocus={focus} onBlur={blur} />
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>Street Address</label>
        <input style={inp} placeholder="123 Main St, Ottawa, ON" value={settings.address ?? ''} onChange={e => set('address', e.target.value)} onFocus={focus} onBlur={blur} />
      </div>
      <div style={{ marginBottom: 24 }}>
        <label style={lbl}>Closing Message</label>
        <textarea style={{ ...inp, height: 72, padding: '8px 10px', resize: 'none' }} value={settings.closing_message ?? ''} onChange={e => set('closing_message', e.target.value)} onFocus={focus} onBlur={blur} placeholder="Thank you for choosing us." />
      </div>
      <button onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: saved ? '#4A7A55' : '#3F6A8F', border: 'none', color: saved ? '#FFFFFF' : '#FFFFFF', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s' }}>
        {saved ? <><Check size={14} /> Saved!</> : saving ? 'Saving...' : 'Save Company Info'}
      </button>
    </div>
  );
}

/* ── TAX TAB ── */
/* ── TARION & ALERTS TAB ── */
interface ImportRow {
  id: string; tarion_case_number: string; form_code: string | null; owner_name: string | null; address: string | null;
  status: string; reason: string | null; items_count: number; photos_found: number; photos_done: number; created_at: string;
}
interface Recipient { id: string; email: string; name: string | null; community_id: string | null; is_active: boolean; }

function TarionTab() {
  const [settings, setSettings] = useState<any>({});
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [imports, setImports]   = useState<ImportRow[]>([]);
  const [recips, setRecips]     = useState<Recipient[]>([]);
  const [communities, setCommunities] = useState<{ id: string; name: string }[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName]   = useState('');
  const [newSite, setNewSite]   = useState('');
  const [syncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg]   = useState<{ ok: boolean; lines: string[] } | null>(null);

  const load = useCallback(async () => {
    const [s, i, r, c] = await Promise.all([
      supabase.from('company_settings').select('settings').eq('company_id', COMPANY_ID).maybeSingle(),
      supabase.from('tarion_form_imports').select('id,tarion_case_number,form_code,owner_name,address,status,reason,items_count,photos_found,photos_done,created_at')
        .eq('company_id', COMPANY_ID).order('created_at', { ascending: false }).limit(15),
      supabase.from('warranty_intake_recipients').select('id,email,name,community_id,is_active').eq('company_id', COMPANY_ID).order('created_at'),
      supabase.from('warranty_communities').select('id,name').eq('company_id', COMPANY_ID).order('name'),
    ]);
    if (s.data?.settings) setSettings(s.data.settings);
    setImports((i.data ?? []) as ImportRow[]);
    setRecips((r.data ?? []) as Recipient[]);
    setCommunities((c.data ?? []) as { id: string; name: string }[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  function set(key: string, val: string) { setSettings((p: any) => ({ ...p, [key]: val })); }
  async function saveProfile() {
    setSaving(true);
    await supabase.from('company_settings').upsert({ company_id: COMPANY_ID, settings });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  async function addRecipient() {
    const email = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    await supabase.from('warranty_intake_recipients').insert({
      company_id: COMPANY_ID, email, name: newName.trim() || null, community_id: newSite || null,
    });
    setNewEmail(''); setNewName(''); setNewSite(''); load();
  }
  async function removeRecipient(id: string) {
    await supabase.from('warranty_intake_recipients').delete().eq('id', id);
    load();
  }

  async function syncNow() {
    setSyncing(true); setSyncMsg(null);
    const { data, error } = await supabase.functions.invoke('tarion-sync', { body: { mode: 'forms' } });
    if (error) {
      let detail = error.message;
      try { const j = await (error as any).context?.json?.(); if (j?.error) detail = j.error; } catch { /* keep generic message */ }
      setSyncMsg({ ok: false, lines: [detail] });
    } else {
      const lines: string[] = [];
      const f = data?.forms ?? {}; const p = data?.photos ?? {}; const d = data?.digest ?? {};
      for (const [k, v] of Object.entries(f.results ?? {})) if (typeof v === 'number') lines.push(`Forms ${k}: ${v}`);
      if (typeof p.downloaded === 'number') lines.push(`Photos downloaded: ${p.downloaded}`);
      if (typeof d.emailed === 'number') lines.push(`Coordinator emails sent: ${d.emailed}`);
      (p.notes ?? []).forEach((n: string) => lines.push(n));
      (data?.errors ?? []).forEach((e: string) => lines.push('Problem: ' + e));
      if (!lines.length) lines.push('Checked Tarion. Nothing new.');
      setSyncMsg({ ok: !(data?.errors?.length), lines });
    }
    setSyncing(false); load();
  }

  // Looks at every imported form again and pulls its photos from Tarion's photo service. Repeats until none are left (each pass has a time limit).
  async function getAllPhotos() {
    setPhotoBusy(true); setPhotoMsg(null);
    let downloaded = 0, formsDone = 0, last = -1, left = 0; const notes: string[] = [], errors: string[] = [];
    try {
      for (let pass = 0; pass < 12; pass++) {
        setPhotoMsg({ ok: true, lines: [`Getting photos from Tarion… pass ${pass + 1}`, `${downloaded} photos saved so far`] });
        const { data, error } = await supabase.functions.invoke('tarion-sync', { body: { mode: 'photos', recheck: pass === 0 } });
        if (error) { let d = error.message; try { const j = await (error as any).context?.json?.(); if (j?.error) d = j.error; } catch { /* generic */ } errors.push(d); break; }
        const p = data?.photos ?? {};
        downloaded += p.downloaded ?? 0; formsDone += p.forms ?? 0; left = p.remaining ?? 0;
        (p.notes ?? []).forEach((n: string) => notes.push(n)); (p.errors ?? []).forEach((e: string) => errors.push(e)); (data?.errors ?? []).forEach((e: string) => errors.push(e));
        if (!left || left === last) break;   // finished, or a pass made no progress
        last = left;
      }
    } catch (e) { errors.push((e as Error).message); }
    const lines = [`${downloaded} photos saved from ${formsDone} form${formsDone === 1 ? '' : 's'}.` + (left ? ` ${left} form${left === 1 ? '' : 's'} still waiting: run it again.` : ''), ...notes.slice(0, 12), ...errors.slice(0, 8).map(e => 'Problem: ' + e)];
    setPhotoMsg({ ok: !errors.length, lines }); setPhotoBusy(false); load();
  }

  const siteName = (id: string | null) => (id ? communities.find(c => c.id === id)?.name ?? 'Site' : 'All sites');
  const statusColor: Record<string, string> = { imported: '#4A7A55', needs_review: '#9A6A16', skipped: '#6C7280' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="forge-card" style={{ padding: 24 }}>
        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Tarion import</p>
        <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          Every new warranty form becomes a case with its items and homeowner photos, and coordinators get one email listing what came in.
          Tarion login details are stored on the server, not in this app.
        </p>
        <button onClick={syncNow} disabled={syncing} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: '#3F6A8F', color: '#FFFFFF', border: 'none', cursor: syncing ? 'wait' : 'pointer' }}>
          <RefreshCw size={13} /> {syncing ? 'Checking Tarion…' : 'Check Tarion now'}
        </button>
        <button onClick={getAllPhotos} disabled={photoBusy || syncing} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: '#F8F6F1', color: '#1F2A3C', border: '1px solid #D9D2C5', cursor: photoBusy ? 'wait' : 'pointer', marginTop: 10 }}>
          <RefreshCw size={13} /> {photoBusy ? 'Getting photos…' : 'Get photos for all homes'}
        </button>
        {photoMsg && (
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, fontSize: 12, lineHeight: 1.6, background: photoMsg.ok ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)', border: `1px solid ${photoMsg.ok ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}` }}>
            {photoMsg.lines.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
        {syncMsg && (
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, fontSize: 12, lineHeight: 1.6, background: syncMsg.ok ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)', border: `1px solid ${syncMsg.ok ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}` }}>
            {syncMsg.lines.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </div>

      <div className="forge-card" style={{ padding: 24 }}>
        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Recent imports</p>
        {imports.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Nothing imported yet.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {imports.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: 'var(--color-panel)', border: '1px solid var(--color-border)', fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor[r.status] ?? '#6C7280', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{r.tarion_case_number} · {r.form_code ?? 'form'} · {r.owner_name ?? 'Owner'}</div>
                <div style={{ color: 'var(--color-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.address ?? ''}{r.status === 'needs_review' && r.reason ? ` — ${r.reason}` : ''}
                </div>
              </div>
              <span style={{ color: 'var(--color-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>{r.items_count} items · {r.photos_done}/{r.photos_found} photos</span>
            </div>
          ))}
        </div>
      </div>

      <div className="forge-card" style={{ padding: 24 }}>
        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Who gets the new-forms email</p>
        <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 14, lineHeight: 1.6 }}>
          Pick all sites or one site per person. With nobody listed, the email goes to the after-sales contact Tarion has on each home.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {recips.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--color-panel)', border: '1px solid var(--color-border)', fontSize: 12 }}>
              <Mail size={13} color="var(--color-muted)" />
              <span style={{ fontWeight: 600 }}>{r.name ? `${r.name} · ` : ''}{r.email}</span>
              <span style={{ color: 'var(--color-muted)', marginLeft: 'auto' }}>{siteName(r.community_id)}</span>
              <button onClick={() => removeRecipient(r.id)} aria-label="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}><X size={14} /></button>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr auto', gap: 8 }}>
          <input style={inp} placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} onFocus={focus} onBlur={blur} />
          <input style={inp} placeholder="Name (optional)" value={newName} onChange={e => setNewName(e.target.value)} onFocus={focus} onBlur={blur} />
          <select style={inp} value={newSite} onChange={e => setNewSite(e.target.value)} onFocus={focus} onBlur={blur}>
            <option value="">All sites</option>
            {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={addRecipient} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: '#3F6A8F', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}><Plus size={13} /> Add</button>
        </div>
      </div>

      <div className="forge-card" style={{ padding: 24 }}>
        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Builder profile</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {[
            { key: 'tarion_builder_id',  label: 'Tarion Builder ID',      placeholder: 'B35002' },
            { key: 'hcra_number',        label: 'HCRA Registration #',    placeholder: 'HR-00123' },
            { key: 'builder_legal_name', label: 'Legal Builder Name',     placeholder: 'Claridge Homes Ltd.' },
            { key: 'warranty_contact',   label: 'Warranty Contact Name',  placeholder: 'Jane Smith' },
            { key: 'warranty_email',     label: 'Warranty Contact Email', placeholder: 'warranty@builder.ca' },
            { key: 'warranty_phone',     label: 'Warranty Contact Phone', placeholder: '613-555-0100' },
          ].map(f => (
            <div key={f.key}>
              <label style={lbl}>{f.label}</label>
              <input style={inp} placeholder={f.placeholder} value={settings[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} onFocus={focus} onBlur={blur} />
            </div>
          ))}
        </div>
        <button onClick={saveProfile} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: '#3F6A8F', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>
          {saved ? <><Check size={14} /> Saved</> : saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </div>
  );
}

/* ── SECURITY TAB ── */
function SecurityTab() {
  return (
    <>
    <div className="forge-card" style={{ padding: 24 }}>
      <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Two-step sign-in</p>
      <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 16, lineHeight: 1.6 }}>Add an authenticator app to your account so a stolen password is not enough.</p>
      <Link to="/warranty/mfa-setup" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: '#3F6A8F', color: '#FFFFFF', textDecoration: 'none' }}>
        <Shield size={13} /> Set up two-step sign-in
      </Link>
    </div>
    <StaffAccess />
    </>
  );
}

/* ── Main Settings Page ── */
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('company');
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    getCompanyId().then(id => { COMPANY_ID = id; setReady(true); }).catch(e => setErr(e.message));
  }, []);

  const TABS = [
    { id: 'company',  label: 'Company',          icon: Building2 },
    { id: 'team',     label: 'Team & Sites',     icon: Users },
    { id: 'tarion',   label: 'Tarion & Alerts',  icon: Mail },
    { id: 'security', label: 'Security',         icon: Lock },
  ];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>System</p>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Settings</h1>
      </div>
      {err && <p style={{ fontSize: 13, color: '#A5402F' }}>{err}</p>}
      {!ready && !err && <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Loading…</p>}
      {ready && (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {TABS.map(tab => {
              const Icon = tab.icon; const active = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as Tab)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: active ? 700 : 500, textAlign: 'left', cursor: 'pointer', border: 'none', background: active ? 'rgba(63,106,143,0.14)' : 'transparent', color: active ? 'var(--color-text)' : 'var(--color-muted)' }}>
                  <Icon size={13} strokeWidth={active ? 2 : 1.5} /> {tab.label}
                </button>
              );
            })}
          </div>
          <div>
            {activeTab === 'company'  && <CompanyTab />}
            {activeTab === 'team'     && <WarrantyTeamTab />}
            {activeTab === 'tarion'   && <TarionTab />}
            {activeTab === 'security' && <SecurityTab />}
          </div>
        </div>
      )}
    </div>
  );
}


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
      supabase.from('users').select('id,first_name,last_name,email,phone,access_level,is_active').eq('company_id', COMPANY_ID).eq('is_active', true).order('first_name'),
      supabase.from('warranty_communities').select('id,name').eq('company_id', COMPANY_ID).order('name'),
      supabase.from('tech_profiles').select('*').eq('company_id', COMPANY_ID),
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
    else await supabase.from('tech_profiles').insert({ user_id: userId, company_id: COMPANY_ID, tech_type: 'regular', ...updates });
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
        <div style={{ position: 'fixed', top: 20, right: 24, padding: '10px 18px', borderRadius: 8, background: '#4A7A55', color: '#fff', fontSize: 12, fontWeight: 700, zIndex: 1000, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          ✓ {toast}
        </div>
      )}

      {/* Sub-nav */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {(['team','sites'] as const).map(v => (
          <button key={v} onClick={() => setActiveView(v)}
            style={{ padding: '7px 16px', borderRadius: 7, border: `1px solid ${activeView===v ? 'rgba(63,106,143,0.3)' : 'var(--color-border)'}`, background: activeView===v ? 'rgba(63,106,143,0.08)' : 'transparent', color: activeView===v ? '#2F5576' : 'var(--color-muted)', fontSize: 12, fontWeight: activeView===v ? 700 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', textTransform: 'capitalize' as const }}>
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
              <div key={user.id} style={{ borderRadius: 10, overflow: 'hidden', background: 'var(--color-panel)', border: `1px solid ${isExp ? 'rgba(63,106,143,0.3)' : 'var(--color-border)'}`, transition: 'all 0.15s' }}>

                {/* Row */}
                <div onClick={() => setExpandedUser(isExp ? null : user.id)} style={{ padding: '13px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(63,106,143,0.12)', border: '1px solid rgba(63,106,143,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 800, color: '#2F5576' }}>
                    {user.first_name[0]}{user.last_name[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{user.first_name} {user.last_name}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: 'rgba(63,106,143,0.12)', border: '1px solid rgba(63,106,143,0.25)', color: '#2F5576' }}>{user.access_level}</span>
                      {tech?.tech_type && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: tech.tech_type==='foreman' ? 'rgba(220,38,38,0.10)' : 'rgba(217,119,6,0.10)', color: tech.tech_type==='foreman' ? '#A5402F' : '#9A6A16', border: `1px solid ${tech.tech_type==='foreman' ? 'rgba(220,38,38,0.2)' : 'rgba(217,119,6,0.2)'}` }}>
                          {tech.tech_type==='foreman' ? 'Foreman' : 'Regular tech'}
                        </span>
                      )}
                      {tech?.team && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: 'rgba(22,163,74,0.10)', color: '#4A7A55', border: '1px solid rgba(22,163,74,0.2)' }}>
                          {tech.team === 'warranty' ? 'Warranty' : 'Construction'}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{user.email}</span>
                      {sites.length > 0 && (
                        <span style={{ fontSize: 10, color: '#3F6A8F', fontWeight: 600 }}>
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
                        {tech?.tech_type === 'foreman' && <p style={{ fontSize: 10, color: '#A5402F', marginTop: 4 }}>Foreman is never scheduled for interior repairs</p>}
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
                                  style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: val ? 'rgba(22,163,74,0.10)' : 'var(--color-panel)', border: `1px solid ${val ? 'rgba(22,163,74,0.3)' : 'var(--color-border)'}`, color: val ? '#4A7A55' : 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
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
                            <div key={comm.id} style={{ display: 'flex', alignItems: 'center', gap: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${assigned ? 'rgba(63,106,143,0.4)' : 'var(--color-border)'}` }}>
                              <button onClick={() => toggleSite(user.id, comm.id)} disabled={!!isSaving}
                                style={{ padding: '6px 12px', background: assigned ? 'rgba(63,106,143,0.10)' : 'var(--color-panel)', border: 'none', color: assigned ? '#2F5576' : 'var(--color-muted)', fontSize: 11, fontWeight: assigned ? 700 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                {isSaving ? '…' : (assigned ? '✓ ' : '')}{comm.name}
                              </button>
                              {assigned && (
                                <button onClick={() => setPrimary(user.id, comm.id)} title="Set as primary"
                                  style={{ padding: '6px 8px', background: isPrimary ? '#3F6A8F' : 'rgba(63,106,143,0.05)', border: 'none', borderLeft: '1px solid rgba(63,106,143,0.25)', color: isPrimary ? '#FFFFFF' : '#2F5576', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
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
                    { label: 'Coordinator', person: coordinator, color: '#3F6A8F' },
                    { label: 'Supervisor',  person: supervisor,  color: '#6B5B95' },
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
                          {techProfiles[t.id]?.tech_type==='foreman' && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(220,38,38,0.10)', color: '#A5402F' }}>Foreman</span>}
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