// App shell: left rail (navigation + the 9 communities), slim top bar (search), content area.
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { LayoutDashboard, FolderOpen, Scale, Wrench, ClipboardCheck, ClipboardList, BarChart3, Settings, LogOut, Download, Home, Menu, PanelLeftClose, PanelLeftOpen, ChevronDown, Bell } from 'lucide-react';
import { useAuth } from '@/hooks/useauth';
import { supabase } from '@/lib/supabase';
import { BrandShield } from '@/components/identity';
import QuickSearch from '@/components/quicksearch';

interface CommCount { community_id: string; name: string; lots: number; open_cases: number; open_items: number }

type CountKey = 'cases' | 'conc' | 'wo' | 'po';
const NAV: { id: string; label: string; path: string; icon: typeof Home; count?: CountKey }[] = [
  { id: 'today',        label: 'Dashboard',    path: '/warranty/today',        icon: LayoutDashboard },
  { id: 'cases',        label: 'Cases',        path: '/warranty/cases',        icon: FolderOpen, count: 'cases' },
  { id: 'conciliation', label: 'Conciliation', path: '/warranty/conciliation', icon: Scale, count: 'conc' },
  { id: 'work-orders',  label: 'Work Orders',  path: '/warranty/work-orders',  icon: Wrench, count: 'wo' },
  { id: 'inspections',  label: 'Inspections',  path: '/warranty/inspections',  icon: ClipboardList },
  { id: 'po-requests',  label: 'PO Approvals', path: '/warranty/po-requests',  icon: ClipboardCheck, count: 'po' },
  { id: 'lots',         label: 'Homes & Lots', path: '/warranty/lots',         icon: Home },
  { id: 'reports',      label: 'Reports',      path: '/warranty/reports',      icon: BarChart3 },
];
const safeCount = async (q: PromiseLike<{ count: number | null; error: unknown }>) => { try { const r = await q; return r.error ? null : (r.count ?? 0); } catch { return null; } };

function navOn(id: string, path: string, pathname: string) {
  if (id === 'lots') return pathname.startsWith('/warranty/lots') || pathname.startsWith('/warranty/communities');
  return pathname === path || pathname.startsWith(path + '/');
}

const readCollapsed = () => { try { return localStorage.getItem('bg-rail') === '1'; } catch { return false; } };

