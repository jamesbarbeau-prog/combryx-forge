import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { LayoutDashboard, Building2, FolderOpen, Scale, Wrench, ClipboardCheck, BarChart3, Settings, LogOut, Download, ChevronDown } from 'lucide-react';
import { useAuth } from '@/hooks/useauth';
import { supabase } from '@/lib/supabase';
import { BrandMark } from '@/components/brand';
import QuickSearch from '@/components/quicksearch';

interface CommCount { community_id: string; name: string; lots: number; open_cases: number; open_items: number }
const COMM_COLORS = ['#1E5FC8', '#16A34A', '#F2B134', '#7C3AED', '#D64B3A', '#0891B2', '#EA580C', '#0D9488', '#65A30D'];

function CommunitySidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [rows, setRows] = useState<CommCount[]>([]);
  useEffect(() => { supabase.rpc('community_counts').then(({ data }) => setRows((data ?? []) as CommCount[])); }, []);
  const activeId = /^\/warranty\/communities\/([^/]+)/.exec(pathname)?.[1];
  return (
    <aside className="bg-side" aria-label="Communities">
      <div className="bg-side__h">Communities</div>
      {rows.map((c, i) => (
        <button key={c.community_id} className={`bg-side__i${activeId === c.community_id ? ' on' : ''}`} onClick={() => navigate(`/warranty/communities/${c.community_id}`)}>
          <span className="dot" style={{ background: COMM_COLORS[i % COMM_COLORS.length] }} />
          <span className="nm">{c.name}<small>{c.lots} homes</small></span>
          <span className="ct" title={`${c.open_cases} open cases`}>{c.open_cases}</span>
        </button>
      ))}
    </aside>
  );
}

const today = new Date().toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });

const NAV = [
  { id: 'today',        label: 'Dashboard',        path: '/warranty/today',        icon: LayoutDashboard },
  { id: 'communities',  label: 'Communities',  path: '/warranty/communities',  icon: Building2 },
  { id: 'cases',        label: 'Cases',        path: '/warranty/cases',        icon: FolderOpen },
  { id: 'conciliation', label: 'Conciliation', path: '/warranty/conciliation', icon: Scale },
  { id: 'work-orders',  label: 'Work orders',  path: '/warranty/work-orders',  icon: Wrench },
  { id: 'po-requests',  label: 'PO approvals', path: '/warranty/po-requests',  icon: ClipboardCheck },
  { id: 'reports',      label: 'Reports',      path: '/warranty/reports',      icon: BarChart3 },
  { id: 'settings',     label: 'Tarion & settings', path: '/warranty/settings', icon: Settings },
];

function isActive(id: string, path: string, pathname: string) {
  if (id === 'communities') return pathname.startsWith('/warranty/communities') || pathname.startsWith('/warranty/lots');
  return pathname === path || pathname.startsWith(path + '/');
}

