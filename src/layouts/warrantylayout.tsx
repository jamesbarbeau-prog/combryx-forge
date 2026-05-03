import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useauth';

const today = new Date().toLocaleDateString('en-CA', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
});

const NAV = [
  { id: 'today',       label: 'Today',       path: '/warranty/today'       },
  { id: 'communities', label: 'Portfolio',    path: '/warranty/communities' },
  { id: 'cases',       label: 'Cases',        path: '/warranty/cases'       },
  { id: 'work-orders', label: 'Work Orders',  path: '/warranty/work-orders' },
  { id: 'po-requests', label: 'PO Approvals', path: '/warranty/po-requests' },
  { id: 'reports',     label: 'Reports',      path: '/warranty/reports'     },
  { id: 'settings',    label: 'Settings',     path: '/warranty/settings'    },
];

export default function WarrantyLayout() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { signOut } = useAuth();
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstall,   setShowInstall]   = useState(false);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e); setShowInstall(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setShowInstall(false);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-canvas)', fontFamily: 'var(--font-body)' }}>

      {/* ── TOP NAV ── */}
      <div style={{
        borderBottom: '1px solid rgba(252,226,5,0.10)',
        background: 'radial-gradient(ellipse at top left, #4A4D52 0%, #3A3C40 40%, #2E3033 100%)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
        padding: '0 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 56, position: 'sticky', top: 0, zIndex: 50,
      }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: 'linear-gradient(135deg, #FCE205 0%, #D4A800 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#111' }}>W</span>
            </div>
            <div>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#FCE205', letterSpacing: '-0.02em' }}>Combryx</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#FFFFFF', marginLeft: 6, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Warranty</span>
            </div>
          </div>

          <div style={{ width: 1, height: 20, background: 'rgba(252,226,5,0.15)' }} />

          {/* Nav */}
          {NAV.map(n => {
            const active =
              location.pathname === n.path ||
              (n.id === 'communities' && (location.pathname.startsWith('/warranty/communities') || location.pathname.startsWith('/warranty/lots'))) ||
              (n.id === 'cases' && location.pathname.startsWith('/warranty/cases')) ||
              (n.id !== 'today' && n.id !== 'communities' && n.id !== 'cases' && location.pathname.startsWith(n.path));

            return (
              <button
                key={n.id}
                onClick={() => navigate(n.path)}
                style={{
                  padding: '6px 10px', borderRadius: 6, fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  background: active ? 'rgba(252,226,5,0.15)' : 'transparent',
                  border: active ? '1px solid rgba(252,226,5,0.30)' : '1px solid transparent',
                  color: active ? '#FCE205' : 'rgba(255,255,255,0.85)',
                  cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.12s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#FFFFFF'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}
              >
                {n.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showInstall && (
            <button onClick={installApp} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
              background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)',
              color: '#16A34A', cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}>
              Install App
            </button>
          )}

          <div style={{
            fontSize: 11, color: 'rgba(255,255,255,0.4)',
            padding: '5px 10px', borderRadius: 6,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {today}
          </div>

          <button
            onClick={signOut}
            style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 11,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
              color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      <Outlet />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}