export default function WarrantyLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { signOut } = useAuth();
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [counts, setCounts] = useState<Partial<Record<CountKey, number | null>>>({});
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user; setEmail(u?.email ?? '');
      const meta = (u?.user_metadata ?? {}) as Record<string, string>;
      let name = meta.full_name || meta.name || '';
      if (!name && u) {
        const { data: row } = await supabase.from('users').select('*').eq('id', u.id).maybeSingle();
        const r = (row ?? {}) as Record<string, string>;
        name = r.full_name || r.name || [r.first_name, r.last_name].filter(Boolean).join(' ');
      }
      setFullName(name);
    });
  }, []);
  useEffect(() => {
    (async () => {
      const [cases, conc, wo, po] = await Promise.all([
        safeCount(supabase.from('cases').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']).is('deleted_at', null)),
        safeCount(supabase.from('cm_case_view').select('id', { count: 'exact', head: true }).eq('is_closed', false)),
        safeCount(supabase.from('work_orders').select('id', { count: 'exact', head: true }).not('status', 'in', '(completed,cancelled)')),
        safeCount(supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).in('status', ['pending', 'pending_approval', 'submitted'])),
      ]);
      setCounts({ cases, conc, wo, po });
    })();
  }, []);
  useEffect(() => { setDrawer(false); setUserMenu(false); }, [pathname]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function toggleRail() {
    setCollapsed(v => { const n = !v; try { localStorage.setItem('bg-rail', n ? '1' : '0'); } catch { /* storage unavailable */ } return n; });
  }
  async function installApp() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  }

  const display = fullName || (email.split('@')[0] || '').replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const initials = (fullName ? fullName.split(/\s+/).map(w => w[0]).join('') : (email.split('@')[0] || '?').split(/[._-]/).map(w => w[0]).join('')).slice(0, 2).toUpperCase() || '?';
  const todayLabel = new Date().toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className={`bg-app${collapsed ? ' is-collapsed' : ''}${drawer ? ' is-drawer' : ''}`} style={{ fontFamily: 'var(--font-body)' }}>
      <style>{CSS}</style>
      {drawer && <div className="bg-scrim" onClick={() => setDrawer(false)} />}

      <aside className="bg-rail" aria-label="Main navigation">
        <div className="bg-rail__brand" onClick={() => navigate('/warranty/today')}>
          <BrandShield size={44} />
          <div className="bg-rail__name"><b>Builder<br />Guardian<sup>™</sup></b><span>Warranty Control Centre</span></div>
        </div>

        <nav className="bg-rail__nav">
          {NAV.map(n => {
            const on = navOn(n.id, n.path, pathname); const Icon = n.icon; const c = n.count ? counts[n.count] : undefined;
            return (
              <div key={n.id}>
                <div className="bg-navrow">
                  <button className={`bg-nav${on ? ' on' : ''}`} onClick={() => navigate(n.path)} aria-current={on ? 'page' : undefined} title={n.label}>
                    <Icon size={18} strokeWidth={1.8} /><span className="lbl">{n.label}</span>
                    {c != null && <span className="lbl bdg">{c.toLocaleString()}</span>}
                  </button>
                </div>
              </div>
            );
          })}
          <div className="bg-navrow" style={{ marginTop: 2 }}>
            <button className={`bg-nav${pathname.startsWith('/warranty/settings') ? ' on' : ''}`} onClick={() => navigate('/warranty/settings')} title="Tarion & Settings">
              <Settings size={18} strokeWidth={1.8} /><span className="lbl">Tarion &amp; Settings</span>
            </button>
          </div>
        </nav>

        <button className="bg-collapse" onClick={toggleRail} title={collapsed ? 'Expand menu' : 'Collapse menu'} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}>
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
        <div className="bg-rail__art" />
      </aside>

      <div className="bg-col" style={{ position: 'relative' }}>
        <header className="bg-top">
          <button className="bg-burger" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={19} /></button>
          <QuickSearch />
          <div style={{ flex: 1 }} />
          <span className="bg-date">{todayLabel}</span>
          {installPrompt && <button className="bg-btn" onClick={installApp}><Download size={14} /> Install</button>}
          <button className="bg-bell" onClick={() => navigate('/warranty/today')} aria-label="Needs attention"><Bell size={19} strokeWidth={1.7} /><i /></button>
          <div ref={userRef} style={{ position: 'relative' }}>
            <button className="bg-user" onClick={() => setUserMenu(v => !v)} aria-haspopup="menu" aria-expanded={userMenu} title={email}>
              <span className="bg-avatar">{initials}</span><span className="bg-uname">{display}</span><ChevronDown size={15} />
            </button>
            {userMenu && (
              <div className="bg-menu" role="menu">
                <div className="who"><small>Signed in as</small><div>{email || '—'}</div></div>
                <button role="menuitem" onClick={() => navigate('/warranty/settings')}><Settings size={15} /> Settings</button>
                <button role="menuitem" onClick={signOut}><LogOut size={15} /> Sign out</button>
              </div>
            )}
          </div>
        </header>
        <main className="bg-main"><div className="bg-hero" aria-hidden="true" /><div className="bg-page"><Outlet /></div></main>
      </div>
    </div>
  );
}