export default function WarrantyLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? '')); }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => setMenu(false), [location.pathname]);

  async function installApp() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  }

  const initials = (email.split('@')[0] || '?').split(/[._-]/).map(s => s[0]).join('').slice(0, 2).toUpperCase() || '?';

  return (
    <div className="bg-shell" style={{ fontFamily: 'var(--font-body)' }}>
      <style>{`
        .bg-shell { background-color: #EDF1F8;
          background-image: linear-gradient(rgba(30,64,130,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(30,64,130,0.035) 1px, transparent 1px); background-size: 26px 26px; min-height: 100vh; }
        .bg-banner { position: sticky; top: 0; z-index: 50; background: linear-gradient(100deg, #0E2250 0%, #17448F 55%, #2166C2 100%); border-bottom: 4px solid #F2B134; box-shadow: 0 6px 22px rgba(11,19,43,0.18); }
        .bg-banner__in { max-width: 1480px; margin: 0 auto; padding: 14px 28px; display: flex; align-items: center; gap: 22px; }
        .bg-brandbar { width: 4px; align-self: stretch; background: #F2B134; border-radius: 2px; }
        .bg-nav { background: #fff; border-bottom: 1px solid #DDE5F1; }
        .bg-nav__in { max-width: 1480px; margin: 0 auto; padding: 0 22px; display: flex; align-items: stretch; gap: 2px; overflow-x: auto; scrollbar-width: none; }
        .bg-nav__in::-webkit-scrollbar { display: none; }
        .bg-link { position: relative; display: flex; align-items: center; gap: 8px; padding: 13px 14px; border: 0; background: transparent; color: #475569; font: 600 13px var(--font-body); cursor: pointer; white-space: nowrap; transition: color .12s, background .12s; }
        .bg-link:hover { color: #0F172A; background: #F4F7FB; }
        .bg-link.on { color: #1D4ED8; }
        .bg-link.on::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: -1px; height: 3px; border-radius: 3px 3px 0 0; background: #2563EB; }
        .bg-link:focus-visible, .bg-chip:focus-visible, .bg-menu-item:focus-visible { outline: 2px solid #F2B134; outline-offset: -2px; }
        .bg-chip { display: flex; align-items: center; gap: 8px; padding: 5px 9px 5px 5px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.10); color: #fff; font: 600 12.5px var(--font-body); cursor: pointer; }
        .bg-chip:hover { background: rgba(255,255,255,0.18); }
        .bg-menu { position: absolute; right: 0; top: 46px; width: 236px; background: #fff; border: 1px solid var(--color-border); border-radius: 12px; box-shadow: 0 16px 40px rgba(11,19,43,0.25); padding: 6px; z-index: 60; }
        .bg-menu-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: 0; border-radius: 8px; background: transparent; color: #0F172A; font: 600 13px var(--font-body); cursor: pointer; text-align: left; }
        .bg-menu-item:hover { background: #EEF2F8; }
        @media (max-width: 760px) { .bg-banner__in { padding: 10px 14px; gap: 12px; flex-wrap: wrap; } .bg-title { display: none; } .bg-date { display: none; } }
        .bg-body { max-width: 1760px; margin: 0 auto; display: flex; align-items: flex-start; }
        .bg-main { flex: 1; min-width: 0; }
        .bg-side { position: sticky; top: 92px; width: 224px; flex-shrink: 0; margin: 20px 0 20px 20px; background: #fff; border: 1px solid #DDE5F1; border-radius: 16px; padding: 10px; box-shadow: 0 1px 2px rgba(11,19,43,0.04); max-height: calc(100vh - 112px); overflow: auto; }
        .bg-side__h { font: 800 10.5px var(--font-body); letter-spacing: .18em; text-transform: uppercase; color: #7B8AA0; padding: 6px 10px 8px; }
        .bg-side__i { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; background: transparent; padding: 9px 10px; border-radius: 10px; cursor: pointer; text-align: left; font-family: var(--font-body); }
        .bg-side__i:hover { background: #F1F5FB; } .bg-side__i.on { background: #E8F0FF; box-shadow: inset 3px 0 0 #2563EB; }
        .bg-side__i .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .bg-side__i .nm { flex: 1; min-width: 0; font: 700 13px var(--font-body); color: #0F172A; line-height: 1.2; } .bg-side__i .nm small { display: block; font: 500 11px var(--font-body); color: #7B8AA0; }
        .bg-side__i .ct { font: 800 11.5px var(--font-body); color: #1D4ED8; background: #DBEAFE; border-radius: 999px; padding: 2px 8px; font-variant-numeric: tabular-nums; }
        @media (max-width: 960px) { .bg-body { display: block; } .bg-side { position: static; width: auto; margin: 12px; display: flex; gap: 6px; overflow-x: auto; max-height: none; } .bg-side__h { display: none; } .bg-side__i { width: auto; white-space: nowrap; } .bg-side__i .nm small { display: none; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <header className="bg-banner">
        <div className="bg-banner__in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, cursor: 'pointer' }} onClick={() => navigate('/warranty/today')}>
            <div className="bg-brandbar" style={{ height: 44 }} />
            <BrandMark size={40} />
            <div className="bg-title">
              <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.02em', color: '#fff', textTransform: 'uppercase', lineHeight: 1.1 }}>Builder Guardian</div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', color: '#F2B134', textTransform: 'uppercase', marginTop: 4 }}>Warranty control centre</div>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <QuickSearch />
          <span className="bg-date" style={{ fontSize: 12.5, color: '#C9D8F5', fontWeight: 600 }}>{today}</span>
          {installPrompt && <button className="bg-chip" onClick={installApp} style={{ padding: '7px 13px' }}><Download size={14} /> Install</button>}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button className="bg-chip" onClick={() => setMenu(v => !v)} aria-haspopup="menu" aria-expanded={menu}>
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#F2B134', color: '#0B132B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11.5 }}>{initials}</span>
              <ChevronDown size={14} />
            </button>
            {menu && (
              <div className="bg-menu" role="menu">
                <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--color-border)', marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 600 }}>Signed in as</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email || '—'}</div>
                </div>
                <button className="bg-menu-item" role="menuitem" onClick={() => navigate('/warranty/settings')}><Settings size={15} /> Settings</button>
                <button className="bg-menu-item" role="menuitem" onClick={signOut}><LogOut size={15} /> Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="bg-nav">
        <nav className="bg-nav__in" aria-label="Main">
          {NAV.map(n => {
            const on = isActive(n.id, n.path, location.pathname);
            const Icon = n.icon;
            return (
              <button key={n.id} className={`bg-link${on ? ' on' : ''}`} onClick={() => navigate(n.path)} aria-current={on ? 'page' : undefined}>
                <Icon size={16} strokeWidth={2} />{n.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="bg-body"><CommunitySidebar /><main className="bg-main"><Outlet /></main></div>
    </div>
  );
}
