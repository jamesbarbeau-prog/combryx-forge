// Settings → Security: who may create an account for this company (work-email domains and personal invites).
import { useCallback, useEffect, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCompanyId } from '@/lib/company';

interface Invite { id: string; email: string; access_level: string; cm_role: string; created_at: string }
const LEVELS: { id: string; label: string; access_level: string; cm_role: string }[] = [
  { id: 'staff', label: 'Staff (view only)', access_level: 'community', cm_role: 'viewer' },
  { id: 'coordinator', label: 'Coordinator', access_level: 'community', cm_role: 'coordinator' },
  { id: 'manager', label: 'Manager', access_level: 'manager', cm_role: 'manager' },
  { id: 'admin', label: 'Administrator', access_level: 'company', cm_role: 'manager' },
];
const field: React.CSSProperties = { height: 38, padding: '0 10px', borderRadius: 6, border: '1px solid #C6BDAC', background: '#fff', fontSize: 13, fontFamily: 'var(--font-body)', color: '#1F2A3C', boxSizing: 'border-box' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, height: 38, padding: '0 14px', borderRadius: 6, border: 'none', background: '#3F6A8F', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' };

export function StaffAccess() {
  const [companyId, setCompanyId] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [invEmail, setInvEmail] = useState('');
  const [invLevel, setInvLevel] = useState('staff');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const id = await getCompanyId(); setCompanyId(id);
    const [{ data: c }, { data: adm }, { data: inv }] = await Promise.all([
      supabase.from('companies').select('email_domains').eq('id', id).maybeSingle(),
      supabase.rpc('is_company_admin'),
      supabase.from('company_invites').select('id,email,access_level,cm_role,created_at').is('used_at', null).order('created_at', { ascending: false }),
    ]);
    setDomains(((c as { email_domains: string[] } | null)?.email_domains) ?? []);
    setIsAdmin(adm === true);
    setInvites((inv ?? []) as Invite[]);
  }, []);
  useEffect(() => { load().catch(e => setMsg({ ok: false, text: e.message })); }, [load]);

  async function saveDomains(next: string[]) {
    const { error } = await supabase.from('companies').update({ email_domains: next }).eq('id', companyId);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: 'Saved.' }); load();
  }
  async function addDomain() {
    const d = newDomain.trim().toLowerCase().replace(/^@/, '');
    if (!d) return;
    setNewDomain(''); await saveDomains([...new Set([...domains, d])]);
  }
  async function invite() {
    const email = invEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) { setMsg({ ok: false, text: 'Enter a valid email address.' }); return; }
    const lv = LEVELS.find(l => l.id === invLevel)!;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('company_invites').insert({ company_id: companyId, email, access_level: lv.access_level, cm_role: lv.cm_role, invited_by: user?.id });
    if (error) { setMsg({ ok: false, text: /duplicate/i.test(error.message) ? 'That person already has an open invite.' : error.message }); return; }
    setInvEmail(''); setMsg({ ok: true, text: `Invite saved. ${email} can now create an account and confirm by email.` }); load();
  }

  const levelName = (i: Invite) => LEVELS.find(l => l.access_level === i.access_level && l.cm_role === i.cm_role)?.label ?? i.access_level;

  return (
    <div className="forge-card" style={{ padding: 24, marginTop: 16 }}>
      <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Who can create an account</p>
      <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 16, lineHeight: 1.6 }}>
        Only people with a work email at one of these domains, or a personal invite, can sign up. Each must click the link we email to confirm the address before they get in, and they start with view-only access until you promote them in Team &amp; Sites. Public addresses such as gmail.com are never accepted.
      </p>

      <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6C7280', display: 'block', marginBottom: 7 }}>Company email domains</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {domains.length === 0 && <span style={{ fontSize: 12, color: '#A5402F' }}>None set. Nobody can sign up except by invite.</span>}
        {domains.map(d => (
          <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 6px 5px 11px', borderRadius: 14, background: '#EFEBE2', border: '1px solid #D9D2C5', fontSize: 12.5, fontWeight: 600 }}>
            @{d}
            {isAdmin && <button onClick={() => saveDomains(domains.filter(x => x !== d))} aria-label={`Remove ${d}`} style={{ display: 'flex', border: 'none', background: 'none', cursor: 'pointer', color: '#6C7280', padding: 2 }}><X size={12} /></button>}
          </span>
        ))}
      </div>
      {isAdmin ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
          <input style={{ ...field, flex: 1, maxWidth: 280 }} placeholder="claridgehomes.com" value={newDomain} onChange={e => setNewDomain(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDomain()} />
          <button style={btn} onClick={addDomain}><Plus size={13} /> Add domain</button>
        </div>
      ) : <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 22 }}>Only an administrator can change this.</p>}

      <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6C7280', display: 'block', marginBottom: 7 }}>Invite a person</label>
      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input style={{ ...field, flex: 1, minWidth: 200, maxWidth: 300 }} type="email" placeholder="name@company.com" value={invEmail} onChange={e => setInvEmail(e.target.value)} />
          <select style={field} value={invLevel} onChange={e => setInvLevel(e.target.value)}>{LEVELS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
          <button style={btn} onClick={invite}>Save invite</button>
        </div>
      )}
      {invites.length === 0 ? <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>No open invites.</p> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {invites.map(i => (
            <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, background: '#EFEBE2', border: '1px solid #D9D2C5', fontSize: 12.5 }}>
              <b style={{ fontWeight: 600 }}>{i.email}</b><span style={{ color: '#6C7280' }}>{levelName(i)}</span>
              {isAdmin && <button onClick={async () => { await supabase.from('company_invites').delete().eq('id', i.id); load(); }} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#A5402F', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)' }}>Cancel invite</button>}
            </div>
          ))}
        </div>
      )}
      {msg && <p style={{ fontSize: 12, marginTop: 12, color: msg.ok ? '#4A7A55' : '#A5402F' }}>{msg.text}</p>}
    </div>
  );
}