const CSS = `
.bg-app{display:flex;min-height:100vh;color:#1F2A3C}
.bg-rail{position:sticky;top:0;align-self:flex-start;height:100vh;width:252px;flex-shrink:0;display:flex;flex-direction:column;z-index:40;transition:width .16s ease;overflow:hidden;
  background-color:#1B2A41;background-image:var(--texture),linear-gradient(180deg,#22334D 0%,#1A2840 55%,#15223A 100%);border-right:1px solid #101B2E;color:#C8D0DC}
.bg-rail__brand{position:relative;z-index:2;display:flex;align-items:center;gap:11px;padding:18px 16px 16px;cursor:pointer}
.bg-rail__brand .bg-rail__name{display:flex;flex-direction:column;line-height:1.05;min-width:0}
.bg-rail__name b{font:800 16px var(--font-body);letter-spacing:.03em;color:#F6F2E9;text-transform:uppercase}.bg-rail__name b sup{font-size:8px;vertical-align:top;margin-left:1px}
.bg-rail__name span{font:800 8.5px var(--font-body);letter-spacing:.1em;color:#C9A96A;margin-top:5px;text-transform:uppercase;white-space:nowrap}
.bg-rail__nav{position:relative;z-index:2;overflow-y:auto;padding:4px 10px 8px;display:flex;flex-direction:column;gap:3px;max-height:calc(100vh - 86px - 150px);scrollbar-width:thin}
.bg-navrow{display:flex;align-items:center;position:relative}
.bg-nav{position:relative;display:flex;align-items:center;gap:12px;width:100%;border:1px solid transparent;background:transparent;padding:10px 12px;border-radius:6px;color:#C3CBD8;font:600 14px var(--font-body);cursor:pointer;text-align:left;white-space:nowrap}
.bg-nav:hover{background:rgba(255,255,255,.06);color:#F6F2E9}
.bg-nav.on{background:linear-gradient(90deg,#8D7140 0%,#B8975A 55%,#A58545 100%);border-color:rgba(255,236,190,.45);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 2px 8px rgba(0,0,0,.25)}
.bg-nav svg{flex-shrink:0}
.bg-nav .bdg{margin-left:auto;min-width:30px;text-align:center;font:700 12px var(--font-body);color:#E7EBF2;background:rgba(255,255,255,.12);border-radius:999px;padding:2px 9px;font-variant-numeric:tabular-nums}
.bg-nav.on .bdg{background:rgba(255,255,255,.22);color:#fff}
.bg-exp{position:absolute;right:46px;border:0;background:transparent;color:#C3CBD8;padding:4px;border-radius:4px;cursor:pointer;display:flex}.bg-exp:hover{color:#fff;background:rgba(255,255,255,.1)}
.bg-comms{display:flex;flex-direction:column;gap:1px;margin:2px 0 4px 18px;padding-left:10px;border-left:1px solid rgba(201,169,106,.35)}
.bg-comm{position:relative;display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;padding:6px 10px;border-radius:5px;color:#B3BDCC;font:600 13px var(--font-body);cursor:pointer;text-align:left}
.bg-comm:hover{background:rgba(255,255,255,.06);color:#F6F2E9}.bg-comm.on{background:rgba(176,141,79,.3);color:#F6EBD0}
.bg-comm .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bg-comm .ct{font:700 11.5px var(--font-body);color:#8896AB;font-variant-numeric:tabular-nums}.bg-comm.on .ct{color:#E6D3A8}
.bg-rail__art{position:absolute;left:0;right:0;bottom:0;height:270px;z-index:1;pointer-events:none;background:url('/brand/house.jpg') 18% 62%/auto 112% no-repeat;-webkit-mask-image:linear-gradient(180deg,transparent 0,rgba(0,0,0,.55) 22%,#000 50%);mask-image:linear-gradient(180deg,transparent 0,rgba(0,0,0,.55) 22%,#000 50%)}
.bg-rail__art::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(27,42,65,.35) 0,rgba(27,42,65,0) 40%,rgba(21,34,58,.25) 100%)}
.bg-collapse{position:absolute;z-index:3;right:8px;top:22px;border:0;background:rgba(255,255,255,.06);color:#9AA7BA;border-radius:5px;padding:5px;cursor:pointer;display:flex}.bg-collapse:hover{color:#fff;background:rgba(255,255,255,.14)}
.bg-nav:focus-visible,.bg-comm:focus-visible,.bg-user:focus-visible,.bg-btn:focus-visible,.bg-burger:focus-visible,.bg-bell:focus-visible,.bg-exp:focus-visible{outline:2px solid #C9A96A;outline-offset:-2px}
.bg-app.is-collapsed .bg-rail{width:62px}
.bg-app.is-collapsed .lbl,.bg-app.is-collapsed .bg-rail__name,.bg-app.is-collapsed .bg-comms,.bg-app.is-collapsed .bg-rail__art{display:none}
.bg-app.is-collapsed .bg-nav{justify-content:center;padding-left:0;padding-right:0}
.bg-app.is-collapsed .bg-rail__brand{justify-content:center;padding:18px 0 14px}.bg-app.is-collapsed .bg-collapse{position:static;margin:8px auto}
.bg-col{flex:1;min-width:0;display:flex;flex-direction:column}
.bg-top{position:sticky;top:0;z-index:30;height:62px;display:flex;align-items:center;gap:16px;padding:0 24px;background:rgba(232,227,218,.8);backdrop-filter:blur(8px);border-bottom:1px solid rgba(190,180,160,.55)}
.bg-main{flex:1;min-width:0;position:relative}
.bg-hero{position:absolute;top:0;right:0;width:min(1000px,78%);height:340px;z-index:0;pointer-events:none;background:url('/brand/blueprint.jpg') 100% 0/cover no-repeat;mix-blend-mode:multiply;opacity:.9;
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 38%),linear-gradient(180deg,#000 55%,transparent 100%);-webkit-mask-composite:source-in;mask-image:linear-gradient(90deg,transparent 0,#000 38%),linear-gradient(180deg,#000 55%,transparent 100%);mask-composite:intersect}
.bg-page{position:relative;z-index:1}
.bg-date{font:600 13px var(--font-body);color:#2F394A;white-space:nowrap}
.bg-bell{position:relative;border:0;background:transparent;color:#2F394A;padding:6px;border-radius:6px;cursor:pointer;display:flex}.bg-bell:hover{background:rgba(0,0,0,.05)}
.bg-bell i{position:absolute;top:5px;right:6px;width:8px;height:8px;border-radius:50%;background:#C9A96A;border:1.5px solid #E8E3DA}
.bg-user{display:flex;align-items:center;gap:10px;border:0;border-left:1px solid rgba(150,140,120,.45);background:transparent;padding:2px 4px 2px 16px;color:#1F2A3C;cursor:pointer}
.bg-avatar{width:36px;height:36px;border-radius:50%;border:1px solid #C9A96A;background:linear-gradient(180deg,#22334D,#1B2A41);color:#F6F2E9;font:800 12.5px var(--font-body);display:flex;align-items:center;justify-content:center}
.bg-uname{font:700 14px var(--font-body);white-space:nowrap}
.bg-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #C6BDAC;background:#F8F6F1;border-radius:6px;padding:6px 11px;font:700 12px var(--font-body);color:#1F2A3C;cursor:pointer}
.bg-menu{position:absolute;right:0;top:48px;width:232px;background:#F8F6F1;border:1px solid #D2CABB;border-radius:8px;box-shadow:0 12px 30px rgba(40,32,18,.18);padding:6px;z-index:60}
.bg-menu .who{padding:8px 10px 10px;border-bottom:1px solid #E1DACD;margin-bottom:4px}.bg-menu .who small{font:600 11px var(--font-body);color:#6C7280}.bg-menu .who div{font:700 13px var(--font-body);overflow:hidden;text-overflow:ellipsis}
.bg-menu button{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;padding:8px 10px;border-radius:5px;font:600 13px var(--font-body);color:#1F2A3C;cursor:pointer;text-align:left}.bg-menu button:hover{background:#EFEBE2}
.bg-burger{display:none;border:0;background:transparent;padding:6px;border-radius:6px;color:#1F2A3C;cursor:pointer}
.bg-scrim{position:fixed;inset:0;background:rgba(27,42,65,.45);z-index:35}
@media (max-width:960px){
  .bg-rail{position:fixed;left:0;top:0;transform:translateX(-100%);transition:transform .18s ease;width:268px!important;box-shadow:0 0 40px rgba(20,16,8,.35)}
  .bg-app.is-drawer .bg-rail{transform:none}
  .bg-app.is-collapsed .lbl,.bg-app.is-collapsed .bg-rail__name{display:revert}.bg-app.is-collapsed .bg-comms,.bg-app.is-collapsed .bg-rail__art{display:block}
  .bg-app.is-collapsed .bg-nav{justify-content:flex-start;padding:10px 12px}
  .bg-collapse{display:none}.bg-burger{display:inline-flex}.bg-top{padding:0 12px}.bg-date,.bg-uname{display:none}.bg-user{padding-left:8px}
}
@keyframes spin{to{transform:rotate(360deg)}}
`;
