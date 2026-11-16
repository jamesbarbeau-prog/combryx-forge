// App shell: left rail (navigation + the 9 communities), slim top bar (search), content area.
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { LayoutDashboard, Building2, FolderOpen, Scale, Wrench, ClipboardCheck, BarChart3, Settings, LogOut, Download, Home, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '@/hooks/useauth';
import { supabase } from '@/lib/supabase';
import { BrandMark } from '@/components/brand';
import QuickSearch from '@/components/quicksearch';

interface CommCount { community_id: string; name: string; lots: number; open_cases: number; open_items: number }

const NAV = [
  { id: 'today',        label: 'Today',        path: '/warranty/today',        icon: LayoutDashboard },
  { id: 'cases',        label: 'Cases',        path: '/warranty/cases',        icon: FolderOpen },
  { id: 'conciliation', label: 'Conciliation', path: '/warranty/conciliation', icon: Scale },
  { id: 'work-orders',  label: 'Work orders',  path: '/warranty/work-orders',  icon: Wrench },
  { id: 'po-requests',  label: 'PO approvals', path: '/warranty/po-requests',  icon: ClipboardCheck },
  { id: 'lots',         label: 'Homes & lots', path: '/warranty/lots',         icon: Home },
  { id: 'reports',      label: 'Reports',      path: '/warranty/reports',      icon: BarChart3 },
];

function navOn(id: string, path: string, pathname: string) {
  if (id === 'lots') return pathname.startsWith('/warranty/lots');
  return pathname === path || pathname.startsWith(path + '/');
}

const readCollapsed = () => { try { return localStorage.getItem('bg-rail') === '1'; } catch { return false; } };

export default function WarrantyLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { signOut } = useAuth();
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [comms, setComms] = useState<CommCount[]>([]);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? '')); }, []);
  useEffect(() => { supabase.rpc('community_counts').then(({ data }) => setComms((data ?? []) as CommCount[])); }, []);
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

  const initials = (email.split('@')[0] || '?').split(/[._-]/).map(s => s[0]).join('').slice(0, 2).toUpperCase() || '?';
  const activeComm = /^\/warranty\/communities\/([^/]+)/.exec(pathname)?.[1];
  const commsOn = pathname === '/warranty/communities';

  return (
    <div className={`bg-app${collapsed ? ' is-collapsed' : ''}${drawer ? ' is-drawer' : ''}`} style={{ fontFamily: 'var(--font-body)' }}>
      <style>{CSS}</style>
      {drawer && <div className="bg-scrim" onClick={() => setDrawer(false)} />}

      <aside className="bg-rail" aria-label="Main navigation">
        <div className="bg-rail__brand" onClick={() => navigate('/warranty/today')}>
          <BrandMark size={32} />
          <div className="bg-rail__name"><b>Builder Guardian</b><span>Warranty</span></div>
        </div>

        <nav className="bg-rail__nav">
          {NAV.map(n => {
            const on = navOn(n.id, n.path, pathname); const Icon = n.icon;
            return (
              <button key={n.id} className={`bg-nav${on ? ' on' : ''}`} onClick={() => navigate(n.path)} aria-current={on ? 'page' : undefined} title={n.label}>
                <Icon size={17} strokeWidth={1.9} /><span className="lbl">{n.label}</span>
              </button>
            );
          })}

          <div className="bg-sec"><span className="lbl">Communities</span></div>
          <button className={`bg-nav${commsOn ? ' on' : ''}`} onClick={() => navigate('/warranty/communities')} title="All communities">
            <Building2 size={17} strokeWidth={1.9} /><span className="lbl">All communities</span>
          </button>
          <div className="bg-comms">
            {comms.map(c => (
              <button key={c.community_id} className={`bg-comm${activeComm === c.community_id ? ' on' : ''}`} onClick={() => navigate(`/warranty/communities/${c.community_id}`)} title={`${c.name} · ${c.lots} homes · ${c.open_cases} open cases`}>
                <span className="init">{c.name.slice(0, 1)}</span>
                <span className="lbl nm">{c.name}</span>
                <span className="lbl ct">{c.open_cases}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="bg-rail__foot">
          <button className={`bg-nav${pathname.startsWith('/warranty/settings') ? ' on' : ''}`} onClick={() => navigate('/warranty/settings')} title="Tarion and settings">
            <Settings size={17} strokeWidth={1.9} /><span className="lbl">Settings</span>
          </button>
          <button className="bg-nav bg-collapse" onClick={toggleRail} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
            {collapsed ? <PanelLeftOpen size={17} strokeWidth={1.9} /> : <PanelLeftClose size={17} strokeWidth={1.9} />}<span className="lbl">Collapse</span>
          </button>
        </div>
      </aside>

      <div className="bg-col">
        <header className="bg-top">
          <button className="bg-burger" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={19} /></button>
          <QuickSearch />
          <div style={{ flex: 1 }} />
          {installPrompt && <button className="bg-btn" onClick={installApp}><Download size={14} /> Install</button>}
          <div ref={userRef} style={{ position: 'relative' }}>
            <button className="bg-avatar" onClick={() => setUserMenu(v => !v)} aria-haspopup="menu" aria-expanded={userMenu} title={email}>{initials}</button>
            {userMenu && (
              <div className="bg-menu" role="menu">
                <div className="who"><small>Signed in as</small><div>{email || '—'}</div></div>
                <button role="menuitem" onClick={() => navigate('/warranty/settings')}><Settings size={15} /> Settings</button>
                <button role="menuitem" onClick={signOut}><LogOut size={15} /> Sign out</button>
              </div>
            )}
          </div>
        </header>
        <main className="bg-main"><Outlet /></main>
      </div>
    </div>
  );
}

const CSS = `
.bg-app{display:flex;min-height:100vh;color:#1F2A3C}
.bg-rail{position:sticky;top:0;align-self:flex-start;height:100vh;width:240px;flex-shrink:0;display:flex;flex-direction:column;z-index:40;transition:width .16s ease;
  background-color:#1B2A41;background-image:var(--texture),linear-gradient(180deg,#22334D 0%,#1A2840 60%,#16233A 100%);border-right:1px solid #101B2E;color:#C8D0DC}
.bg-rail__brand{display:flex;align-items:center;gap:10px;padding:16px 14px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.08)}
.bg-rail__brand .bg-rail__name{display:flex;flex-direction:column;line-height:1.1;min-width:0}
.bg-rail__name b{font:800 13.5px var(--font-body);letter-spacing:.02em;color:#F3EFE6;white-space:nowrap;text-transform:uppercase}.bg-rail__name span{font:700 10px var(--font-body);letter-spacing:.14em;color:#C9A96A;margin-top:3px;text-transform:uppercase}
.bg-rail__brand>div:first-child{box-shadow:0 0 0 1px rgba(201,169,106,.5)!important;background:#F3EFE6!important}
.bg-rail__nav{flex:1;overflow-y:auto;padding:12px 8px 8px;display:flex;flex-direction:column;gap:1px}
.bg-rail__foot{border-top:1px solid rgba(255,255,255,.08);padding:8px;display:flex;flex-direction:column;gap:1px}
.bg-nav{position:relative;display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;padding:8px 10px;border-radius:5px;color:#B9C3D2;font:600 13px var(--font-body);cursor:pointer;text-align:left;white-space:nowrap}
.bg-nav:hover{background:rgba(255,255,255,.06);color:#F3EFE6}
.bg-nav.on{background:linear-gradient(90deg,rgba(176,141,79,.30),rgba(176,141,79,.12));color:#F6EBD0}
.bg-nav.on::before,.bg-comm.on::before{content:'';position:absolute;left:0;top:7px;bottom:7px;width:3px;border-radius:2px;background:#C9A96A}
.bg-nav svg{flex-shrink:0}
.bg-sec{padding:18px 10px 6px;font:700 10.5px var(--font-body);letter-spacing:.14em;text-transform:uppercase;color:#8896AB;white-space:nowrap}
.bg-comms{display:flex;flex-direction:column;gap:1px}
.bg-comm{position:relative;display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;padding:6px 10px;border-radius:5px;color:#B9C3D2;font:600 13px var(--font-body);cursor:pointer;text-align:left}
.bg-comm:hover{background:rgba(255,255,255,.06);color:#F3EFE6}.bg-comm.on{background:linear-gradient(90deg,rgba(176,141,79,.30),rgba(176,141,79,.12));color:#F6EBD0}
.bg-comm .init{width:20px;height:20px;border-radius:4px;background:rgba(255,255,255,.08);color:#C8D0DC;display:flex;align-items:center;justify-content:center;font:800 10.5px var(--font-body);flex-shrink:0}
.bg-comm.on .init{background:#C9A96A;color:#1B2A41}
.bg-comm .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bg-comm .ct{font:700 11.5px var(--font-body);color:#8896AB;font-variant-numeric:tabular-nums}.bg-comm.on .ct{color:#E6D3A8}
.bg-nav:focus-visible,.bg-comm:focus-visible,.bg-avatar:focus-visible,.bg-btn:focus-visible,.bg-burger:focus-visible{outline:2px solid #C9A96A;outline-offset:-2px}
.bg-app.is-collapsed .bg-rail{width:60px}
.bg-app.is-collapsed .lbl,.bg-app.is-collapsed .bg-rail__name{display:none}
.bg-app.is-collapsed .bg-nav,.bg-app.is-collapsed .bg-comm{justify-content:center;padding-left:0;padding-right:0}
.bg-app.is-collapsed .bg-rail__brand{justify-content:center;padding:16px 0 14px}.bg-app.is-collapsed .bg-sec{height:1px;background:rgba(255,255,255,.08);margin:10px 8px 8px;padding:0}
.bg-col{flex:1;min-width:0;display:flex;flex-direction:column}
.bg-top{position:sticky;top:0;z-index:30;height:56px;display:flex;align-items:center;gap:12px;padding:0 22px;background:rgba(232,227,218,.86);backdrop-filter:blur(8px);border-bottom:1px solid #D2CABB}
.bg-main{flex:1;min-width:0}
.bg-avatar{width:32px;height:32px;border-radius:50%;border:1px solid #C9A96A;background:#1B2A41;color:#F3EFE6;font:800 11.5px var(--font-body);cursor:pointer}
.bg-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #C6BDAC;background:#F8F6F1;border-radius:6px;padding:6px 11px;font:700 12px var(--font-body);color:#1F2A3C;cursor:pointer}
.bg-menu{position:absolute;right:0;top:42px;width:232px;background:#F8F6F1;border:1px solid #D2CABB;border-radius:8px;box-shadow:0 12px 30px rgba(40,32,18,.18);padding:6px;z-index:60}
.bg-menu .who{padding:8px 10px 10px;border-bottom:1px solid #E1DACD;margin-bottom:4px}.bg-menu .who small{font:600 11px var(--font-body);color:#6C7280}.bg-menu .who div{font:700 13px var(--font-body);overflow:hidden;text-overflow:ellipsis}
.bg-menu button{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;padding:8px 10px;border-radius:5px;font:600 13px var(--font-body);color:#1F2A3C;cursor:pointer;text-align:left}.bg-menu button:hover{background:#EFEBE2}
.bg-burger{display:none;border:0;background:transparent;padding:6px;border-radius:6px;color:#1F2A3C;cursor:pointer}
.bg-scrim{position:fixed;inset:0;background:rgba(27,42,65,.45);z-index:35}
@media (max-width:960px){
  .bg-rail{position:fixed;left:0;top:0;transform:translateX(-100%);transition:transform .18s ease;width:260px!important;box-shadow:0 0 40px rgba(20,16,8,.35)}
  .bg-app.is-drawer .bg-rail{transform:none}
  .bg-app.is-collapsed .lbl,.bg-app.is-collapsed .bg-rail__name{display:revert}
  .bg-app.is-collapsed .bg-nav,.bg-app.is-collapsed .bg-comm{justify-content:flex-start;padding:8px 10px}
  .bg-collapse{display:none}.bg-burger{display:inline-flex}.bg-top{padding:0 12px}
}
@keyframes spin{to{transform:rotate(360deg)}}
`;
